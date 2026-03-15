'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,  UserCheck,  UserX,  BookUser,  Loader2,  School, LogIn, LogOut, TrendingUp
} from 'lucide-react';
import {
  Card,  CardContent,  CardDescription,  CardHeader,  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import {
  collection,  query,  where,  Timestamp,  onSnapshot,  getCountFromServer, collectionGroup, orderBy, limit, doc
} from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format, isWithinInterval, addDays, subDays, setHours, setMinutes, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import RecentAttendanceTable from '@/components/dashboard/RecentAttendanceTable';
import { getFromCache, setInCache } from '@/lib/cache';


// ====================================================================
// A. GLOBAL & UTILITY COMPONENTS
// ====================================================================

const roleDescriptions: { [key: string]: string } = {
  admin: 'Anda dapat mengelola pengguna, konfigurasi, dan memantau semua aktivitas.',
  kepala_sekolah: 'Anda dapat memantau aktivitas guru & pegawai, serta memproses pengajuan izin.',
  guru: 'Lakukan absensi, ajukan izin, dan lihat riwayat kehadiran Anda di sini.',
  pegawai: 'Lakukan absensi, ajukan izin, dan lihat riwayat kehadiran Anda di sini.',
  siswa: 'Lihat riwayat kehadiran dan status absensi Anda di sini.',
};

const WelcomeCard = ({ user }: { user: any }) => (
    <Alert variant="default" className="bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800 h-full">
        <School className="h-4 w-4 !text-blue-600 dark:!text-blue-400" />
        <div className="flex-1">
            <AlertTitle className="text-blue-800 dark:text-blue-300">Selamat Datang</AlertTitle>
            <AlertDescription>
                <div className="text-lg font-semibold text-blue-900 dark:text-blue-200 mt-0.5">{user.name}</div>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">{roleDescriptions[user.role] || 'Selamat datang di dasbor Anda.'}</p>
            </AlertDescription>
        </div>
    </Alert>
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

// ====================================================================
// B. PRESENTATIONAL & REUSABLE DASHBOARD CARDS
// ====================================================================

const PersonalAttendanceCardUI = ({ attendanceData, schoolConfigData, isLoading }: { attendanceData: any, schoolConfigData: any, isLoading: boolean }) => {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => { 
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000); 
        return () => clearInterval(timerId); 
    }, []);

    const attendanceRecord = attendanceData?.[0];
    const checkInTime = attendanceRecord?.checkInTime ? format(attendanceRecord.checkInTime.toDate(), 'HH:mm') : '--:--';
    const checkOutTime = attendanceRecord?.checkOutTime ? format(attendanceRecord.checkOutTime.toDate(), 'HH:mm') : '--:--';

    const buttonStatus = useMemo(() => {
        if (isLoading || !schoolConfigData) {
            return { text: 'Memuat...', disabled: true };
        }

        const { checkInEndTime, checkOutStartTime } = schoolConfigData;
        const now = currentTime;

        const checkOutDeadline = checkOutStartTime ? setMinutes(setHours(startOfDay(now), ...checkOutStartTime.split(':').map(Number)), 0) : null;
        const checkInDeadline = checkInEndTime ? setMinutes(setHours(startOfDay(now), ...checkInEndTime.split(':').map(Number)), 0) : null;

        if (attendanceRecord && attendanceRecord.checkOutTime) return { text: 'Absensi Selesai', disabled: true };
        if (attendanceRecord && !attendanceRecord.checkOutTime) return { text: 'Absen Pulang', disabled: false };
        if (!attendanceRecord) {
            if (checkOutDeadline && now > checkOutDeadline) return { text: 'Absensi Selesai', disabled: true };
            if (checkInDeadline && now > checkInDeadline) return { text: 'Waktu Absen Masuk Habis', disabled: true };
            return { text: 'Absen Masuk', disabled: false };
        }
        return { text: 'Status Tidak Diketahui', disabled: true };
    }, [isLoading, attendanceRecord, schoolConfigData, currentTime]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader><CardTitle>Kehadiran Anda Hari Ini</CardTitle><CardDescription>Status kehadiran dan jam absensi Anda.</CardDescription></CardHeader>
            <CardContent className="flex flex-col flex-grow items-center justify-center space-y-6 pb-8">
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
                    <Button variant="link" asChild><Link href="/dashboard/kepala_sekolah/laporan">Lihat Riwayat Lengkap</Link></Button>
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


// ====================================================================
// C. DATA-FETCHING HOOKS (WITH CACHING)
// ====================================================================

function useMonthlyAttendanceSummary(user: any) {
    const firestore = useFirestore();
    const cacheKey = useMemo(() => user ? `monthlySummary_${user.uid}` : null, [user]);
    const [summary, setSummary] = useState(() => cacheKey ? getFromCache(cacheKey) || {} : {});
    const [isLoading, setIsLoading] = useState(!Object.keys(summary).length);

    const now = useMemo(() => new Date(), []);
    const monthlyConfigId = useMemo(() => format(now, 'yyyy-MM'), [now]);

    // These dependencies are for fetching data, not for the cache key.
    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const monthlyConfigRef = useMemoFirebase(() => user ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, user, monthlyConfigId]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);
    const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);
    
    const attendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('checkInTime', '>=', startOfMonth(now)), where('checkInTime', '<=', endOfMonth(now))) : null, [user, firestore, now]);
    const { data: attendanceData, isLoading: isAttendanceLoading } = useCollection(user, attendanceQuery);

    const leaveQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'leaveRequests'), where('status', '==', 'approved'), where('startDate', '<=', endOfMonth(now))) : null, [user, firestore, now]);
    const { data: leaveData, isLoading: isLeaveLoading } = useCollection(user, leaveQuery);

    useEffect(() => {
        const allDataLoaded = user && !isSchoolConfigLoading && !isMonthlyConfigLoading && !isAttendanceLoading && !isLeaveLoading;
        if (allDataLoaded && cacheKey) {
            const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig?.holidays ?? [];
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);
            const todayStart = startOfDay(new Date());

            const totalWorkingDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(day => !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))).length;
            const pastWorkingDays = eachDayOfInterval({ start: monthStart, end: subDays(todayStart, 1) }).filter(day => day >= monthStart && !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))).length;
            
            const validAttendanceCount = attendanceData?.filter(rec => rec.checkInTime && rec.checkOutTime).length ?? 0;
            const pastValidAttendanceCount = attendanceData?.filter(att => att.checkInTime.toDate() < todayStart && att.checkInTime && att.checkOutTime).length ?? 0;

            let izinCount = 0, sakitCount = 0, pastIzinCount = 0, pastSakitCount = 0;
            leaveData?.forEach(leave => {
                if (leave.status !== 'approved') return;
                eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                    if (isWithinInterval(day, { start: monthStart, end: monthEnd }) && !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))) {
                        if (leave.type === 'Izin') { izinCount++; if (day < todayStart) pastIzinCount++; }
                        else if (leave.type === 'Sakit') { sakitCount++; if (day < todayStart) pastSakitCount++; }
                    }
                });
            });

            const alpaCount = Math.max(0, pastWorkingDays - pastValidAttendanceCount - pastIzinCount - pastSakitCount);
            const percentage = totalWorkingDays > 0 ? Math.round((validAttendanceCount / totalWorkingDays) * 100) : 0;
            
            const newSummary = { attendanceCount: validAttendanceCount, alpaCount, izinCount, sakitCount, percentage };
            setSummary(newSummary);
            setInCache(cacheKey, newSummary);
            setIsLoading(false);
        }
    }, [user, isSchoolConfigLoading, isMonthlyConfigLoading, isAttendanceLoading, isLeaveLoading, schoolConfig, monthlyConfig, attendanceData, leaveData, now, cacheKey]);

    return { summary, isLoading };
}

