'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,  UserCheck,  UserX,  BookUser,  Loader2,  School, LogIn, LogOut, TrendingUp, AlertCircle, Info
} from 'lucide-react';
import {
  Card,  CardContent,  CardDescription,  CardHeader,  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import {
  collection,  query,  where,  Timestamp,  getDocs, getCountFromServer, collectionGroup, orderBy, limit, doc
} from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format, isWithinInterval, addDays, subDays, setHours, setMinutes, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import { getFromCache, setInCache } from '@/lib/cache';
import { calculateAttendanceStats } from '@/lib/attendance';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';

import TodaysActivityTable from '@/components/dashboard/RecentAttendanceTable';
import AbsentUsersTable from '@/components/dashboard/AbsentUsersTable';

const roleDescriptions: { [key: string]: string } = {
  admin: 'Anda dapat mengelola pengguna, konfigurasi, dan memantau semua aktivitas.',
  kepala_sekolah: 'Anda dapat memantau aktivitas guru & pegawai, serta memproses pengajuan izin.',
  guru: 'Lakukan absensi, ajukan izin, dan lihat riwayat kehadiran Anda di sini.',
  pegawai: 'Lakukan absensi, ajukan izin, dan lihat riwayat kehadiran Anda di sini.',
};

const WelcomeCard = ({ user }: { user: any }) => (
    <div>
        <p className="text-base text-muted-foreground leading-none mb-0">Selamat Datang</p>
        <h1 className="text-xl font-bold">{user.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">{roleDescriptions[user.role] || 'Selamat datang di dasbor Anda.'}</p>
    </div>
);

const StatCard = ({ title, value, icon: Icon, description, isLoading, className, onClick }: any) => (
    <Card className={`h-full flex flex-col ${className || ''}`} onClick={onClick}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </CardHeader>
        <CardContent className="flex-grow">
            {isLoading ? (
                 <Skeleton className="h-8 w-1/2" />
            ) : (
                <>
                    <div className="text-2xl font-bold">{value}</div>
                    {description && !isLoading && <p className="text-xs text-muted-foreground">{description}</p>}
                </>
            )}
        </CardContent>
    </Card>
);

const PersonalAttendanceCardUI = ({ attendanceData, schoolConfigData, isLoading }: { attendanceData: any, schoolConfigData: any, isLoading: boolean }) => {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(new Date());
    const { status: attendanceWindowStatus } = useAttendanceWindow();

    useEffect(() => { 
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000); // Reverted: Update every second for real-time feel
        return () => clearInterval(timerId); 
    }, []);

    const attendanceRecord = attendanceData?.[0];
    const checkInTime = attendanceRecord?.checkInTime ? format(attendanceRecord.checkInTime.toDate(), 'HH:mm') : '--:--';
    const checkOutTime = attendanceRecord?.checkOutTime ? format(attendanceRecord.checkOutTime.toDate(), 'HH:mm') : '--:--';

    const reminder = useMemo(() => {
        const hasCheckedIn = !!attendanceRecord?.checkInTime;
        const hasCheckedOut = !!attendanceRecord?.checkOutTime;

        if (isLoading || hasCheckedOut) {
            return null; 
        }

        if (!hasCheckedIn) {
            if (attendanceWindowStatus === 'CHECK_IN_OPEN') {
                return {
                    variant: 'default',
                    title: 'Saatnya Absen Masuk',
                    description: 'Sesi absensi masuk sedang berlangsung. Segera lakukan absensi Anda.'
                };
            }
            
            const checkInEndStr = schoolConfigData?.checkInEndTime;
            const checkOutStartStr = schoolConfigData?.checkOutStartTime;
            if (checkInEndStr && attendanceWindowStatus === 'CLOSED') {
                const now = new Date();
                const [endH, endM] = checkInEndStr.split(':').map(Number);
                const checkInEnd = setHours(startOfDay(now), endH, endM);
                
                let checkOutStart = setHours(startOfDay(now), 23, 59); // Default to end of day
                if (checkOutStartStr) {
                    const [startH, startM] = checkOutStartStr.split(':').map(Number);
                    checkOutStart = setHours(startOfDay(now), startH, startM);
                }

                if (now > checkInEnd && now < checkOutStart) {
                    return {
                        variant: 'destructive',
                        title: 'Anda Melewatkan Sesi Absen Masuk',
                        description: 'Anda tidak melakukan absensi masuk hari ini. Presentasi kehadiran anda akan berkurang.'
                    };
                }
            }
        }

        if (hasCheckedIn) {
            if (attendanceWindowStatus === 'CHECK_OUT_OPEN') {
                return {
                    variant: 'default',
                    title: 'Saatnya Absen Pulang',
                    description: 'Waktu kerja akan berakhir. Jangan lupa untuk melakukan absensi pulang.'
                };
            }
            
            const checkOutEndStr = schoolConfigData?.checkOutEndTime;
            if (checkOutEndStr && attendanceWindowStatus === 'CLOSED') {
                const now = new Date();
                const [endH, endM] = checkOutEndStr.split(':').map(Number);
                const checkOutEnd = setHours(startOfDay(now), endH, endM);
                 if (now > checkOutEnd) {
                     return {
                        variant: 'destructive',
                        title: 'Anda Melewatkan Sesi Absen Pulang',
                        description: 'Anda tidak melakukan absensi pulang. Kehadiran Anda hari ini tercatat tidak lengkap.'
                    };
                 }
            }
        }

        return null;

    }, [attendanceRecord, isLoading, attendanceWindowStatus, schoolConfigData]);

    const buttonStatus = useMemo(() => {
        if (isLoading || !schoolConfigData) {
            return { text: 'Memuat...', disabled: true };
        }

        const { checkInStartTime, checkInEndTime, checkOutStartTime, checkOutEndTime } = schoolConfigData;
        const now = currentTime;

        const timeToDate = (timeStr: string | null) => {
            if (!timeStr) return null;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return setMinutes(setHours(startOfDay(now), hours), minutes);
        };

        const checkInStart = timeToDate(checkInStartTime);
        const checkInEnd = timeToDate(checkInEndTime);
        const checkOutStart = timeToDate(checkOutStartTime);
        const checkOutEnd = timeToDate(checkOutEndTime);

        const hasCheckedIn = attendanceRecord && attendanceRecord.checkInTime;
        const hasCheckedOut = attendanceRecord && attendanceRecord.checkOutTime;

        if (checkOutEnd && now > checkOutEnd) {
            return { text: 'Absensi Selesai', disabled: true };
        }

        if (hasCheckedOut) {
            return { text: 'Absensi Selesai', disabled: true };
        }

        if (checkOutStart && now >= checkOutStart) {
            return { text: 'Absen Pulang', disabled: false };
        }

        if (hasCheckedIn) {
            return { text: 'Sudah Absen Masuk', disabled: true };
        }
        
        if (checkInEnd && now > checkInEnd) {
            return { text: 'Absen Masuk Ditutup', disabled: true };
        }
        
        if (checkInStart && now >= checkInStart) {
            return { text: 'Absen Masuk', disabled: false };
        }

        if (checkInStart && now < checkInStart) {
            return { text: 'Belum Waktunya Absen', disabled: true };
        }

        return { text: 'Status Tidak Diketahui', disabled: true };
    }, [isLoading, attendanceRecord, schoolConfigData, currentTime]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader><CardTitle>Kehadiran Anda Hari Ini</CardTitle><CardDescription>Status kehadiran dan jam absensi Anda.</CardDescription></CardHeader>
            <CardContent className="flex flex-col flex-grow items-center justify-center space-y-6 pb-8">
                {reminder && (
                    <Alert variant={reminder.variant as "default" | "destructive" | null | undefined} className="mb-4">
                        {reminder.variant === 'destructive' ? <AlertCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                        <AlertTitle>{reminder.title}</AlertTitle>
                        <AlertDescription>{reminder.description}</AlertDescription>
                    </Alert>
                )}
                <div className="text-center">
                    <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">{format(currentTime, 'HH:mm:ss')}</p>
                    <p className="text-lg text-muted-foreground">{format(currentTime, 'eeee, d MMMM yyyy', { locale: id })}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="text-center bg-muted p-3 rounded-lg"><h3 className="font-semibold text-sm flex items-center justify-center gap-2"><LogIn size={14}/> Absen Masuk</h3><p className="text-3xl font-bold">{checkInTime}</p></div>
                    <div className="text-center bg-muted p-3 rounded-lg"><h3 className="font-semibold text-sm flex items-center justify-center gap-2"><LogOut size={14}/> Absen Pulang</h3><p className="text-3xl font-bold">{checkOutTime}</p></div>
                </div>
                <div className="w-full flex flex-col items-center space-y-2 pt-4">
                    <Button size="lg" className="w-full h-12 text-lg font-bold" onClick={() => router.push('/dashboard/absen')} disabled={buttonStatus.disabled}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{buttonStatus.text}</Button>
                    <Button variant="link" asChild><Link href="/dashboard/laporan">Lihat Riwayat Lengkap</Link></Button>
                </div>
            </CardContent>
        </Card>
    );
};

const MonthlyAttendanceChartUI = ({ summaryData, isLoading }: { summaryData: any, isLoading: boolean }) => {
    const now = new Date();
    const chartData = [
        { name: 'Hadir', jumlah: summaryData.attendanceCount, fill: '#14b8a6' },
        { name: 'Sakit', jumlah: summaryData.sakitCount, fill: '#f97316' },
        { name: 'Izin', jumlah: summaryData.izinCount, fill: '#facc15' },
        { name: 'Alpa', jumlah: summaryData.alpaCount, fill: '#334155' },
    ];

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return <div className="rounded-lg border bg-popover p-2 shadow-sm"><p className="font-medium text-popover-foreground">{label}</p><p className="text-sm text-muted-foreground">{`${payload[0].value} hari`}</p></div>;
        }
        return null;
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp size={20} /> Riwayat Bulan {format(now, 'MMMM', { locale: id })}</CardTitle><CardDescription>Persentase kehadiran: {isLoading ? '...' : `${summaryData.percentage}%`}</CardDescription></CardHeader>
            <CardContent className="flex-grow min-h-[250px]">
                {isLoading ? 
                    <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : 
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={true} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={true} allowDecimals={false} width={30} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
                            <Bar dataKey="jumlah" radius={[4, 4, 0, 0]}>{chartData.map((entry) => (<Cell key={entry.name} fill={entry.fill} />))}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                }
            </CardContent>
        </Card>
    );
};


