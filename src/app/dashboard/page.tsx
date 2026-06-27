'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,  UserCheck,  BookUser,  LogIn, LogOut, TrendingUp, MailWarning
} from 'lucide-react';
import {
  Card,  CardContent,  CardHeader,  CardTitle, CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import {
  collection,  query,  where,  limit, doc
} from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfDay, format } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { getFromCache, setInCache } from '@/lib/cache';
import { calculateAttendanceStats, getDailyStaffAttendanceStats } from '@/lib/attendance'; 
import { cn } from '@/lib/utils';
import { PageWrapper } from '@/components/layout/page-wrapper';

import TodaysActivityTable from '@/components/dashboard/RecentAttendanceTable';
import AbsentUsersTable from '@/components/dashboard/AbsentUsersTable';

const roleDescriptions: { [key: string]: string } = {
  admin: 'Kelola pengguna, konfigurasi, dan pantau aktivitas.',
  kepala_sekolah: 'Pantau aktivitas guru & pegawai, serta proses izin.',
  guru: 'Lakukan absensi dan lihat riwayat kehadiran Anda.',
  pegawai: 'Lakukan absensi dan lihat riwayat kehadiran Anda.',
};

const WelcomeCard = ({ user, isLoading }: { user: any, isLoading: boolean }) => (
    <div className="space-y-1 mb-8 w-full px-1">
        <p className="text-base text-muted-foreground leading-none">Selamat Datang</p>
        {isLoading ? (
            <Skeleton className="h-7 w-48 mt-2" />
        ) : (
            <h1 className="text-2xl font-bold mt-1">{user?.name || 'Pengguna'}</h1>
        )}
        {isLoading ? (
            <Skeleton className="h-4 w-72 mt-2" />
        ) : (
            <p className="text-sm text-muted-foreground mt-1">{roleDescriptions[user?.role || ''] || 'Selamat datang di dasbor Anda.'}</p>
        )}
    </div>
);

const StatCard = ({ title, value, icon: Icon, description, isLoading, className, onClick }: any) => (
    <Card className={cn("h-full flex flex-col transition-all duration-200 w-full", className)} onClick={onClick}>
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
                    {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
                </>
            )}
        </CardContent>
    </Card>
);