// CORRECTED: This function is now more robust and will not crash on unmount.
function useStaffDashboardStats(firestore: any, user: any) {
  const cacheKey = 'staffDashboardStats';
  const [stats, setStats] = useState(() => getFromCache(cacheKey) || { totalStaff: 0, hadir: 0, izin: 0, sakit: 0 });
  const [isLoading, setIsLoading] = useState(!getFromCache(cacheKey));

  const alpaCount = useMemo(() => Math.max(0, stats.totalStaff - stats.hadir - stats.izin - stats.sakit), [stats]);

  useEffect(() => {
    if (!firestore || !user) return;

    // Initialize unsubscribe functions to prevent errors on rapid unmount.
    let unsubStaff = () => {};
    let unsubAttendance = () => {};
    let unsubLeave = () => {};

    try {
        const staffQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
        const attendanceTodayQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('checkInTime', '>=', startOfDay(new Date())), where('checkInTime', '<=', endOfDay(new Date())));
        const leaveTodayQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));

        const processAndCacheStats = (data: Partial<typeof stats>) => {
            setStats(currentStats => {
                const newStats = { ...currentStats, ...data };
                setInCache(cacheKey, newStats);
                return newStats;
            });
        }

        unsubStaff = onSnapshot(staffQuery, snap => {
            processAndCacheStats({ totalStaff: snap.size });
            if (isLoading) setIsLoading(false);
        }, (error) => {
            console.error("Staff listener failed:", error);
            if (isLoading) setIsLoading(false);
        });

        unsubAttendance = onSnapshot(attendanceTodayQuery, snap => processAndCacheStats({ hadir: snap.size }), (error) => {
            console.error("Attendance listener failed:", error);
        });
        
        unsubLeave = onSnapshot(leaveTodayQuery, snap => {
            let izinCount = 0, sakitCount = 0;
            const today = new Date();
            snap.forEach(doc => {
                const leave = doc.data();
                if (leave.startDate && leave.endDate && isWithinInterval(startOfDay(today), { start: leave.startDate.toDate(), end: leave.endDate.toDate() })) {
                    if (leave.type === 'Izin') izinCount++;
                    else if (leave.type === 'Sakit') sakitCount++;
                }
            });
            processAndCacheStats({ izin: izinCount, sakit: sakitCount });
        }, (error) => {
            console.error("Leave listener failed:", error);
        });

    } catch (error) {
        console.error("Error setting up dashboard listeners:", error);
        setIsLoading(false);
    }

    // This cleanup function will now safely call the initialized unsubscribe functions.
    return () => {
        unsubStaff();
        unsubAttendance();
        unsubLeave();
    };
  }, [firestore, user]);

  return { stats: {...stats, alpa: alpaCount}, isLoading };
}