function useMonthlyAttendanceSummary(user: any) {
    const firestore = useFirestore();
    const cacheKey = useMemo(() => user ? `monthlySummary_v3_${user.uid}` : null, [user]);
    const [summary, setSummary] = useState<any>(() => cacheKey ? getFromCache(cacheKey) || null : null);
    const [isLoading, setIsLoading] = useState(summary === null);

    useEffect(() => {
        if (!user || !firestore || !cacheKey) return;

        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const now = new Date();
                const dateRange = { start: startOfMonth(now), end: endOfMonth(now) };
                
                const stats = await calculateAttendanceStats(firestore, user.uid, dateRange);

                const newSummary = {
                    attendanceCount: stats.totalHadir,
                    izinCount: stats.totalIzin,
                    sakitCount: stats.totalSakit,
                    alpaCount: stats.totalAlpa,
                    percentage: stats.persentase.replace('%', '')
                };

                setSummary(newSummary);
                setInCache(cacheKey, newSummary, 900); // Cache for 15 minutes
            } catch (error) {
                console.error("Failed to calculate monthly summary from centralized function:", error);
                setSummary({});
            } finally {
                setIsLoading(false);
            }
        };
        
        if (summary === null) {
           fetchStats();
        }

    }, [user, firestore, cacheKey, summary]);

    return { summary: summary || {}, isLoading };
}

