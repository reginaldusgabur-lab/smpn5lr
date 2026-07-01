'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval, addMonths, subMonths, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { TrendingUp, LogIn, LogOut, Sparkles, UserCheck, BookUser, MailWarning, Clock, Lock, AlertCircle, ChevronLeft, ChevronRight, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

import { calculateAttendanceStats, getDailyStaffAttendanceStats } from '@/lib/attendance';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';
import AbsentUsersTable from '@/components/dashboard/AbsentUsersTable';
import RecentAttendanceTable from '@/components/dashboard/RecentAttendanceTable';

const chartConfig = {
  Jumlah: {
    label: "Jumlah",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

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
            <h2 className="text-4xl font-bold tracking-tight tabular-nums text-foreground leading-none">
                {format(time, 'HH:mm:ss')}
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-wider opacity-60">
                {format(time, 'eeee, d MMMM yyyy', { locale: id })}
            </p>
        </div>
    );
};

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { status: windowStatus } = useAttendanceWindow();
  const isMounted = useRef(true);

  const [summaryMonth, setSummaryMonth] = useState(new Date());
  const [stats, setStats] = useState({ hadir: 0, izin: 0, sakit: 0, pending: 0, alpa: 0, isHoliday: false, isManualDisabled: false, isCalendarHoliday: false });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [personalSummary, setPersonalSummary] = useState({ percentage: '0.0', hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  const [isPersonalSummaryLoading, setIsPersonalSummaryLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    if (!firestore || !user?.uid || !isMounted.current) return;
    try {
        const dailyStats = await getDailyStaffAttendanceStats(firestore);
        if (isMounted.current) {
            setStats(dailyStats);
            setIsStatsLoading(false);
        }
    } catch (error) {
        if (isMounted.current) setIsStatsLoading(false);
    }
  }, [firestore, user?.uid]);

  const loadMonthlySummary = useCallback(async (month: Date) => {
      if (!firestore || !user?.uid || !isMounted.current) return;
      setIsPersonalSummaryLoading(true);
      try {
          const personalStats = await calculateAttendanceStats(firestore, user.uid, { 
              start: startOfMonth(month), 
              end: endOfMonth(month) 
          });
          if (isMounted.current) {
              setPersonalSummary({
                  percentage: personalStats.persentase.replace('%', ''),
                  hadir: Math.ceil(personalStats.totalHadir),
                  izin: personalStats.totalIzin,
                  sakit: personalStats.totalSakit,
                  alpa: personalStats.totalAlpa
              });
          }
      } finally {
          if (isMounted.current) setIsPersonalSummaryLoading(false);
      }
  }, [firestore, user?.uid]);

  useEffect(() => {
    isMounted.current = true;
    if (!isUserLoading && user?.uid) {
        loadDashboardData();
        loadMonthlySummary(summaryMonth);
    }
    return () => { isMounted.current = false; };
  }, [loadDashboardData, loadMonthlySummary, summaryMonth, user?.uid, isUserLoading]);

  const todaysAttendanceQuery = useMemoFirebase(() => {
      if (!user || !firestore) return null;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', todayStr), limit(1));
  }, [firestore, user]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);

  const todayLeaveQuery = useMemoFirebase(() => {
      if (!user || !firestore) return null;
      return query(
          collection(firestore, 'users', user.uid, 'leaveRequests'),
          where('status', '==', 'approved')
      );
  }, [user, firestore]);
  const { data: activeLeaves, isLoading: isLeaveLoading } = useCollection(user, todayLeaveQuery);

  const currentActiveLeave = useMemo(() => {
      if (!activeLeaves) return null;
      const now = new Date();
      return activeLeaves.find(l => isWithinInterval(now, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) }));
  }, [activeLeaves]);

  const chartData = useMemo(() => [
    { name: 'Hadir', Jumlah: personalSummary.hadir, color: 'hsl(var(--primary))' },
    { name: 'Sakit', Jumlah: personalSummary.sakit, color: '#f59e0b' },
    { name: 'Izin', Jumlah: personalSummary.izin, color: '#3b82f6' },
    { name: 'Alpa', Jumlah: personalSummary.alpa, color: '#ef4444' },
  ], [personalSummary]);

  const handlePrevMonth = () => {
    const minDate = new Date(2026, 0, 1);
    setSummaryMonth(prev => {
        const next = subMonths(prev, 1);
        return next < minDate ? prev : next;
    });
  };

  const handleNextMonth = () => {
      setSummaryMonth(prev => addMonths(prev, 1));
  };

  const canGoNext = !isSameMonth(summaryMonth, new Date());
  const canGoPrev = summaryMonth > new Date(2026, 0, 1);

  const renderAttendanceButton = () => {
    const record = todaysAttendance?.[0];
    const isCheckedIn = !!record?.checkInTime;
    const isCheckedOut = !!record?.checkOutTime;
    const isManualFinished = record?.manualEntry && (record?.reasonForUpdate === 'Pulang cepat' || record?.reasonForUpdate === 'Dinas siang');

    const disabledStyle = "w-full bg-primary/5 text-primary/40 border border-primary/10 font-bold rounded-xl h-12 flex items-center justify-center text-sm transition-all cursor-default select-none shadow-none";

    if (windowStatus === 'LOADING' || isAttendanceLoading || isLeaveLoading) {
        return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4 animate-spin" /> Memuat data...</div>;
    }

    if (currentActiveLeave) {
        return (
            <div className="w-full bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold rounded-xl h-12 flex items-center justify-center text-sm shadow-none">
                <Sparkles className="mr-2 w-4 h-4" /> 
                {currentActiveLeave.type} Disetujui
            </div>
        );
    }

    if (isCheckedOut || isManualFinished) {
        return <div className="w-full bg-green-500/5 text-green-600 border border-green-500/20 font-bold rounded-xl h-12 flex items-center justify-center text-sm shadow-none"><Sparkles className="mr-2 w-4 h-4" /> Absensi selesai</div>;
    }

    if (windowStatus === 'DISABLED' || stats.isManualDisabled) {
        return <div className="w-full bg-muted text-muted-foreground border border-border font-bold rounded-xl h-12 flex items-center justify-center text-sm shadow-none"><Lock className="mr-2 h-4 w-4" /> Sistem sedang dinonaktifkan</div>;
    }

    if (!isCheckedIn && (windowStatus === 'SESSION_INACTIVE' || stats.isHoliday)) {
        const label = stats.isCalendarHoliday ? 'Hari libur (Kalender)' : 'Hari libur rutin';
        return (
            <div className="w-full bg-muted text-muted-foreground border border-border font-bold rounded-xl h-12 flex items-center justify-center text-sm shadow-none">
                <Lock className="mr-2 h-4 w-4" /> {label}
            </div>
        );
    }

    if (windowStatus === 'CHECK_OUT_OPEN') {
        return (
            <Button asChild size="lg" className="w-full font-bold rounded-xl h-12 shadow-none active:scale-95 transition-all bg-blue-600 hover:bg-blue-700 text-white">
                <Link href="/dashboard/absen">Absen pulang sekarang</Link>
            </Button>
        );
    }

    if (!isCheckedIn) {
        if (windowStatus === 'BEFORE_IN') return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4" /> Belum waktu jam masuk</div>;
        if (windowStatus === 'CHECK_IN_OPEN') return <Button asChild size="lg" className="w-full font-bold rounded-xl h-12 shadow-none active:scale-95 transition-all"><Link href="/dashboard/absen">Absen masuk sekarang</Link></Button>;
        if (windowStatus === 'AFTER_IN') return <div className="w-full bg-destructive/5 text-destructive/60 border border-destructive/10 font-bold rounded-xl h-12 flex items-center justify-center text-sm shadow-none"><AlertCircle className="mr-2 h-4 w-4" /> Batas jam masuk berakhir</div>;
    }

    if (isCheckedIn && !isCheckedOut) {
        if (windowStatus === 'AFTER_IN') return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4" /> Belum waktu jam pulang</div>;
    }

    if (windowStatus === 'CLOSED') {
        return (
            <div className="w-full bg-destructive/5 text-destructive/60 border border-destructive/10 font-bold rounded-xl h-12 flex items-center justify-center text-sm shadow-none">
                <AlertCircle className="mr-2 h-4 w-4" /> Waktu absensi hari ini berakhir
            </div>
        );
    }
    
    return <div className={disabledStyle}><Clock className="mr-2 h-4 w-4" /> Menunggu jadwal absensi</div>;
  };

  if (isUserLoading) return <div className="w-full space-y-6 animate-pulse p-4"><div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-48" /></div><div className="pt-10 space-y-4"><Skeleton className="h-64 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div></div>;

  const isAdminOrKepsek = user?.role === 'admin' || user?.role === 'kepala_sekolah';
  const isStaff = ['guru', 'pegawai', 'siswa', 'kepala_sekolah'].includes(user?.role || '');

  return (
    <div className="w-full space-y-6 pb-10 flex flex-col items-stretch">
        <div className="w-full px-0">
            <p className="text-base text-muted-foreground font-bold">Selamat datang</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5 leading-tight">{user?.name || 'Pengguna'}</h1>
            <p className="text-sm text-muted-foreground mt-1 font-bold">
                {user?.role === 'admin' ? 'Pantau aktivitas kehadiran hari ini.' : 'Lakukan absensi dan lihat riwayat kehadiran Anda.'}
            </p>
        </div>

        {isStaff && (
            <div className="w-full space-y-6 flex flex-col items-stretch">
                <Card className="w-full border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden bg-card text-center">
                    <CardHeader className="p-6 text-primary border-b border-muted-foreground/5">
                        <CardTitle className="text-xl font-bold tracking-tight">Kehadiran hari ini</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4 pt-4">
                        <LiveClockUI />
                        <div className="grid grid-cols-2 gap-4 w-full">
                            <div className="bg-muted/30 rounded-xl p-3 text-center border border-border/40 flex flex-col items-center justify-center">
                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <LogIn className="w-3.5 h-3.5 text-primary" />
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Masuk</p>
                                </div>
                                <p className="text-xl font-bold tabular-nums text-foreground">
                                    {isAttendanceLoading ? '...' : (todaysAttendance?.[0]?.checkInTime ? format(todaysAttendance[0].checkInTime.toDate(), 'HH:mm') : '--:--')}
                                </p>
                            </div>
                            <div className="bg-muted/30 rounded-xl p-3 text-center border border-border/40 flex flex-col items-center justify-center">
                                <div className="flex items-center justify-center gap-2 mb-1.5">
                                    <LogOut className="w-3.5 h-3.5 text-primary" />
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Pulang</p>
                                </div>
                                <p className="text-xl font-bold tabular-nums text-foreground">
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

                <Card className="w-full border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden bg-card">
                    <CardHeader className="p-6 pb-2">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-foreground" />
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                                        Riwayat Bulan {format(summaryMonth, 'MMMM', { locale: id })}
                                    </h2>
                                </div>
                                <p className="text-sm font-medium text-muted-foreground">
                                    Persentase kehadiran: {isPersonalSummaryLoading ? '...' : `${personalSummary.percentage}%`}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full" 
                                    onClick={handlePrevMonth} 
                                    disabled={isPersonalSummaryLoading || !canGoPrev}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full" 
                                    onClick={handleNextMonth} 
                                    disabled={isPersonalSummaryLoading || !canGoNext}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-4">
                        <div className="w-full h-56 mt-4">
                            {isPersonalSummaryLoading ? (
                                <Skeleton className="h-full w-full rounded-xl" />
                            ) : (
                                <ChartContainer config={chartConfig} className="h-full w-full">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis 
                                            dataKey="name" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 11, fontWeight: 'medium', fill: 'currentColor' }} 
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 11, fill: 'currentColor' }} 
                                            allowDecimals={false} 
                                        />
                                        <ChartTooltip 
                                            cursor={{ fill: 'currentColor', opacity: 0.05, radius: 8 }} 
                                            content={<ChartTooltipContent hideLabel indicator="dot" />}
                                        />
                                        <Bar 
                                            dataKey="Jumlah" 
                                            radius={[6, 6, 0, 0]} 
                                            barSize={45}
                                        >
                                            {chartData.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        {isAdminOrKepsek && (
            <div className="w-full space-y-4 pt-4 border-t border-dashed border-border/50 flex flex-col items-stretch">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                    <Card className="bg-card border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden">
                        <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Hadir</CardTitle>
                            <div className="p-1.5 bg-green-50 rounded-lg">
                                <UserCheck className="h-3.5 w-3.5 text-green-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-1">
                            <div className="text-3xl font-bold text-green-600 tracking-tighter">
                                {isStatsLoading ? '...' : stats.hadir}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden">
                        <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Izin / Sakit</CardTitle>
                            <div className="p-1.5 bg-blue-50 rounded-lg">
                                <BookUser className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-1">
                            <div className="text-3xl font-bold text-blue-600 tracking-tighter">
                                {isStatsLoading ? '...' : stats.izin + stats.sakit}
                            </div>
                        </CardContent>
                    </Card>

                    <Link href="/dashboard/izin-kepala-sekolah" className="block">
                        <Card className="bg-card border border-muted-foreground/10 shadow-none rounded-xl hover:bg-muted/30 transition-all group overflow-hidden">
                            <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Menunggu</CardTitle>
                                <div className="p-1.5 bg-amber-50 rounded-lg group-hover:scale-110 transition-transform">
                                    <MailWarning className="h-3.5 w-3.5 text-amber-600" />
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-1">
                                <div className="text-3xl font-bold text-amber-600 tracking-tighter">
                                    {isStatsLoading ? '...' : stats.pending}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Card className="bg-card border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden">
                        <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Alpa</CardTitle>
                            <div className="p-1.5 bg-red-50 rounded-lg">
                                <UserX className="h-3.5 w-3.5 text-red-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-1">
                            <div className="text-3xl font-bold text-red-600 tracking-tighter">
                                {isStatsLoading ? '...' : stats.alpa}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div className="w-full space-y-4 pt-4 border-t border-dashed border-border/50 flex flex-col items-stretch">
                    <RecentAttendanceTable />
                    <AbsentUsersTable />
                </div>
            </div>
        )}
    </div>
  );
}
