'use client';

import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import GuruDashboardPage from './guru/page';
import PegawaiDashboardPage from './pegawai/page';
import SiswaDashboardPage from './siswa/page';
import AdminDashboardPage from './admin/page';
import KepalaSekolahDashboardPage from './kepala_sekolah/page';

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  // --- Conditional Rendering based on Role ---
  switch (user.role) {
    case 'guru':
      return <GuruDashboardPage />;
    case 'pegawai':
      return <PegawaiDashboardPage />;
    case 'siswa':
      return <SiswaDashboardPage />;
    case 'admin':
      return <AdminDashboardPage />;
    case 'kepala_sekolah':
        return <KepalaSekolahDashboardPage />;
    default:
      // Handle unknown roles or redirect
      router.replace('/');
      return null;
  }
}
