'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { TrendingUp, LogIn, LogOut, Sparkles, UserCheck, BookUser, MailWarning, Clock, Lock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { calculateAttendanceStats, getDailyStaffAttendanceStats } from '@/lib/attendance';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';
import AbsentUsersTable from '@/components/dashboard/AbsentUsersTable';
import RecentAttendanceTable from '@/components/dashboard/RecentAttendanceTable';

const LiveClockUI = () => {
    const [time, setTime] = useState<Date | null>(null);
    useEffect(() => {
        setTime(new Date());
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!time) return <div className="h-16 w-full flex items-center justify-center"><Skeleton className="h-10 w-40" /></div>;

    return (
        <div className="flex flex-col items-center justify-center pt-0 pb-2 w-full">
            <h2 className="text-5xl font-black tracking-tighter tabular-nums text-foreground leading-none">
                {format(time, 'HH:mm:ss')}
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground mt-1.5 uppercase tracking-widest opacity-70">
                {format(time, 'eeee, d MMMM yyyy', { locale: id })}
            </p>
        </div>
    );
};

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { status: windowStatus } = useAttendanceWindow();

  const [stats, setStats] = useState({ hadir: 0, izin: 0, sakit: 0, pending: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [personalSummary, setPersonalSummary] = useState({ percentage: '0', hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  const [isPersonalSummaryLoading, setIsPersonalSummaryLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) return;
    const loadDashboardData = async () => {
        setIsStatsLoading(true);
        setIsPersonalSummaryLoading(true);
        try {
            const now = new Date();
            const [dailyStats, personalStats] = await Promise.all([
                getDailyStaffAttendanceStats(firestore),
                calculateAttendanceStats(firestore, user.uid, { start: startOfMonth(now), end: endOfMonth(now) })
            ]);
            setStats(dailyStats);
            setPersonalSummary({
                percentage: personalStats.persentase.replace('%', ''),
                hadir: Math.ceil(personalStats.totalHadir),
                izin: personalStats.totalIzin,
                sakit: personalStats.totalSakit,
                alpa: personalStats.totalAlpa
            });
        } catch (error) {
            console.error("Dashboard error:", error);
        } finally {
            setIsStatsLoading(false);
            setIsPersonalSummaryLoading(false);
        }
    };
    loadDashboardData();
  }, [firestore, user]);

  const todaysAttendanceQuery = useMemoFirebase(() => {
      if (!user || !firestore) return null;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', todayStr), limit(1));
  }, [firestore, user]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);

  const chartData = useMemo(() => [
    { name: 'Hadir', value: personalSummary.hadir, color: 'hsl(var(--primary))' },
    { name: 'Izin', value: personalSummary.izin, color: '#3b82f6' },
    { name: 'Sakit', value: personalSummary.sakit, color: '#f59e0b' },
    { name: 'Alpa', value: personalSummary.alpa, color: '#ef4444' },
  ], [personalSummary]);

  if (isUserLoading) {
    return (
        <div className="w-full space-y-6 animate-pulse p-4">
            <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-48" />
            </div>
            <div className="pt-10 space-y-4">
                <Skeleton className="h-64 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        </div>
    );
  }

  const role = user?.role;
  const isAdminOrKepsek = role === 'admin' || role === 'kepala_sekolah';
  const isStaff = role === 'guru' || role === 'pegawai' || role === 'siswa' || role === 'kepala_sekolah';

  const renderAttendanceButton = () => {
    const record = todaysAttendance?.[0];
    const isCheckedIn = !!record?.checkInTime;
    const isCheckedOut = !!record?.checkOutTime;

    const disabledStyle = "w-full bg-primary/5 text-primary/40 border border-primary/10 font-bold rounded-xl h-12 flex items-center justify-center text-sm transition-all cursor-default select-none";

    if (windowStatus === 'LOADING' || isAttendanceLoading) {
        return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4 animate-spin" /> Memuat data...</div>;
    }

    if (windowStatus === 'SESSION_INACTIVE') {
        return <div className="w-full bg-muted text-muted-foreground border border-border font-bold rounded-xl h-12 flex items-center justify-center text-sm"><Lock className="mr-2 h-4 w-4" /> Sistem nonaktif / Hari libur</div>;
    }

    if (isCheckedOut) {
        return <div className="w-full bg-green-500/5 text-green-600 border border-green-500/20 font-black rounded-xl h-12 flex items-center justify-center text-sm uppercase tracking-wide"><Sparkles className="mr-2 w-4 h-4" /> Absensi selesai</div>;
    }

    if (!isCheckedIn) {
        if (windowStatus === 'BEFORE_IN') {
            return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4" /> Belum waktu jam masuk</div>;
        }
        if (windowStatus === 'CHECK_IN_OPEN') {
            return <Button asChild size="lg" className="w-full font-bold rounded-xl h-12 shadow-lg active:scale-95 transition-all"><Link href="/dashboard/absen">Absen Masuk Sekarang</Link></Button>;
        }
        return <div className="w-full bg-destructive/5 text-destructive/60 border border-destructive/10 font-bold rounded-xl h-12 flex items-center justify-center text-sm"><AlertCircle className="mr-2 h-4 w-4" /> Batas jam masuk berakhir</div>;
    }

    if (windowStatus === 'CHECK_OUT_OPEN') {
        return <Button asChild size="lg" className="w-full font-bold rounded-xl h-12 shadow-lg active:scale-95 transition-all"><Link href="/dashboard/absen">Absen Pulang Sekarang</Link></Button>;
    }
    if (windowStatus === 'AFTER_IN' || windowStatus === 'CHECK_IN_OPEN') {
        return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4" /> Belum waktu jam pulang</div>;
    }
    
    return <div className="w-full bg-destructive/5 text-destructive/60 border border-destructive/10 font-bold rounded-xl h-12 flex items-center justify-center text-sm"><AlertCircle className="mr-2 h-4 w-4" /> Waktu absen pulang berakhir</div>;
  };

  return (
    <div className="w-full space-y-6 pb-10 flex flex-col items-stretch">
        <div className="w-full px-0">
            <p className="text-base text-muted-foreground font-medium">Selamat datang</p>
            <h1 className="text-2xl font-black tracking-tight text-foreground mt-0.5 leading-tight">
                {user?.name || 'Pengguna'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
                {role === 'admin' 
                  ? 'Pantau aktivitas kehadiran dan kelola data sekolah hari ini.' 
                  : 'Lakukan absensi dan lihat riwayat kehadiran Anda hari ini.'}
            </p>
        </div>

        {isStaff && (
            <div className="w-full space-y-6 flex flex-col items-stretch">
                <Card className="w-full border shadow-xl rounded-3xl overflow-hidden bg-card">
                    <CardHeader className="p-6 text-primary border-b border-muted-foreground/5">
                        <div className="flex items-center justify-center">
                            <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight text-center">
                                Kehadiran Anda hari ini
                            </CardTitle>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="p-6 space-y-4 pt-4">
                        <LiveClockUI />
                        
                        <div className="grid grid-cols-2 gap-4 w-full">
                            <div className="bg-muted/30 rounded-2xl p-3 text-center border border-border/40 flex flex-col items-center justify-center">
                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <LogIn className="w-3.5 h-3.5 text-primary" />
                                    <p className="text-[10px] font-black text-primary uppercase tracking-wider">Masuk</p>
                                </div>
                                <p className="text-2xl font-black tabular-nums text-foreground">
                                    {isAttendanceLoading ? '...' : (todaysAttendance?.[0]?.checkInTime ? format(todaysAttendance[0].checkInTime.toDate(), 'HH:mm') : '--:--')}
                                </p>
                            </div>
                            <div className="bg-muted/30 rounded-2xl p-3 text-center border border-border/40 flex flex-col items-center justify-center">
                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <LogOut className="w-3.5 h-3.5 text-primary" />
                                    <p className="text-[10px] font-black text-primary uppercase tracking-wider">Pulang</p>
                                </div>
                                <p className="text-2xl font-black tabular-nums text-foreground">
                                    {isAttendanceLoading ? '...' : (todaysAttendance?.[0]?.checkOutTime ? format(todaysAttendance[0].checkOutTime.toDate(), 'HH:mm') : '--:--')}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col items-stretch gap-3">
                            {renderAttendanceButton()}
                            <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
                                <Link href="/dashboard/laporan">Lihat riwayat lengkap</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="w-full border shadow-xl rounded-3xl overflow-hidden bg-card">
                    <CardHeader className="p-6 text-primary border-b border-muted-foreground/5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <TrendingUp className="w-5 h-5" />
                                <h2 className="text-xs font-black uppercase tracking-widest">
                                    Ringkasan bulanan
                                </h2>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 bg-primary/10 px-2 py-1 rounded-lg">
                                Skor: {isPersonalSummaryLoading ? '...' : `${personalSummary.percentage}%`}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-8">
                        <div className="w-full h-44">
                            {isPersonalSummaryLoading ? (
                                <Skeleton className="h-full w-full rounded-2xl" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -40, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: 'currentColor' }} className="text-foreground" />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-foreground" allowDecimals={false} />
                                        <Tooltip 
                                            cursor={{ fill: 'rgba(0,0,0,0.03)' }} 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                                        />
                                        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        {isAdminOrKepsek && (
            <div className="w-full space-y-8 pt-4 border-t border-dashed border-border/50 flex flex-col items-stretch">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    <Card className="bg-card border-none shadow-xl rounded-3xl overflow-hidden">
                        <CardHeader className="p-4 text-green-700 border-b border-muted-foreground/5">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-widest">Hadir</p>
                                <UserCheck className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="text-3xl font-black text-green-700 dark:text-green-400">{isStatsLoading ? '...' : stats.hadir}</div>
                        </CardContent>
                    </Card>
                    
                    <Card className="bg-card border-none shadow-xl rounded-3xl overflow-hidden">
                        <CardHeader className="p-4 text-blue-700 border-b border-muted-foreground/5">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-widest">Izin / Sakit</p>
                                <BookUser className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="text-3xl font-black text-blue-700 dark:text-blue-400">{isStatsLoading ? '...' : stats.izin + stats.sakit}</div>
                        </CardContent>
                    </Card>

                    <Link href="/dashboard/izin-kepala-sekolah" className="block">
                        <Card className="bg-card border-none shadow-xl rounded-3xl hover:opacity-95 transition-all group overflow-hidden">
                            <CardHeader className="p-4 text-amber-700 border-b border-muted-foreground/5">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-widest">Menunggu</p>
                                    <MailWarning className="h-4 w-4 group-hover:scale-110 transition-transform" />
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="text-3xl font-black text-amber-700 dark:text-amber-400">{isStatsLoading ? '...' : stats.pending}</div>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
                
                <div className="w-full space-y-10 flex flex-col items-stretch">
                    <RecentAttendanceTable />
                    <AbsentUsersTable />
                </div>
            </div>
        )}
    </div>
  );
}
