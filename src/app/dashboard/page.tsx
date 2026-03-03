'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Users,  UserCheck,  UserX,  BookUser,  Loader2,  School
} from 'lucide-react';
import {
  Card,  CardContent,  CardDescription,  CardHeader,  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useUser } from '@/firebase';
import {
  collection,  query,  where,  Timestamp,  onSnapshot,  getCountFromServer, collectionGroup
} from 'firebase/firestore';
import { startOfDay, endOfDay, format, isWithinInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import PersonalDashboard from '@/components/dashboard/PersonalDashboard'; // Import the new component

const StatCard = ({ title, value, icon: Icon, description, isLoading }: any) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Skeleton className="h-8 w-1/2" />
      ) : (
        <div className="text-2xl font-bold">{value}</div>
      )}
      {description && !isLoading && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </CardContent>
  </Card>
);

function useStaticDashboardStats(firestore: any) {
  const [stats, setStats] = useState({ totalUsers: 0, totalTeachers: 0, totalStaff: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;

    const fetchStats = async () => {
      try {
        const usersCollection = collection(firestore, 'users');
        const teachersQuery = query(usersCollection, where('role', 'in', ['guru', 'kepala_sekolah']));
        const staffQuery = query(usersCollection, where('role', '==', 'pegawai'));

        const [teachersSnap, staffSnap] = await Promise.all([
            getCountFromServer(teachersQuery),
            getCountFromServer(staffQuery),
        ]);

        const teacherCount = teachersSnap.data().count;
        const staffCount = staffSnap.data().count;

        setStats({
          totalTeachers: teacherCount,
          totalStaff: staffCount,
          totalUsers: teacherCount + staffCount,
        });

      } catch (error) {
        console.error("Error fetching static dashboard stats: ", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [firestore]);

  return { stats, isLoading };
}

function useRealtimeTodayStats(firestore: any) {
    const [todayStats, setTodayStats] = useState({ hadir: 0, izin: 0, sakit: 0 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;

        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());

        const attendanceTodayQuery = query(
            collectionGroup(firestore, 'attendanceRecords'),
            where('checkInTime', '>=', Timestamp.fromDate(todayStart)),
            where('checkInTime', '<=', Timestamp.fromDate(todayEnd))
        );

        const leaveTodayQuery = query(collectionGroup(firestore, 'leaveRequests'));

        const unsubAttendance = onSnapshot(attendanceTodayQuery, (snapshot) => {
            setTodayStats(prev => ({ ...prev, hadir: snapshot.size }));
            setIsLoading(false);
        }, (error) => {
            console.error("Error with today's attendance snapshot: ", error);
            setIsLoading(false);
        });

        const unsubLeave = onSnapshot(leaveTodayQuery, (snapshot) => {
            let izinCount = 0;
            let sakitCount = 0;
            const today = new Date();

            snapshot.forEach(doc => {
                const leave = doc.data();
                if (leave.status !== 'approved') return;

                const leaveStart = leave.startDate.toDate();
                const leaveEnd = leave.endDate.toDate();
                
                if (isWithinInterval(today, { start: leaveStart, end: leaveEnd })) {
                     if (leave.type === 'Izin') izinCount++;
                     else if (leave.type === 'Sakit') sakitCount++;
                }
            });
            setTodayStats(prev => ({ ...prev, izin: izinCount, sakit: sakitCount }));
            setIsLoading(false);
        }, (error) => {
            console.error("Error with today's leave snapshot: ", error);
            setIsLoading(false);
        });

        return () => {
            unsubAttendance();
            unsubLeave();
        };

    }, [firestore]);

    return { todayStats, isLoading };
}


export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const { stats: staticStats, isLoading: isStaticStatsLoading } = useStaticDashboardStats(firestore);
  const { todayStats, isLoading: isTodayStatsLoading } = useRealtimeTodayStats(firestore);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/');
    }
  }, [user, isUserLoading, router]);

  const totalAlpa = useMemo(() => {
    if (isStaticStatsLoading || isTodayStatsLoading) return 0;
    const totalStaffAndTeachers = staticStats.totalTeachers + staticStats.totalStaff;
    const totalPresentOrOnLeave = todayStats.hadir + todayStats.izin + todayStats.sakit;
    return Math.max(0, totalStaffAndTeachers - totalPresentOrOnLeave);
  }, [todayStats, staticStats, isStaticStatsLoading, isTodayStatsLoading]);


  const chartData = useMemo(() => [
      { name: 'Hadir', jumlah: todayStats.hadir, fill: '#22c55e' },
      { name: 'Izin', jumlah: todayStats.izin, fill: '#f97316' },
      { name: 'Sakit', jumlah: todayStats.sakit, fill: '#ef4444' },
      { name: 'Alpa', jumlah: totalAlpa, fill: '#64748b' },
  ], [todayStats, totalAlpa]);

  if (isUserLoading || !user) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  // --- Conditional Rendering based on Role ---
  if (user.role === 'guru' || user.role === 'pegawai' || user.role === 'kepala_sekolah' || user.role === 'siswa') {
      return <PersonalDashboard />;
  }

  // --- Admin Dashboard ---
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>

      <Alert variant="default" className="bg-blue-50 border-blue-200">
        <School className="h-4 w-4 !text-blue-600" />
        <AlertTitle className="text-blue-800">Selamat Datang, Admin!</AlertTitle>
        <AlertDescription className="text-blue-700">
            Anda memiliki akses penuh ke semua fitur. Gunakan menu navigasi di samping untuk mengelola pengguna, laporan, dan pengaturan sistem.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Hadir Hari Ini" value={todayStats.hadir} icon={UserCheck} isLoading={isTodayStatsLoading} />
        <StatCard title="Total Izin/Sakit Hari Ini" value={todayStats.izin + todayStats.sakit} icon={BookUser} isLoading={isTodayStatsLoading} />
        <StatCard title="Total Alpa Hari Ini" value={totalAlpa} icon={UserX} isLoading={isStaticStatsLoading || isTodayStatsLoading} />
        <StatCard title="Total Guru & Pegawai" value={staticStats.totalTeachers + staticStats.totalStaff} icon={Users} isLoading={isStaticStatsLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Grafik Kehadiran Staf Hari Ini</CardTitle>
            <CardDescription>{format(new Date(), "eeee, dd MMMM yyyy", { locale: id })}</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {isTodayStatsLoading || isStaticStatsLoading ? (
                <div className="h-[350px] w-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip wrapperClassName="!border-border !bg-background !text-foreground" contentStyle={{backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="jumlah" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Aktivitas Terbaru</CardTitle>
            <CardDescription>
              Menampilkan 5 aktivitas absensi dan pengajuan terakhir.
            </CardDescription>
          </CardHeader>
          {/* Activities content removed for brevity in this example */}
        </Card>
      </div>
    </div>
  );
}
