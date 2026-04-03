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
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import {
  collection,  query,  where,  Timestamp,  getDocs, getCountFromServer, collectionGroup, orderBy, limit, doc
} from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format, isWithinInterval, addDays, subDays, setHours, setMinutes, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import { getFromCache, setInCache } from '@/lib/cache';
import { calculateAttendanceStats } from '@/lib/attendance'; // <-- IMPORT THE SOURCE OF TRUTH

import TodaysActivityTable from '@/components/dashboard/RecentAttendanceTable';


// ====================================================================
// A. GLOBAL & UTILITY COMPONENTS
// ====================================================================

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

        const checkOutDeadline = checkOutStartTime ? setMinutes(setHours(startOfDay(now), parseInt(checkOutStartTime.split(':')[0])), parseInt(checkOutStartTime.split(':')[1])) : null;
        const checkInDeadline = checkInEndTime ? setMinutes(setHours(startOfDay(now), parseInt(checkInEndTime.split(':')[0])), parseInt(checkInEndTime.split(':')[1])) : null;

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


// ====================================================================
// C. DATA-FETCHING HOOK (REWRITTEN TO USE CENTRALIZED LOGIC)
// ====================================================================

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
                
                // Call the single source of truth
                const stats = await calculateAttendanceStats(firestore, user.uid, dateRange);

                const newSummary = {
                    attendanceCount: stats.totalHadir,
                    izinCount: stats.totalIzin,
                    sakitCount: stats.totalSakit,
                    alpaCount: stats.totalAlpa,
                    percentage: stats.persentase.replace('%', '') // Remove % for the chart component
                };

                setSummary(newSummary);
                setInCache(cacheKey, newSummary, 900); // Cache for 15 minutes
            } catch (error) {
                console.error("Failed to calculate monthly summary from centralized function:", error);
                setSummary({}); // Set empty object on error to prevent broken chart
            } finally {
                setIsLoading(false);
            }
        };
        
        // Fetch data if it's not in the cache
        if (summary === null) {
           fetchStats();
        }

    }, [user, firestore, cacheKey, summary]);

    return { summary: summary || {}, isLoading }; // Return empty object if summary is null to prevent errors
}


// REWRITTEN HOOK to avoid collectionGroup queries.
function useStaffDashboardStats_FreePlan(firestore: any, user: any) {
  const [stats, setStats] = useState({ totalStaff: 0, hadir: 0, izin: 0, sakit: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const alpaCount = useMemo(() => Math.max(0, stats.totalStaff - stats.hadir - stats.izin - stats.sakit), [stats]);

  useEffect(() => {
    if (!firestore || !user) return;

    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const staffQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
        const staffSnap = await getDocs(staffQuery);
        const totalStaff = staffSnap.size;
        
        if (totalStaff === 0) {
          setStats({ totalStaff: 0, hadir: 0, izin: 0, sakit: 0 });
          setIsLoading(false);
          return;
        }

        let hadirCount = 0;
        let izinCount = 0;
        let sakitCount = 0;

        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());

        const promises = staffSnap.docs.map(async (userDoc) => {
          // Check attendance for today
          const attendanceQuery = query(
            collection(firestore, 'users', userDoc.id, 'attendanceRecords'),
            where('checkInTime', '>=', todayStart),
            where('checkInTime', '<=', todayEnd),
            limit(1)
          );
          const attendanceSnap = await getDocs(attendanceQuery);
          if (!attendanceSnap.empty) {
            hadirCount++;
          }

          // Check approved leave for today
          const leaveQuery = query(
            collection(firestore, 'users', userDoc.id, 'leaveRequests'),
            where('status', '==', 'approved')
          );
          const leaveSnap = await getDocs(leaveQuery);
          leaveSnap.forEach(leaveDoc => {
            const leaveData = leaveDoc.data();
            if (leaveData.startDate && leaveData.endDate) {
                 if (isWithinInterval(todayStart, { start: leaveData.startDate.toDate(), end: leaveData.endDate.toDate() })) {
                    if (leaveData.type === 'Izin') izinCount++;
                    else if (leaveData.type === 'Sakit') sakitCount++;
                }
            }
          });
        });

        await Promise.all(promises);

        setStats({ totalStaff, hadir: hadirCount, izin: izinCount, sakit: sakitCount });
      } catch (error) {
        console.error("Error fetching dashboard stats for free plan:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();

  }, [firestore, user]);

  return { stats: {...stats, alpa: alpaCount}, isLoading };
}


// ====================================================================
// D. ROLE-BASED DASHBOARD COMPONENTS (SMART)
// ====================================================================

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
                {/* Placeholder skeleton for the entire dashboard while loading */}
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[120px] w-full" />)}
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
            
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 overflow-x-auto">
               <TodaysActivityTable />
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
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 overflow-x-auto">
                 <TodaysActivityTable />
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
            {/* FIX: Explicitly define column spans to prevent chart collapsing */}
            <div className="md:col-span-2 lg:col-span-2 xl:col-span-2">
                <PersonalAttendanceCardUI attendanceData={todaysAttendance} schoolConfigData={schoolConfig} isLoading={isPersonalLoading} />
            </div>
            <div className="md:col-span-2 lg:col-span-1 xl:col-span-2">
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

    if (['guru', 'pegawai'].includes(role)) {
      return <StaffDashboard user={user} />;
    }

    return null;
  };

  return (
    <div className="flex-1 pt-4 pb-24 md:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
            
            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
                <WelcomeCard user={user} />
            </div>

            {renderDashboardContent()}

        </div>
    </div>
  );
}