// ====================================================================
// D. ROLE-BASED DASHBOARD COMPONENTS (SMART)
// ====================================================================

const HeadmasterDashboard = ({ user, router }: any) => {
    const firestore = useFirestore();

    // Fetch ALL data required for this dashboard using our new cached hooks
    const { stats, isLoading: isStatsLoading } = useStaffDashboardStats(firestore, user);
    const { summary: personalSummary, isLoading: isPersonalSummaryLoading } = useMonthlyAttendanceSummary(user);
    
    // Personal attendance is quick, no need to cache aggressively, but we still need its loading state
    const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('checkInTime', '>=', startOfDay(new Date())), limit(1)) : null, [firestore, user]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    // The key change: The main skeleton is now ONLY driven by the stats loading.
    // Personal data will have its own internal loading state, which is much faster.
    if (isStatsLoading) {
        return (
            <>
                <Skeleton className="h-[480px] w-full" />
                <Skeleton className="h-[320px] w-full" />
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[120px] w-full" />)}
                <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                    <Skeleton className="h-[200px] w-full" />
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
                <RecentAttendanceTable />
            </div>
        </>
    );
};

const AdminDashboard = ({ user, router }: any) => {
    const firestore = useFirestore();
    const { stats, isLoading: isStatsLoading } = useStaffDashboardStats(firestore, user);

    return (
        <>
            <StatCard title="Total Hadir Hari Ini" value={stats.hadir} icon={UserCheck} isLoading={isStatsLoading} />
            <StatCard title="Total Izin/Sakit Hari Ini" value={stats.izin + stats.sakit} icon={BookUser} isLoading={isStatsLoading} />
            <StatCard title="Total Alpa Hari Ini" value={stats.alpa} icon={UserX} isLoading={isStatsLoading} />
            <StatCard title="Total Guru & Pegawai" value={stats.totalStaff} icon={Users} isLoading={isStatsLoading} />
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                <RecentAttendanceTable />
            </div>
        </>
    );
};

const StaffStudentDashboard = ({ user }: any) => {
    const firestore = useFirestore();
    
    const { summary, isLoading: isSummaryLoading } = useMonthlyAttendanceSummary(user);
    const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('checkInTime', '>=', startOfDay(new Date())), limit(1)) : null, [firestore, user]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    const isPersonalLoading = isAttendanceLoading || isSchoolConfigLoading;

    return (
        <>
            <div className="lg:col-span-2 xl:col-span-3">
                <PersonalAttendanceCardUI attendanceData={todaysAttendance} schoolConfigData={schoolConfig} isLoading={isPersonalLoading} />
            </div>
            <div>
                <MonthlyAttendanceChartUI summaryData={summary} isLoading={isSummaryLoading} />
            </div>
        </>
    );
};

// ====================================================================
// E. MAIN PAGE COMPONENT (ROUTER)
// ====================================================================

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

    if (['guru', 'pegawai', 'siswa'].includes(role)) {
      return <StaffStudentDashboard user={user} />;
    }

    return null; // Render nothing if role is not matched
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                <WelcomeCard user={user} />
            </div>

            {renderDashboardContent()}

        </div>
    </div>
  );
}
