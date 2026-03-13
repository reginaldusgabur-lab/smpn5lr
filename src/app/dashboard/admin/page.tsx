'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserCheck, Users, FileWarning, ShieldAlert, FileText } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMemo, useEffect, useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, Timestamp, getDocs, type DocumentData, collectionGroup } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { startOfDay, endOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default', 'Sakit': 'destructive', 'Izin': 'secondary', 'Terlambat': 'outline',
}

const AdminDashboardSkeletons = () => (
    <div className="space-y-6">
        <div className="space-y-1">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-3/4 !mt-2" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                             <div key={i} className="flex items-center space-x-4 p-2 border-b">
                                <Skeleton className="h-4 w-1/3 flex-1" />
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
            <div className="space-y-6">
                 {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-5 w-5 rounded-full" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-1/4" />
                            <Skeleton className="h-3 w-3/4 mt-1" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    </div>
);


export default function AdminDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  // --- Data Fetching ---
  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isRoleCheckLoading = isUserLoading || isUserDataLoading;
  const isAdmin = !isRoleCheckLoading && userData?.role === 'admin';

  const allUsersQuery = useMemoFirebase(() => (isAdmin && firestore) ? collection(firestore, 'users') : null, [firestore, isAdmin]);
  const { data: usersData, isLoading: isUsersLoading } = useCollection(user, allUsersQuery);
  
  const [dashboardData, setDashboardData] = useState({
    allAttendanceData: [] as DocumentData[],
    pendingLeaveRequests: [] as DocumentData[],
  });
  const [isDashboardDataLoading, setIsDashboardDataLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin || !firestore) {
        setIsDashboardDataLoading(false);
        return;
    }

    if (!usersData) {
        if (!isUsersLoading) {
             setIsDashboardDataLoading(false);
        }
        return;
    }

    const fetchDashboardData = async () => {
        setIsDashboardDataLoading(true);
        
        try {
            const attendanceQuery = collectionGroup(firestore, 'attendanceRecords');
            const leaveQuery = collectionGroup(firestore, 'leaveRequests');
            
            const [attendanceSnap, leaveSnap] = await Promise.all([
                getDocs(attendanceQuery),
                getDocs(leaveQuery)
            ]);

            const todayStart = startOfDay(new Date());
            const todayEnd = endOfDay(new Date());

            const allAttendance = attendanceSnap.docs
                .map(d => ({ ...d.data(), id: d.id }))
                .filter(att => {
                    const checkIn = att.checkInTime?.toDate();
                    return checkIn && checkIn >= todayStart && checkIn <= todayEnd;
                });

            const userMap = new Map(usersData.map(u => [u.id, u.role]));
            const allPendingLeave = leaveSnap.docs
                .map(d => ({ ...d.data(), id: d.id }))
                .filter(req => {
                    const userRole = userMap.get(req.userId);
                    return userRole && ['guru', 'kepala_sekolah', 'pegawai'].includes(userRole) && req.status === 'pending';
                });

            setDashboardData({
                allAttendanceData: allAttendance,
                pendingLeaveRequests: allPendingLeave,
            });
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
            toast({
                variant: "destructive",
                title: "Gagal Memuat Data Dasbor",
                description: "Terjadi masalah izin saat mengambil data aktivitas terbaru.",
            });
        } finally {
            setIsDashboardDataLoading(false);
        }
    };

    fetchDashboardData();
  }, [isAdmin, firestore, usersData, isUsersLoading, toast]);
  
  // --- Auth & Role Check Effect ---
  useEffect(() => {
    if (!isRoleCheckLoading) {
      if (!user) {
        router.replace('/');
      } else if (!isAdmin) {
        router.replace('/dashboard');
      }
    }
  }, [isRoleCheckLoading, user, isAdmin, router]);

  // --- User Statistics Calculation ---
  const {
    totalUsers,
    kepalaSekolahCount,
    guruCount,
    pegawaiCount,
    siswaCount,
  } = useMemo(() => {
    if (!usersData || !isAdmin) {
      return { totalUsers: 0, kepalaSekolahCount: 0, guruCount: 0, pegawaiCount: 0, siswaCount: 0 };
    }
    const filteredUsers = usersData.filter(u => u.role !== 'admin');
    return {
      totalUsers: filteredUsers.length,
      kepalaSekolahCount: filteredUsers.filter(u => u.role === 'kepala_sekolah').length,
      guruCount: filteredUsers.filter(u => u.role === 'guru').length,
      pegawaiCount: filteredUsers.filter(u => u.role === 'pegawai').length,
      siswaCount: filteredUsers.filter(u => u.role === 'siswa').length,
    };
  }, [usersData, isAdmin]);

  // --- Combined Activity and Attendance Statistics Calculation ---
  const {
    staffPresentToday,
    totalStaff,
    recentUserActivity,
  } = useMemo(() => {
    const { allAttendanceData } = dashboardData;
    if (!usersData || !allAttendanceData || !isAdmin) {
      return { staffPresentToday: 0, totalStaff: 0, recentUserActivity: [] };
    }

    const userMap = new Map(usersData.map(u => [u.id, u]));
    
    const staffAndTeachers = usersData.filter(u => ['guru', 'kepala_sekolah', 'pegawai'].includes(u.role));
    const todaysStaffAttendance = allAttendanceData.filter(att => {
        const userDoc = userMap.get(att.userId);
        return userDoc && ['guru', 'kepala_sekolah', 'pegawai'].includes(userDoc.role);
    });
    const presentStaffIds = new Set(todaysStaffAttendance.map(att => att.userId));

    const sortedRecentActivity = [...allAttendanceData].sort((a, b) => (b.checkInTime?.toDate().getTime() || 0) - (a.checkInTime?.toDate().getTime() || 0));

    const enrichedRecentActivity = sortedRecentActivity.map((att, index) => {
        const userDoc = userMap.get(att.userId);
        const role = userDoc?.role || 'tidak diketahui';
        const displayRole = role.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        return {
            ...att,
            id: att.id,
            sequence: index + 1,
            name: userDoc?.name || 'Pengguna tidak dikenal',
            role: displayRole, // Add role for display
            checkInTimeFormatted: att.checkInTime ? att.checkInTime.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
            checkOutTimeFormatted: att.checkOutTime ? att.checkOutTime.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
            status: 'Hadir',
        };
    });

    return {
      totalStaff: staffAndTeachers.length,
      staffPresentToday: presentStaffIds.size,
      recentUserActivity: enrichedRecentActivity,
    };
  }, [usersData, dashboardData, isAdmin]);


  // --- Render Logic ---
  const isDataLoading = isUsersLoading || isDashboardDataLoading;
  if (isRoleCheckLoading || isDataLoading || !isAdmin) {
    return <AdminDashboardSkeletons />;
  }
  
  const isTemporaryAdmin = user?.email === 'admin@sekolah.sch.id';
  const pendingLeaveRequestsCount = dashboardData.pendingLeaveRequests?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Selamat Datang</h1>
          <p className="text-lg text-muted-foreground">{userData?.name || 'Admin'}</p>
          <p className="text-muted-foreground !mt-2">Ini adalah ringkasan data dan statistik sekolah.</p>
      </div>
      
       <div className="grid gap-6">
        {isTemporaryAdmin && (
            <Alert variant="default" className="bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle className="font-semibold text-amber-950 dark:text-amber-300">Langkah Keamanan Penting</AlertTitle>
                <AlertDescription>
                    Anda menggunakan akun sementara. Segera buat akun admin baru dengan email pribadi Anda melalui menu <Link href="/dashboard/admin/users" className="font-bold underline hover:text-amber-700 dark:hover:text-amber-100">Manajemen Pengguna</Link> untuk mengamankan sistem.
                </AlertDescription>
            </Alert>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main Content: Recent Attendance Table */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Aktivitas Pengguna Terbaru</CardTitle>
                    <CardDescription>Aktivitas kehadiran semua pengguna (guru, staf, dan siswa) yang tercatat hari ini.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px] text-center">No.</TableHead>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Peran</TableHead>
                                    <TableHead className="text-center">Waktu Masuk</TableHead>
                                    <TableHead className="text-center">Waktu Pulang</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentUserActivity.length > 0 ? recentUserActivity.map((item, index) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="text-center font-medium">{item.sequence}</TableCell>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="capitalize">{item.role}</TableCell>
                                        <TableCell className="text-center">{item.checkInTimeFormatted}</TableCell>
                                        <TableCell className="text-center">{item.checkOutTimeFormatted}</TableCell>
                                        <TableCell className="text-center"><Badge variant={statusVariant[item.status] || 'default'}>{item.status}</Badge></TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">Belum ada aktivitas kehadiran hari ini.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Sidebar: Summary Cards */}
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Guru & Staf Hadir</CardTitle>
                        <UserCheck className="h-5 w-5 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{staffPresentToday}<span className="text-xl font-normal text-muted-foreground">/{totalStaff}</span></div>
                        <p className="text-xs text-muted-foreground">Total guru & staf yang tercatat masuk hari ini</p>
                    </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Permintaan Izin Tertunda</CardTitle>
                    <FileWarning className="h-5 w-5 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{pendingLeaveRequestsCount}</div>
                    <p className="text-xs text-muted-foreground">Permintaan izin/sakit menunggu persetujuan</p>
                  </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Pengguna Aktif</CardTitle>
                        <Users className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{totalUsers}</div>
                        <p className="text-xs text-muted-foreground">{kepalaSekolahCount} Kepsek, {guruCount} Guru, {pegawaiCount} Pegawai, {siswaCount} Siswa</p>
                    </CardContent>
                </Card>
                <Link href="/dashboard/admin/laporan-guru">
                    <Card className="hover:bg-muted/50 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Laporan Guru</CardTitle>
                            <FileText className="h-5 w-5 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                             <p className="text-xs text-muted-foreground">Buat dan kelola laporan kehadiran guru.</p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    </div>
    </div>
  );
}
