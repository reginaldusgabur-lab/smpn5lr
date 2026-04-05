'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, QrCode, ClipboardCheck, Settings, FileText } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

const headmasterNavItems = [
  { id: 'nav-beranda', href: '/dashboard', icon: Home, label: 'Beranda' },
  { id: 'nav-absen', href: '/dashboard/absen', icon: QrCode, label: 'Absen' },
  {
    id: 'nav-izin-kepsek',
    href: '/dashboard/izin-kepala-sekolah',
    icon: ClipboardCheck,
    label: 'Persetujuan Izin',
  },
  {
    id: 'nav-laporan',
    href: '/dashboard/laporan-staf',
    icon: FileText,
    label: 'Laporan Staf',
  },
  { id: 'nav-pengaturan', href: '/dashboard/pengaturan', icon: Settings, label: 'Pengaturan' },
];

export function KepalaSekolahNav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {headmasterNavItems.map((item) => {
        const isActive = 
          item.href === '/dashboard'
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className="justify-start"
            >
              <Link href={item.href} id={item.id}>
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
