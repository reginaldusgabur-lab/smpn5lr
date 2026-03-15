'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, QrCode, BookCheck, Settings } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

const adminNavItems = [
  { href: '/dashboard', icon: Home, label: 'Beranda' },
  { href: '/dashboard/admin/users', icon: Users, label: 'Pengguna' },
  { href: '/dashboard/pengaturan-absen', icon: QrCode, label: 'Pengaturan Absen' },
  { href: '/dashboard/laporan-sekolah', icon: BookCheck, label: 'Laporan Sekolah' },
  { href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {adminNavItems.map((item) => {
        const isActive = 
          item.href === '/dashboard'
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/');

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
  );
}
