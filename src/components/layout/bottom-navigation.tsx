'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, QrCode, FileText, Users, MailCheck, ClipboardCheck, BookCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

const defaultNavItems = [
  { href: '/dashboard', icon: Home, label: 'Beranda' },
  { href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/izin', icon: MailCheck, label: 'Izin' },
  { href: '/dashboard/laporan', icon: FileText, label: 'Laporan' },
];

const adminNavItems = [
  { href: '/dashboard', icon: Home, label: 'Beranda' },
  { href: '/dashboard/admin/users', icon: Users, label: 'Pengguna' },
  { href: '/dashboard/admin/konfigurasi', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/laporan-sekolah', icon: BookCheck, label: 'Laporan' }, // CORRECTED
];

const headmasterNavItems = [
  { href: '/dashboard', icon: Home, label: 'Beranda' },
  { href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/izin-kepala-sekolah', icon: ClipboardCheck, label: 'Persetujuan' },
  { href: '/dashboard/laporan-sekolah', icon: BookCheck, label: 'Laporan' }, // CORRECTED
];

export function BottomNavigation() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData } = useDoc<{ name: string, role: string }>(user, userDocRef);
  
  const isAdmin = userData?.role === 'admin';
  const isHeadmaster = userData?.role === 'kepala_sekolah';

  let navItems;
  if (isAdmin) {
    navItems = adminNavItems;
  } else if (isHeadmaster) {
    navItems = headmasterNavItems;
  } else {
    navItems = defaultNavItems;
  }

  return (
    <div className="sm:hidden fixed bottom-0 left-0 z-50 w-full h-16 bg-card border-t">
        <div className="flex h-full items-stretch">
            {navItems.map((item) => {
                const isActive = item.href === '/dashboard' 
                    ? pathname === item.href 
                    : pathname.startsWith(item.href);

                return (
                    <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                            'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                            isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary/90'
                        )}
                    >
                        <item.icon className="h-5 w-5" />
                        <span className="text-center">{item.label}</span>
                    </Link>
                );
            })}
        </div>
    </div>
  );
}
