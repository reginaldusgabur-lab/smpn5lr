'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  QrCode,
  FileText,
  Settings,
  Users,
  MailCheck,
  ClipboardCheck,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

const defaultNavItems = [
  { href: '/dashboard', icon: Home, label: 'Beranda' },
  { href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/izin', icon: MailCheck, label: 'Izin' },
  { href: '/dashboard/laporan', icon: FileText, label: 'Laporan' },
  { href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const adminNavItems = [
  { href: '/dashboard/admin', icon: Home, label: 'Beranda' },
  { href: '/dashboard/admin/users', icon: Users, label: 'Pengguna' },
  { href: '/dashboard/admin/konfigurasi', icon: QrCode, label: 'Pengaturan Absen' },
  { href: '/dashboard/admin/laporan', icon: FileText, label: 'Laporan' },
  { href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const headmasterNavItems = [
    { href: '/dashboard/kepala_sekolah', icon: Home, label: 'Beranda' },
    { href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
    { href: '/dashboard/admin/izin', icon: ClipboardCheck, label: 'Persetujuan Izin' },
    { href: '/dashboard/admin/laporan', icon: FileText, label: 'Laporan Sekolah' },
    { href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const homepaths = [
    '/dashboard',
    '/dashboard/guru',
    '/dashboard/pegawai',
    '/dashboard/siswa',
    '/dashboard/admin',
    '/dashboard/kepala_sekolah',
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData } = useDoc<{ role: string }>(user, userDocRef);

  const isAdmin = userData?.role === 'admin';
  const isHeadmaster = userData?.role === 'kepala_sekolah';

  let navItems = defaultNavItems;
  if (isAdmin) {
    navItems = adminNavItems;
  } else if (isHeadmaster) {
    navItems = headmasterNavItems;
  }

  return (
    <Sidebar
      className="hidden sm:flex border-r"
      style={{
        '--sidebar-width': '16rem',
      } as React.CSSProperties}
    >
      <SidebarContent className="p-2 pt-4 flex flex-col">
        <SidebarMenu>
          {navItems.map((item) => {
            const isBerandaItem = item.label === 'Beranda';
            const isHomepage = homepaths.includes(pathname);
            
            let isActive = false;
            if (isBerandaItem) {
                isActive = isHomepage;
            } else {
                isActive = pathname.startsWith(item.href) && !homepaths.includes(pathname);
            }
            
            if (item.href === '/dashboard/pengaturan') {
                isActive = pathname.startsWith(item.href);
            }
            
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className="justify-start"
                >
                  <Link href={item.href}>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
         <div className="mt-auto p-2 text-center text-xs text-muted-foreground">
            ©smpn5lr 2026
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
