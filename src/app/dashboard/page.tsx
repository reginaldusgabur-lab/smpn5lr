'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Activity,  Users,  UserCheck,  UserX,  BookUser,  ShieldAlert,  Loader2,  AlertCircle,  School, Archive
} from 'lucide-react';
import {
  Card,  CardContent,  CardDescription,  CardHeader,  CardTitle,
} from '@/components/ui/card';
import {
  Table,  TableBody,  TableCell,  TableHead,  TableHeader,  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useUser } from '@/firebase';
import {
  collection,  doc,  getDoc, getDocs,
  query,  where,  Timestamp,  onSnapshot,  getCountFromServer, collectionGroup, orderBy, limit
} from 'firebase/firestore';
import { startOfDay, endOfDay, format, isWithinInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';

// --- Reusable Components ---

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

const RecentActivitySkeleton = () => (
    <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
            <div className="flex items-center space-x-4" key={i}>
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-3 w-[150px]" />
                </div>
            </div>
        ))}
    </div>
);

// --- Custom Hooks for Data Fetching ---

function useStaticDashboardStats(firestore: any) {
  const [stats, setStats] = useState({ totalUsers: 0, totalTeachers: 0, totalStaff: 0, totalStudents: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;

    const fetchStats = async () => {
      try {
        const usersCollection = collection(firestore, 'users');
        
        const teachersQuery = query(usersCollection, where('role', 'in', ['guru', 'kepala_sekolah']));
        const staffQuery = query(usersCollection, where('role', '==', 'pegawai'));
        const studentsQuery = query(usersCollection, where('role', '==', 'siswa'));

        const [teachersSnap, staffSnap, studentsSnap] = await Promise.all([
            getCountFromServer(teachersQuery),
            getCountFromServer(staffQuery),
            getCountFromServer(studentsQuery),
        ]);

        const teacherCount = teachersSnap.data().count;
        const staffCount = staffSnap.data().count;
        const studentCount = studentsSnap.data().count;

        setStats({
          totalTeachers: teacherCount,
          totalStaff: staffCount,
          totalStudents: studentCount,
          totalUsers: teacherCount + staffCount + studentCount,
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

        // This query now fetches ALL leave requests. Filtering is done entirely on the client-side
        // to avoid any dependency on composite indexes.
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

            snapshot.forEach(doc => {
                const leave = doc.data();
                // 1. Client-side filtering for 'approved' status
                if (leave.status !== 'approved') return;

                const leaveStart = leave.startDate.toDate();
                const leaveEnd = leave.endDate.toDate();
                
                // 2. Client-side filtering to see if today falls within the leave interval
                if (isWithinInterval(todayStart, { start: leaveStart, end: leaveEnd })) {
                     if (leave.type === 'Izin') {
                        izinCount++;
                    } else if (leave.type === 'Sakit') {
                        sakitCount++;
                    }
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

function useRecentActivities(firestore: any) {
    const [activities, setActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore) return;

        const q = query(
            collection(firestore, 'activities'), 
            orderBy('timestamp', 'desc'), 
            limit(5)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const acts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                time: format(doc.data().timestamp.toDate(), 'HH:mm', { locale: id })
            }));
            setActivities(acts);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching recent activities:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();

    }, [firestore]);

    return { activities, isLoading };
}

// --- Main Dashboard Component ---

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const { stats: staticStats, isLoading: isStaticStatsLoading } = useStaticDashboardStats(firestore);
  const { todayStats, isLoading: isTodayStatsLoading } = useRealtimeTodayStats(firestore);
  const { activities, isLoading: isActivitiesLoading } = useRecentActivities(firestore);

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

  if (isUserLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>

      {user && user.role === 'admin' && (
          <Alert variant="default" className="bg-blue-50 border-blue-200">
            <School className="h-4 w-4 !text-blue-600" />
            <AlertTitle className="text-blue-800">Selamat Datang, Admin!</AlertTitle>
            <AlertDescription className="text-blue-700">
                Anda memiliki akses penuh ke semua fitur. Gunakan menu navigasi di samping untuk mengelola pengguna, laporan, dan pengaturan sistem.
            </AlertDescription>
         </Alert>
      )}

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
          <CardContent>
             {isActivitiesLoading ? <RecentActivitySkeleton /> : (
                <div className="space-y-6">
                    {activities.map((activity) => (
                        <div className="flex items-center" key={activity.id}>
                            <div className="h-10 w-10 flex items-center justify-center rounded-full bg-muted mr-4">
                                {activity.type === 'attendance' ? <UserCheck className="h-5 w-5"/> : <BookUser className="h-5 w-5"/>}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium leading-none">{activity.userName}</p>
                                <p className="text-sm text-muted-foreground">{activity.description}</p>
                            </div>
                            <div className="ml-auto font-medium text-xs text-muted-foreground">{activity.time}</div>
                        </div>
                    ))}
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
