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
import { Settings, ShieldAlert, BookOpen, UserCircle, TrendingUp, QrCode, FileText, Zap, AlertTriangle, Power } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { ModeToggle } from '@/components/theme-toggle';
import { NetworkStatusDot } from './NetworkStatusDot';

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
                    <button className="flex items-center gap-3 focus:outline-none rounded-full p-1 -ml-1 sm:p-0 sm:ml-0 group">
                        <Avatar className="h-9 w-9 border border-primary/10 shadow-sm transition-transform group-active:scale-95">
                            <AvatarImage src={currentPhoto ?? undefined} alt="Avatar" />
                            <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="hidden sm:flex flex-col justify-center text-left">
                            <p className="text-sm font-bold leading-none tracking-tight">{displayName || 'Pengguna'}</p>
                            <p className="text-[10px] tracking-widest leading-none text-muted-foreground mt-1.5 font-black uppercase opacity-60">{displayRole || 'User'}</p>
                        </div>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 rounded-2xl p-2 shadow-2xl border-none">
                    <DropdownMenuLabel className="font-normal px-4 py-4">
                        <div className="flex items-center gap-3">
                            <UserCircle className="h-5 w-5 text-primary opacity-40" />
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-black leading-none text-primary">{displayName || 'Pengguna'}</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    {displayRole || 'User'}
                                </p>
                            </div>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="mx-2 opacity-50" />
                    <DropdownMenuItem 
                        onClick={() => router.push('/dashboard/pengaturan')}
                        className="rounded-xl cursor-pointer py-3 px-4 focus:bg-primary/5 group"
                    >
                        <Settings className="mr-3 h-4 w-4 text-primary transition-transform group-hover:rotate-45" />
                        <span className="text-sm font-bold">Pengaturan</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="mx-2 opacity-50" />
                    <DropdownMenuItem 
                        onClick={handleLogout} 
                        className="rounded-xl cursor-pointer py-3 px-4 text-destructive focus:bg-destructive/5 focus:text-destructive group"
                    >
                        <Power className="mr-3 h-4 w-4 transition-transform group-hover:scale-110" />
                        <span className="text-sm font-black uppercase tracking-wider">Keluar</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )}
        <ModeToggle />
      </div>

      <div className="flex items-center gap-4">
        <NetworkStatusDot />
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border-none shadow-2xl">
            <DialogHeader className="border-b border-muted-foreground/10 pb-4">
              <DialogTitle className="flex items-center gap-3 text-primary">
                  <BookOpen className="h-6 w-6" />
                  <span className="font-black text-xl tracking-tight uppercase">Sistem E-SPENLI 2026</span>
              </DialogTitle>
              <DialogDescription className="text-left font-bold text-xs text-muted-foreground">
                Panduan fitur aplikasi absensi digital SMPN 5 Langke Rembong.
              </DialogDescription>
            </DialogHeader>
            
            <div className="text-sm space-y-6 py-4 pr-2 text-left">
              <section className="space-y-2">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                      <UserCircle className="h-4 w-4 text-primary" />
                      1. Akses & Login
                  </div>
                  <p className="text-muted-foreground pl-6 leading-relaxed text-xs font-medium">
                      Masuk menggunakan <strong>Email dan Kata Sandi</strong> terdaftar. Anda dapat memperbarui profil dan mengganti sandi secara mandiri di menu Pengaturan. Jika lupa sandi, Admin dapat membantu melakukan reset secara manual.
                  </p>
              </section>

              <section className="space-y-2">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      2. Beranda & Skor Progres
                  </div>
                  <p className="text-muted-foreground pl-6 leading-relaxed text-xs font-medium">
                      Menampilkan jam digital dan <strong>Skor Progres Bulanan</strong>. Skor ini menunjukkan akumulasi poin kehadiran Anda yang akan terus meningkat secara bertahap menuju 100% hingga akhir bulan.
                  </p>
              </section>

              <section className="space-y-2">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                      <QrCode className="h-4 w-4 text-primary" />
                      3. Absensi QR Code
                  </div>
                  <p className="text-muted-foreground pl-6 leading-relaxed text-xs font-medium">
                      Lakukan scan QR Code resmi sekolah. Sistem memvalidasi absensi berdasarkan <strong>Radius Lokasi Sekolah (GPS)</strong> dan rentang waktu yang telah ditetapkan Admin.
                  </p>
              </section>

              <section className="space-y-2">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                      <FileText className="h-4 w-4 text-primary" />
                      4. Rincian Poin Laporan
                  </div>
                  <div className="text-muted-foreground pl-6 space-y-2 leading-relaxed">
                      <p className="text-xs font-medium">Setiap aktivitas harian menyumbang poin ke skor progres Anda:</p>
                      <ul className="list-disc pl-5 space-y-1 text-[11px] font-bold">
                          <li>Hadir Penuh / Dinas: 1.0 Poin</li>
                          <li>Terlambat / Izin Pulang Cepat: 0.95 Poin</li>
                          <li>Sakit: 0.9 Poin</li>
                          <li>Izin Pribadi: 0.7 Poin</li>
                          <li>Hanya Absen Masuk/Pulang saja: 0.5 Poin</li>
                      </ul>
                  </div>
              </section>

              <section className="space-y-2">
                  <div className="flex items-center gap-2 font-bold text-foreground text-green-600">
                      <Zap className="h-4 w-4" />
                      5. Tips Penggunaan Lancar
                  </div>
                  <div className="text-muted-foreground pl-6 space-y-2 leading-relaxed">
                      <p className="text-xs font-medium">Agar absensi di sekolah super cepat dan instan:</p>
                      <ul className="list-disc pl-5 space-y-2 text-[11px] font-bold">
                          <li>
                            <strong>Pre-Loading:</strong> Sebelum berangkat sekolah, buka aplikasi sebentar di rumah lalu tekan tombol home HP Anda. Ini memastikan data sekolah sudah siap di HP sehingga saat sampai di sekolah proses scan menjadi instan.
                          </li>
                          <li><strong>Koneksi:</strong> Pastikan paket data aktif dan sinyal stabil saat melakukan scanning.</li>
                          <li><strong>GPS Aktif:</strong> Aktifkan GPS HP Anda beberapa saat sebelum memasuki area sekolah agar posisi cepat terkunci.</li>
                      </ul>
                  </div>
              </section>

              <div className="pt-4 border-t border-muted-foreground/10 flex items-start gap-3 bg-primary/5 p-4 rounded-xl">
                  <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-primary leading-tight">
                      Kejujuran adalah kunci. Sistem verifikasi otomatis lokasi dan waktu diaktifkan untuk menjaga integritas data di SMPN 5 Langke Rembong.
                  </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
