
'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useUser, useDoc, useFirestore, useMemoFirebase, useAuth } from '@/firebase';
import { doc } from 'firebase/firestore';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LogOut, Settings, ShieldAlert } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { ModeToggle } from '@/components/theme-toggle';

export function Header({ isTransparent }: { isTransparent?: boolean }) {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  const userDocRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData, isLoading: isUserDataLoading } = useDoc<{ name: string, role: string, photoURL?: string }>(user, userDocRef);

  const handleLogout = () => {
    if (!auth) return;
    signOut(auth).then(() => {
      router.push('/');
    }).catch((error) => {
      console.error("Gagal melakukan logout:", error);
      router.push('/');
    });
  };

  const getInitials = (name: string | undefined | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  const displayName = user?.displayName || userData?.name;
  
  const getDisplayRole = () => {
    if (userData?.role) {
      return userData.role.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return "";
  }
  const displayRole = getDisplayRole();
  const currentPhoto = userData?.photoURL || user?.photoURL;
  const isProfileLoading = isUserLoading || isUserDataLoading;

  const headerClasses = `
    fixed top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-background px-4 sm:px-6
    transition-opacity duration-300
    sm:left-[16rem] sm:w-[calc(100%-16rem)]
    ${isTransparent ? 'opacity-0 pointer-events-none' : 'opacity-100'}
  `;

  return (
    <header className={headerClasses}>
      <div className="flex items-center gap-3">
        {isProfileLoading && !displayName ? (
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="hidden sm:flex flex-col gap-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                </div>
            </div>
        ) : (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 focus:outline-none rounded-full p-1 -ml-1 sm:p-0 sm:ml-0">
                        <Avatar className="h-9 w-9 border shadow-sm">
                            <AvatarImage src={currentPhoto ?? undefined} alt="Avatar" />
                            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="hidden sm:flex flex-col justify-center text-left">
                            <p className="text-sm font-medium leading-none">{displayName || 'Pengguna'}</p>
                            <p className="text-[10px] tracking-wide leading-none text-muted-foreground mt-1 font-bold">{displayRole || 'User'}</p>
                        </div>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{displayName || 'Pengguna'}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {displayRole || 'User'}
                        </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link href="/dashboard/pengaturan">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Pengaturan</span>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Keluar</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )}
        <ModeToggle />
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full transition-transform active:scale-95">
            <Image
              src={appLogo?.imageUrl || '/logo-3d-v2.png'}
              alt="App Logo"
              width={36}
              height={36}
              priority
              data-ai-hint="app logo"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-6 w-6 text-destructive" />
                <span className="font-bold">Aturan & Penegasan Absensi</span>
            </DialogTitle>
            <DialogDescription className="pt-4 text-left">
              Aplikasi ini adalah alat resmi untuk mencatat kehadiran. Pelanggaran terhadap aturan berikut akan dikenakan sanksi sesuai kebijakan sekolah.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-4 text-left">
            <div className="font-bold text-foreground">1. Kejujuran adalah Segalanya</div>
            <p className="text-muted-foreground pl-4">
              Setiap pengguna bertanggung jawab penuh atas kebenaran data absensinya. Tindakan manipulasi atau pemalsuan data adalah pelanggaran berat.
            </p>
            <div className="font-bold text-foreground">2. Tepat Waktu</div>
            <p className="text-muted-foreground pl-4">
              Lakukan absensi masuk dan pulang sesuai dengan rentang waktu yang telah ditetapkan. Keterlambatan akan tercatat otomatis.
            </p>
            <div className="font-bold text-foreground">3. QR Code Bersifat Rahasia</div>
            <p className="text-muted-foreground pl-4">
              Dilarang keras membagikan atau menyalahgunakan QR Code absensi. Pelanggaran akan ditindaklanjuti.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
