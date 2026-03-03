'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, QrCode, FileText, Users, MailCheck, ClipboardCheck } from 'lucide-react';
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
  { href: '/dashboard/admin', icon: Home, label: 'Beranda' },
  { href: '/dashboard/admin/users', icon: Users, label: 'Pengguna' },
  { href: '/dashboard/admin/konfigurasi', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/admin/laporan', icon: FileText, label: 'Laporan' },
];

const headmasterNavItems = [
  { href: '/dashboard/kepala_sekolah', icon: Home, label: 'Beranda' },
  { href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/admin/izin', icon: ClipboardCheck, label: 'Persetujuan' },
  { href: '/dashboard/admin/laporan', icon: FileText, label: 'Laporan' },
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
  let gridColsClass;

  if (isAdmin) {
    navItems = adminNavItems;
    gridColsClass = 'grid-cols-4';
  } else if (isHeadmaster) {
    navItems = headmasterNavItems;
    gridColsClass = 'grid-cols-4';
  } else {
    navItems = defaultNavItems;
    gridColsClass = 'grid-cols-4';
  }

  return (
    <div className="sm:hidden fixed bottom-0 left-0 z-50 w-full h-16 bg-card border-t border-border">
        <div className={cn("grid h-full max-w-lg mx-auto font-medium", gridColsClass)}>
            {navItems.map((item) => {
                const isBeranda = item.label === 'Beranda';
                let isActive;

                if (isBeranda) {
                  // Logika baru: Anggap aktif jika path saat ini adalah halaman utama dasbor sesuai peran pengguna.
                  const userHomePage = userData?.role ? `/dashboard/${userData.role}` : null;
                  isActive = userHomePage ? pathname === userHomePage : pathname === '/dashboard';
                } else {
                  // Logika lama yang sudah benar untuk halaman lain.
                  isActive = pathname.startsWith(item.href);
                }

                return (
                    <Link
                        key={item.label}
                        href={item.href} // href tidak diubah, redirector akan menangani /dashboard
                        className={cn(
                            'inline-flex flex-col items-center justify-center px-5 hover:bg-muted group transition-colors duration-200',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                        )}
                    >
                        <item.icon className="w-5 h-5 mb-1" />
                        <span className="text-xs text-center">{item.label}</span>
                    </Link>
                );
            })}
        </div>
    </div>
  );
}
