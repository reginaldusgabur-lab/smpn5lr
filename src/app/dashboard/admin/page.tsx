'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserCheck, Users, FileWarning, ShieldAlert } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMemo, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, Timestamp, getDocs, type DocumentData, collectionGroup } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { startOfDay, endOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default', 'Sakit': 'destructive', 'Izin': 'secondary', 'Terlambat': 'outline',
}

const AdminDashboardSkeletons = () => (
    <div className="space-y-6 animate-pulse">
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

async function fetchCollection(firestore: any, collectionName: string, constraints: any[] = []): Promise<DocumentData[]> {
    const q = query(collection(firestore, collectionName), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
}

async function fetchGroup(firestore: any, groupName: string, constraints: any[] = []): Promise<DocumentData[]> {
    const q = query(collectionGroup(firestore, groupName), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
}


export default function AdminDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  // --- Auth & Role Check ---
  const { data: userData, isLoading: isUserDataLoading } = useQuery<DocumentData | null>({
      queryKey: ['user', user?.uid],
      queryFn: () => fetchCollection(firestore, 'users', [where("__name__", "==", user!.uid)]).then(docs => docs[0] || null),
      enabled: !!user && !!firestore,
  });

  const isRoleCheckLoading = isUserLoading || isUserDataLoading;
  const isAdmin = !isRoleCheckLoading && userData?.role === 'admin';

  useEffect(() => {
    if (!isRoleCheckLoading) {
      if (!user) router.replace('/');
      else if (!isAdmin) router.replace('/dashboard');
    }
  }, [isRoleCheckLoading, user, isAdmin, router]);

  // --- Data Fetching ---
  const { data: usersData, isLoading: isUsersLoading } = useQuery<DocumentData[]>({
      queryKey: ['allUsers'],
      queryFn: () => fetchCollection(firestore, 'users'),
      enabled: isAdmin && !!firestore,
  });

  const { data: dashboardData, isLoading: isDashboardDataLoading } = useQuery<{ allAttendanceData: DocumentData[], pendingLeaveRequests: DocumentData[] } | undefined>({
    queryKey: ['adminDashboardData', usersData], // Rerun when usersData is available
    queryFn: async () => {
        if (!usersData) {
            return { allAttendanceData: [], pendingLeaveRequests: [] };
        }
        try {
            const todayStart = startOfDay(new Date());
            const todayEnd = endOfDay(new Date());

            const [attendanceDocs, leaveDocs] = await Promise.all([
                fetchGroup(firestore, 'attendanceRecords', [where('checkInTime', '>=', todayStart), where('checkInTime', '<=', todayEnd)]),
                fetchGroup(firestore, 'leaveRequests', [where('status', '==', 'pending')])
            ]);

            const userMap = new Map(usersData.map((u: DocumentData) => [u.id, u.role]));

            const allPendingLeave = leaveDocs.filter((req: DocumentData) => {
                const userRole = userMap.get(req.userId);
                return userRole && ['guru', 'kepala_sekolah', 'pegawai'].includes(userRole);
            });

            return { allAttendanceData: attendanceDocs, pendingLeaveRequests: allPendingLeave };
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
            toast({ variant: "destructive", title: "Gagal Memuat Data Dasbor", description: "Terjadi masalah saat mengambil data aktivitas." });
            throw error;
        }
    },
    enabled: isAdmin && !!firestore && !!usersData, // Key dependency
  });

  // --- Memoized Statistics ---
  const stats = useMemo(() => {
    if (!usersData || !dashboardData) return { totalUsers: 0, kepalaSekolahCount: 0, guruCount: 0, pegawaiCount: 0, siswaCount: 0, staffPresentToday: 0, totalStaff: 0, recentUserActivity: [], pendingLeaveRequestsCount: 0 };

    const userMap = new Map(usersData.map((u: DocumentData) => [u.id, u]));
    const filteredUsers = usersData.filter((u: DocumentData) => u.role !== 'admin');
    const staffAndTeachers = filteredUsers.filter((u: DocumentData) => ['guru', 'kepala_sekolah', 'pegawai'].includes(u.role));
    
    const presentStaffIds = new Set(dashboardData.allAttendanceData.map((att: DocumentData) => att.userId));

    const recentUserActivity = [...dashboardData.allAttendanceData]
        .sort((a: DocumentData, b: DocumentData) => (b.checkInTime?.toDate().getTime() || 0) - (a.checkInTime?.toDate().getTime() || 0))
        .map((att: DocumentData, index: number) => {
            const userDoc = userMap.get(att.userId);
            const role = userDoc?.role || 'tidak diketahui';
            const displayRole = role.replace('_', ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            return {
                id: att.id,
                sequence: index + 1,
                name: userDoc?.name || 'Pengguna tidak dikenal',
                role: displayRole,
                checkInTimeFormatted: att.checkInTime ? att.checkInTime.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOutTimeFormatted: att.checkOutTime ? att.checkOutTime.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
                status: 'Hadir',
            };
        });

    return {
        totalUsers: filteredUsers.length,
        kepalaSekolahCount: filteredUsers.filter((u: DocumentData) => u.role === 'kepala_sekolah').length,
        guruCount: filteredUsers.filter((u: DocumentData) => u.role === 'guru').length,
        pegawaiCount: filteredUsers.filter((u: DocumentData) => u.role === 'pegawai').length,
        siswaCount: filteredUsers.filter((u: DocumentData) => u.role === 'siswa').length,
        staffPresentToday: presentStaffIds.size,
        totalStaff: staffAndTeachers.length,
        recentUserActivity,
        pendingLeaveRequestsCount: dashboardData.pendingLeaveRequests.length,
    };
  }, [usersData, dashboardData]);

  // --- Render Logic ---
  if (isRoleCheckLoading || (isAdmin && (isUsersLoading || isDashboardDataLoading))) {
    return <AdminDashboardSkeletons />;
  }
  
  const isTemporaryAdmin = user?.email === 'admin@sekolah.sch.id';

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
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Aktivitas Pengguna Terbaru</CardTitle>
                    <CardDescription>Aktivitas kehadiran semua pengguna yang tercatat hari ini.</CardDescription>
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
                                {stats.recentUserActivity.length > 0 ? stats.recentUserActivity.map((item: any) => (
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
        </div>
    </div>
    </div>
  );
}