// CRITICAL OPTIMIZATION: Caching layer for expensive staff stats
function useStaffDashboardStats_FreePlan(firestore: any, user: any) {
  const cacheKey = 'staffDashboardStats_v1';
  const [stats, setStats] = useState<any>(() => getFromCache(cacheKey) || null);
  const [isLoading, setIsLoading] = useState(stats === null);

  useEffect(() => {
    if (!firestore || !user) return;

    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const staffQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
        const staffSnap = await getDocs(staffQuery);
        const totalStaff = staffSnap.size;

        if (totalStaff === 0) {
          const zeroStats = { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 };
          setStats(zeroStats);
          setInCache(cacheKey, zeroStats, 600); // Cache for 10 minutes
          setIsLoading(false);
          return;
        }

        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());

        const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('checkInTime', '>=', todayStart), where('checkInTime', '<=', todayEnd));
        const attendanceSnap = await getDocs(attendanceQuery);
        const hadirCount = attendanceSnap.size;

        const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));
        const leaveSnap = await getDocs(leaveQuery);
        const onLeaveUserIds = new Set();
        leaveSnap.forEach(doc => {
            const leave = doc.data();
            if (leave.startDate && leave.endDate && isWithinInterval(new Date(), { start: leave.startDate.toDate(), end: leave.endDate.toDate() })) {
                const userId = doc.ref.parent.parent?.id;
                if(userId) onLeaveUserIds.add(userId);
            }
        });
        const izinSakitCount = onLeaveUserIds.size;

        const alpaCount = Math.max(0, totalStaff - hadirCount - izinSakitCount);

        const newStats = { totalStaff, hadir: hadirCount, izin: izinSakitCount, sakit: 0, alpa: alpaCount };
        setStats(newStats);
        setInCache(cacheKey, newStats, 600); // Cache for 10 minutes

      } catch (error) {
        console.error("Error fetching dashboard stats for free plan:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (stats === null) {
        fetchStats();
    }

  }, [firestore, user, stats]);

  return { stats: stats || {}, isLoading };
}


