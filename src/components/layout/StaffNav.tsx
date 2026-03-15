'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, QrCode, MailCheck, FileText, Settings } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

const defaultNavItems = [
  { href: '/dashboard', icon: Home, label: 'Beranda' },
  { href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  { href: '/dashboard/izin', icon: MailCheck, label: 'Izin' },
  { href: '/dashboard/laporan', icon: FileText, label: 'Laporan' },
  { href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

export function StaffNav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {defaultNavItems.map((item) => {
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
