'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCheck, Users, FileWarning } from 'lucide-react';

interface StatCardsProps {
  stats: {
    staffPresentToday: number;
    totalStaff: number;
    pendingLeaveRequestsCount: number;
    totalUsers: number;
    kepalaSekolahCount: number;
    guruCount: number;
    pegawaiCount: number;
    siswaCount: number;
  };
}

export const StatCards = ({ stats }: StatCardsProps) => (
  <div className="space-y-6">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Guru & Staf Hadir</CardTitle>
        <UserCheck className="h-5 w-5 text-green-500" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{stats.staffPresentToday}<span className="text-xl font-normal text-muted-foreground">/{stats.totalStaff}</span></div>
        <p className="text-xs text-muted-foreground">Total guru & staf yang tercatat masuk hari ini</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Permintaan Izin Tertunda</CardTitle>
        <FileWarning className="h-5 w-5 text-amber-500" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{stats.pendingLeaveRequestsCount}</div>
        <p className="text-xs text-muted-foreground">Permintaan izin/sakit menunggu persetujuan</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Total Pengguna Aktif</CardTitle>
        <Users className="h-5 w-5 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{stats.totalUsers}</div>
        <p className="text-xs text-muted-foreground">{stats.kepalaSekolahCount} Kepsek, {stats.guruCount} Guru, {stats.pegawaiCount} Pegawai, {stats.siswaCount} Siswa</p>
      </CardContent>
    </Card>
  </div>
);