const HeadmasterDashboard = ({ user, router }: any) => {
    const firestore = useFirestore();

    const { stats, isLoading: isStatsLoading } = useStaffDashboardStats_FreePlan(firestore, user);
    const { summary: personalSummary, isLoading: isPersonalSummaryLoading } = useMonthlyAttendanceSummary(user);
    
    const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('checkInTime', '>=', startOfDay(new Date())), limit(1)) : null, [firestore, user]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    if (isStatsLoading) {
        return (
            <>
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[120px] w-full" />)}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                    <Skeleton className="h-[400px] w-full" />
                </div>
            </>
        );
    }

    return (
        <>
            <PersonalAttendanceCardUI attendanceData={todaysAttendance} schoolConfigData={schoolConfig} isLoading={isAttendanceLoading || isSchoolConfigLoading} />
            <MonthlyAttendanceChartUI summaryData={personalSummary} isLoading={isPersonalSummaryLoading} />
            
            <StatCard title="Total Hadir Hari Ini" value={stats.hadir} icon={UserCheck} />
            <StatCard 
                title="Total Izin/Sakit Hari Ini" 
                value={stats.izin + stats.sakit} 
                icon={BookUser} 
                className="cursor-pointer hover:bg-muted transition-colors"
                onClick={() => router.push('/dashboard/izin-kepala-sekolah')}
            />
            <StatCard title="Total Alpa Hari Ini" value={stats.alpa} icon={UserX} />
            <StatCard title="Total Guru & Pegawai" value={stats.totalStaff} icon={Users} />
            
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
               <TodaysActivityTable />
            </div>
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
               <AbsentUsersTable />
            </div>
        </>
    );
};

const AdminDashboard = ({ user, router }: any) => {
    const firestore = useFirestore();
    const { stats, isLoading: isStatsLoading } = useStaffDashboardStats_FreePlan(firestore, user);

    return (
        <>
            <StatCard title="Total Hadir Hari Ini" value={stats.hadir} icon={UserCheck} isLoading={isStatsLoading} />
            <StatCard title="Total Izin/Sakit Hari Ini" value={stats.izin + stats.sakit} icon={BookUser} isLoading={isStatsLoading} />
            <StatCard title="Total Alpa Hari Ini" value={stats.alpa} icon={UserX} isLoading={isStatsLoading} />
            <StatCard title="Total Guru & Pegawai" value={stats.totalStaff} icon={Users} isLoading={isStatsLoading} />
            
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                 <TodaysActivityTable />
            </div>
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
               <AbsentUsersTable />
            </div>
        </> 
    );
};

const StaffDashboard = ({ user }: any) => {
    const firestore = useFirestore();
    
    const { summary, isLoading: isSummaryLoading } = useMonthlyAttendanceSummary(user);
    const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('checkInTime', '>=', startOfDay(new Date())), limit(1)) : null, [firestore, user]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    const isPersonalLoading = isAttendanceLoading || isSchoolConfigLoading;

    return (
        <>
            <div className="md:col-span-2 lg:col-span-2 xl:col-span-2">
                <PersonalAttendanceCardUI attendanceData={todaysAttendance} schoolConfigData={schoolConfig} isLoading={isPersonalLoading} />
            </div>
            <div className="md:col-span-2 lg:col-span-1 xl:col-span-2">
                <MonthlyAttendanceChartUI summaryData={summary} isLoading={isSummaryLoading} />
            </div>
        </> 
    );
};

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

  const renderDashboardContent = () => {
    const role = user.role;

    if (role === 'kepala_sekolah') {
      return <HeadmasterDashboard user={user} router={router} />;
    }

    if (role === 'admin') {
      return <AdminDashboard user={user} router={router} />;
    }

    if (['guru', 'pegawai'].includes(role)) {
      return <StaffDashboard user={user} />;
    }

    return null;
  };

  return (
    <div className="flex-1 pt-4 pb-24 md:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:col-span-4 md:gap-6">
            
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                <WelcomeCard user={user} />
            </div>

            {renderDashboardContent()}

        </div>
    </div>
  );
}
