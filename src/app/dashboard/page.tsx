'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, limit } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { TrendingUp, Clock, LogIn, LogOut, Sparkles, UserCheck, BookUser, MailWarning } from 'lucide-react';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Data Libs
import { calculateAttendanceStats, getDailyStaffAttendanceStats } from '@/lib/attendance';

// Components
import AbsentUsersTable from '@/components/dashboard/AbsentUsersTable';
import RecentAttendanceTable from '@/components/dashboard/RecentAttendanceTable';

// --- Custom Hooks ---

function useStaffDashboardStats(firestore: any, user: any) {
    const [stats, setStats] = useState({ hadir: 0, izin: 0, sakit: 0, pending: 0 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !user) return;
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const data = await getDailyStaffAttendanceStats(firestore);
                setStats(data);
            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [firestore, user]);

    return { stats, isLoading };
}

function useMonthlyAttendanceSummary(user: any) {
    const firestore = useFirestore();
    const [summary, setSummary] = useState({ percentage: '0', hadir: 0, izin: 0, sakit: 0, alpa: 0 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !user) return;
        const fetchSummary = async () => {
            setIsLoading(true);
            try {
                const now = new Date();
                const stats = await calculateAttendanceStats(firestore, user.uid, { 
                    start: startOfMonth(now), 
                    end: endOfMonth(now) 
                });
                setSummary({
                    percentage: stats.persentase.replace('%', ''),
                    hadir: Math.ceil(stats.totalHadir),
                    izin: stats.totalIzin,
                    sakit: stats.totalSakit,
                    alpa: stats.totalAlpa
                });
            } catch (error) {
                console.error("Error fetching summary:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSummary();
    }, [firestore, user]);

    return { summary, isLoading };
}

// --- Sub Components ---

const WelcomeCard = ({ user, isLoading }: { user: any, isLoading: boolean }) => {
    if (isLoading) return <Skeleton className="h-6 w-32 mb-2" />;
    return (
        <div className="mb-2 px-1">
            <h1 className="text-lg font-bold tracking-tight">Halo, <span className="text-primary">{user?.name?.split(' ')[0] || 'Pengguna'}</span></h1>
        </div>
    );
};

const StatCard = ({ title, value, icon: Icon, description, isLoading, className, onClick }: any) => (
    <Card className={cn("transition-all shadow-sm w-full cursor-default", className)} onClick={onClick}>
        <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
            <Icon className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
            {isLoading ? <Skeleton className="h-7 w-12" /> : <div className="text-xl font-black">{value}</div>}
            {description && <p className="text-[9px] text-muted-foreground mt-0.5">{description}</p>}
        </CardContent>
    </Card>
);

const LiveClock = () => {
    const [time, setTime] = useState<Date | null>(null);
    useEffect(() => {
        setTime(new Date());
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!time) return <div className="h-20" />;

    return (
        <div className="flex flex-col items-center justify-center py-2 mb-4 animate-in fade-in duration-500">
            <h2 className="text-5xl font-black tracking-tighter tabular-nums text-foreground leading-none">
                {format(time, 'HH:mm:ss')}
            </h2>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-2 bg-muted/40 px-3 py-1 rounded-full">
                {format(time, 'EEEE, d MMMM yyyy', { locale: id })}
            </p>
        </div>
    );
};

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const { stats, isLoading: isStatsLoading } = useStaffDashboardStats(firestore, user);
  const { summary: personalSummary, isLoading: isPersonalSummaryLoading } = useMonthlyAttendanceSummary(user);

  const todaysAttendanceQuery = useMemoFirebase(() => {
      if (!user || !firestore) return null;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', todayStr), limit(1));
  }, [firestore, user]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);

  const role = user?.role;
  const isAdminOrKepsek = role === 'admin' || role === 'kepala_sekolah';
  const isGuruOrPegawai = role === 'guru' || role === 'pegawai';

  const chartData = useMemo(() => [
    { name: 'Hadir', value: personalSummary.hadir, color: 'hsl(var(--primary))' },
    { name: 'Izin', value: personalSummary.izin, color: '#3b82f6' },
    { name: 'Sakit', value: personalSummary.sakit, color: '#f59e0b' },
    { name: 'Alpa', value: personalSummary.alpa, color: '#ef4444' },
  ], [personalSummary]);

  return (
    <PageWrapper>
        <div className="w-full space-y-4">
            <WelcomeCard user={user} isLoading={isUserLoading} />

            <LiveClock />

            {isGuruOrPegawai && (
                <div className="w-full space-y-6">
                    {/* AREA KEHADIRAN HARI INI */}
                    <Card className="w-full overflow-hidden shadow-md border-muted/50">
                        <CardHeader className="pb-3 space-y-1">
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                Kehadiran Anda Hari Ini
                            </CardTitle>
                            <CardDescription className="text-[11px]">Status kehadiran dan jam absensi harian Anda.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-muted/30 rounded-xl p-3 text-center border border-border/40">
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground mb-1">Masuk</p>
                                    <p className="text-xl font-black tabular-nums">
                                        {isAttendanceLoading ? '...' : (todaysAttendance?.[0]?.checkInTime ? format(todaysAttendance[0].checkInTime.toDate(), 'HH:mm') : '--:--')}
                                    </p>
                                </div>
                                <div className="bg-muted/30 rounded-xl p-3 text-center border border-border/40">
                                    <p className="text-[9px] uppercase font-bold text-muted-foreground mb-1">Pulang</p>
                                    <p className="text-xl font-black tabular-nums">
                                        {isAttendanceLoading ? '...' : (todaysAttendance?.[0]?.checkOutTime ? format(todaysAttendance[0].checkOutTime.toDate(), 'HH:mm') : '--:--')}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-muted/5 border-t py-4">
                            {todaysAttendance?.[0]?.checkInTime && !todaysAttendance?.[0]?.checkOutTime ? (
                                <Button asChild size="lg" className="w-full font-bold shadow-sm">
                                    <Link href="/dashboard/absen"><LogOut className="mr-2 w-4 h-4" /> Absen Pulang Sekarang</Link>
                                </Button>
                            ) : !todaysAttendance?.[0]?.checkInTime ? (
                                <Button asChild size="lg" className="w-full font-bold shadow-sm">
                                    <Link href="/dashboard/absen"><LogIn className="mr-2 w-4 h-4" /> Absen Masuk Sekarang</Link>
                                </Button>
                            ) : (
                                <Button disabled size="lg" className="w-full bg-green-500/10 text-green-600 border-green-500/20 font-bold">
                                    <Sparkles className="mr-2 w-4 h-4" /> Absensi Hari Ini Selesai
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    {/* AREA GRAFIK RIWAYAT */}
                    <Card className="w-full shadow-md">
                        <CardHeader className="pb-2">
                             <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-primary" />
                                        Riwayat Bulan {format(new Date(), 'MMMM', { locale: id })}
                                    </CardTitle>
                                    <CardDescription className="text-[11px] mt-1">
                                        Persentase kehadiran: <span className="font-bold text-primary">{isPersonalSummaryLoading ? '...' : `${personalSummary.percentage}%`}</span>
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="h-48 w-full">
                                {isPersonalSummaryLoading ? (
                                    <div className="h-full w-full flex items-center justify-center bg-muted/20 rounded-lg animate-pulse">
                                        <Skeleton className="h-full w-full" />
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                                            <Tooltip 
                                                cursor={{ fill: 'transparent' }} 
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                            />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            <div className="flex justify-center mt-4">
                                <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs font-bold text-primary">
                                    <Link href="/dashboard/laporan">Lihat Riwayat Lengkap &rarr;</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {isAdminOrKepsek && (
                <div className="w-full space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
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
                            className="cursor-pointer hover:bg-accent/5 border-primary/10" 
                            onClick={() => router.push('/dashboard/izin-kepala-sekolah')} 
                        />
                    </div>
                    <div className="w-full"><RecentAttendanceTable /></div>
                    <div className="w-full"><AbsentUsersTable /></div>
                </div>
            )}
        </div>
    </PageWrapper>
  );
}
