'use client';

import { useMemo, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, Timestamp, getDocs, type DocumentData, collectionGroup } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { startOfDay, endOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { AdminDashboardSkeletons } from '@/components/dashboard/admin/AdminDashboardSkeletons';
import { StatCards } from '@/components/dashboard/admin/StatCards';
import { RecentActivityTable } from '@/components/dashboard/admin/RecentActivityTable';

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
          <RecentActivityTable activity={stats.recentUserActivity} />
          <StatCards stats={stats} />
        </div>
      </div>
    </div>
  );
}