const PersonalAttendanceCardUI = ({ attendanceData, schoolConfig, isLoading }: { attendanceData: any, schoolConfig: any, isLoading: boolean }) => {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => { 
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId); 
    }, []);

    const attendanceRecord = attendanceData?.[0];
    const checkInTime = attendanceRecord?.checkInTime?.toDate();
    const checkOutTime = attendanceRecord?.checkOutTime?.toDate();

    let isLate = false;
    let isEarly = false;

    if (schoolConfig?.useTimeValidation && checkInTime && schoolConfig.checkInEndTime) {
        const [lateH, lateM] = schoolConfig.checkInEndTime.split(':').map(Number);
        const lateTime = new Date(checkInTime);
        lateTime.setHours(lateH, lateM, 0, 0);
        if (checkInTime > lateTime) isLate = true;
    }

    if (schoolConfig?.useTimeValidation && checkOutTime && schoolConfig.checkOutStartTime) {
        const [earlyH, earlyM] = schoolConfig.checkOutStartTime.split(':').map(Number);
        const earlyTime = new Date(checkOutTime);
        earlyTime.setHours(earlyH, earlyM, 0, 0);
        if (checkOutTime < earlyTime) isEarly = true;
    }

    const hasFinished = !!(checkInTime && checkOutTime);

    return (
        <Card className="w-full bg-card border-border shadow-sm overflow-hidden">
            <CardContent className="space-y-8 pb-8 pt-8 w-full">
                {isLoading ? (
                    <div className="w-full space-y-6">
                        <div className="flex flex-col items-center gap-2">
                            <Skeleton className="h-12 w-full max-w-[200px]" />
                            <Skeleton className="h-4 w-full max-w-[150px]" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 w-full">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="text-center w-full">
                            <p className="text-6xl font-bold tracking-tighter tabular-nums text-primary">
                                {format(currentTime, 'HH:mm:ss')}
                            </p>
                            <p className="text-sm font-medium text-muted-foreground mt-2">
                                {format(currentTime, 'eeee, d MMMM yyyy', { locale: id })}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 w-full">
                            <div className="flex flex-col items-center p-6 rounded-xl bg-muted/30 border shadow-sm w-full">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <LogIn size={16} className="text-muted-foreground" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Masuk</span>
                                </div>
                                <p className={cn("text-3xl font-bold tabular-nums", isLate ? "text-destructive" : "text-foreground")}>
                                    {checkInTime ? format(checkInTime, 'HH:mm') : '--:--'}
                                </p>
                            </div>
                            <div className="flex flex-col items-center p-6 rounded-xl bg-muted/30 border shadow-sm w-full">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <LogOut size={16} className="text-muted-foreground" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pulang</span>
                                </div>
                                <p className={cn("text-3xl font-bold tabular-nums", isEarly ? "text-destructive" : "text-foreground")}>
                                    {checkOutTime ? format(checkOutTime, 'HH:mm') : '--:--'}
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-0 pb-8 px-6 w-full">
                {!isLoading && (
                    <Button 
                        size="lg" 
                        className={cn("w-full h-12 text-base font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]", hasFinished && "opacity-50")}
                        onClick={() => !hasFinished && router.push('/dashboard/absen')}
                        disabled={hasFinished}
                    >
                        {hasFinished ? 'Absensi Selesai' : 'Absen Sekarang'}
                    </Button>
                )}
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground w-full"><Link href="/dashboard/laporan">Lihat Riwayat Lengkap</Link></Button>
            </CardFooter>
        </Card>
    );
};

const MonthlyAttendanceChartUI = ({ summaryData, isLoading }: { summaryData: any, isLoading: boolean }) => {
    return (
        <Card className="w-full border-border shadow-sm">
            <CardContent className="pt-6 w-full h-[350px]">
                {isLoading ? 
                    <Skeleton className="h-full w-full" /> : 
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                            { name: 'Hadir', jumlah: summaryData.attendanceCount || 0, fill: 'hsl(var(--primary))' },
                            { name: 'Sakit', jumlah: summaryData.sakitCount || 0, fill: '#f97316' },
                            { name: 'Izin', jumlah: summaryData.izinCount || 0, fill: '#facc15' },
                            { name: 'Alpa', jumlah: summaryData.alpaCount || 0, fill: '#ef4444' },
                        ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="jumlah" radius={[6, 6, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                }
            </CardContent>
        </Card>
    );
};

function useMonthlyAttendanceSummary(user: any) {
    const firestore = useFirestore();
    const cacheKey = useMemo(() => user ? `monthlySummary_v8_${user.uid}` : null, [user]);
    const [summary, setSummary] = useState<any>(() => cacheKey ? getFromCache(cacheKey) || null : null);
    const [isLoading, setIsLoading] = useState(summary === null);

    useEffect(() => {
        if (!user || !firestore || !cacheKey || summary !== null) return;
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const now = new Date();
                const stats = await calculateAttendanceStats(firestore, user.uid, { start: startOfMonth(now), end: endOfMonth(now) });
                const newSummary = { 
                    attendanceCount: stats.totalHadir, 
                    izinCount: stats.totalIzin, 
                    sakitCount: stats.totalSakit, 
                    alpaCount: stats.totalAlpa, 
                    percentage: stats.persentase ? stats.persentase.replace('%', '') : '0'
                };
                setSummary(newSummary);
                setInCache(cacheKey, newSummary, 900);
            } catch (error) { 
                console.error("Dashboard Stats Error:", error);
                setSummary({}); 
            } finally { 
                setIsLoading(false); 
            }
        };
        fetchStats();
    }, [user, firestore, cacheKey, summary]);

    return { summary: summary || {}, isLoading };
}

function useStaffDashboardStats(firestore: any, user: any) {
  const cacheKey = 'staffDashboardStats_v7';
  const [stats, setStats] = useState<any>(() => getFromCache(cacheKey) || null);
  const [isLoading, setIsLoading] = useState(stats === null);

  useEffect(() => {
    if (!firestore || !user || stats !== null) return;
    const fetchStats = async () => {
      setIsLoading(true);
      try {
        const dailyStats = await getDailyStaffAttendanceStats(firestore);
        setStats(dailyStats);
        setInCache(cacheKey, dailyStats, 300);
      } catch (error) { setStats({ totalStaff: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0, pending: 0 }); } finally { setIsLoading(false); }
    };
    fetchStats();
  }, [firestore, user, stats]);

  return { stats: stats || { totalStaff: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0, pending: 0 }, isLoading };
}

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const { stats, isLoading: isStatsLoading } = useStaffDashboardStats(firestore, user);
  const { summary: personalSummary, isLoading: isPersonalSummaryLoading } = useMonthlyAttendanceSummary(user);

  const todaysAttendanceQuery = useMemoFirebase(() => user ? query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('checkInTime', '>=', startOfDay(new Date())), limit(1)) : null, [firestore, user]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);

  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const role = user?.role;
  const isAdminOrKepsek = role === 'admin' || role === 'kepala_sekolah';
  const isGuruOrPegawai = role === 'guru' || role === 'pegawai';

  return (
    <PageWrapper>
        <div className="w-full">
            <WelcomeCard user={user} isLoading={isUserLoading} />

            {isGuruOrPegawai && (
                <div className="w-full space-y-12">
                    <div className="space-y-4 w-full">
                        <div className="px-1">
                            <h2 className="text-xl font-bold text-foreground">Kehadiran Anda Hari Ini</h2>
                            <p className="text-sm text-muted-foreground">Status kehadiran dan jam absensi Anda hari ini.</p>
                        </div>
                        <PersonalAttendanceCardUI 
                            attendanceData={todaysAttendance} 
                            schoolConfig={schoolConfig} 
                            isLoading={isAttendanceLoading || isUserLoading || isConfigLoading} 
                        />
                    </div>

                    <div className="space-y-4 w-full">
                        <div className="px-1">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                                <TrendingUp size={20} className="text-primary" /> Riwayat Bulan {format(new Date(), 'MMMM', { locale: id })}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Persentase kehadiran: <span className="font-bold text-primary">{isPersonalSummaryLoading ? '...' : `${personalSummary.percentage}%`}</span>
                            </p>
                        </div>
                        <MonthlyAttendanceChartUI 
                            summaryData={personalSummary} 
                            isLoading={isPersonalSummaryLoading || isUserLoading} 
                        />
                    </div>
                </div>
            )}

            {isAdminOrKepsek && (
                <div className="w-full space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                        <StatCard 
                            title="Hadir Hari Ini" 
                            value={stats.hadir} 
                            icon={UserCheck} 
                            isLoading={isStatsLoading || isUserLoading} 
                        />
                        <StatCard 
                            title="Izin/Sakit" 
                            value={stats.izin + stats.sakit} 
                            icon={BookUser} 
                            description={`${stats.izin} Izin, ${stats.sakit} Sakit`} 
                            isLoading={isStatsLoading || isUserLoading} 
                        />
                        <StatCard 
                            title="Menunggu" 
                            value={stats.pending} 
                            icon={MailWarning} 
                            description="Pengajuan tertunda" 
                            isLoading={isStatsLoading || isUserLoading} 
                            className="cursor-pointer hover:bg-accent/10 border-accent/20" 
                            onClick={() => router.push('/dashboard/izin-kepala-sekolah')} 
                        />
                    </div>
                    <div className="w-full"><TodaysActivityTable /></div>
                    <div className="w-full"><AbsentUsersTable /></div>
                </div>
            )}
        </div>
    </PageWrapper>
  );
}
