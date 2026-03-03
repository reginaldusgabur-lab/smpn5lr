'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarOff, Check, FileText, Thermometer, LogIn, LogOut } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, Timestamp, orderBy, getDocs, getDoc, type DocumentData } from 'firebase/firestore';
import { format, isBefore, eachDayOfInterval, subDays, startOfDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AttendanceChart } from '@/components/dashboard/AttendanceChart';

// --- Helper Functions (kept internal) ---

function LiveClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  useEffect(() => {
    setCurrentTime(new Date());
    const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);
  return (
      <div className="flex flex-col items-center">
          <h2 className="text-5xl sm:text-6xl font-bold text-foreground tabular-nums tracking-tighter">
              {currentTime ? format(currentTime, 'HH:mm:ss') : '--:--:--'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
              {currentTime ? format(currentTime, 'eeee, d MMMM yyyy', { locale: id }) : 'Memuat tanggal...'}
          </p>
      </div>
  );
}

const ActivityItem = ({ icon: Icon, title, date, details, status, statusVariant }: { icon: React.ElementType, title: string, date: string, details?: string, status: string, statusVariant: 'default' | 'secondary' | 'destructive' }) => (
    <div className="flex items-start space-x-4 p-2 hover:bg-muted/50 rounded-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0 mt-1">
            <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center gap-2">
                <p className="font-medium text-sm truncate">{title}</p>
                <Badge variant={statusVariant} className="text-xs shrink-0">{status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{date}</p>
            {details && <p className="text-xs text-muted-foreground truncate" title={details}>{details}</p>}
        </div>
    </div>
);

const DashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-3/4 !mt-2" /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="w-full lg:col-span-2">
          <CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader>
          <CardContent className="space-y-6 flex flex-col items-center justify-center pt-8"><Skeleton className="h-[72px] w-1/2" /><div className="grid grid-cols-2 gap-4 text-center w-full max-w-sm pt-4"><Skeleton className="h-[88px] w-full" /><Skeleton className="h-[88px] w-full" /></div></CardContent>
          <CardFooter className="flex flex-col gap-2"><Skeleton className="h-11 w-full" /><Skeleton className="h-10 w-full" /></CardFooter>
        </Card>
        <Card className="w-full"><CardHeader><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent className="space-y-4">{[...Array(3)].map((_, i) => (<div key={i} className="flex items-start space-x-4 p-2"><Skeleton className="h-10 w-10 rounded-lg" /><div className="flex-1 space-y-2"><div className="flex justify-between"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-5 w-12 rounded-full" /></div><Skeleton className="h-3 w-1/2" /></div></div>))}</CardContent></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-1"><Skeleton className="h-[400px] w-full" /></div>
    </div>
);

const getStartOfLastNWorkDays = (n: number): Date => {
    let date = new Date();
    let workDaysFound = 0;
    while (workDaysFound < n) {
        if (date.getDay() !== 0 && date.getDay() !== 6) { workDaysFound++; }
        if (workDaysFound < n) { date.setDate(date.getDate() - 1); }
    }
    return startOfDay(date);
};

// --- Firestore Fetching Functions ---

async function fetchSingleDoc(firestore: any, collectionName: string, docId: string): Promise<DocumentData | null> {
    if (!firestore || !docId) return null;
    const docRef = doc(firestore, collectionName, docId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? snapshot.data() : null;
}

async function fetchUserSubcollection(firestore: any, userId: string, subcollectionName: string, queryConstraints: any[] = []): Promise<DocumentData[]> {
    if (!firestore || !userId) return [];
    const q = query(collection(firestore, 'users', userId, subcollectionName), ...queryConstraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
}

export default function GuruDashboardPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();

  // --- Data Fetching with React Query ---

  const { data: userData, isLoading: isUserDataLoading } = useQuery<DocumentData | null>({
    queryKey: ['user', user?.uid],
    queryFn: () => fetchSingleDoc(firestore, 'users', user!.uid),
    enabled: !!user && !!firestore,
  });

  const { data: schoolConfig, isLoading: isConfigLoading } = useQuery<DocumentData | null>({
    queryKey: ['schoolConfig'],
    queryFn: () => fetchSingleDoc(firestore, 'schoolConfig', 'default'),
    enabled: !!firestore,
  });

  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useQuery<DocumentData[]>({
    queryKey: ['todaysAttendance', user?.uid],
    queryFn: () => {
        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());
        return fetchUserSubcollection(firestore, user!.uid, 'attendanceRecords', [
            where('checkInTime', '>=', Timestamp.fromDate(todayStart)),
            where('checkInTime', '<=', Timestamp.fromDate(todayEnd))
        ]);
    },
    enabled: !!user && !!firestore
  });

  const { data: historyData, isLoading: isHistoryLoading } = useQuery<{ attendance: DocumentData[], leaves: DocumentData[] } | undefined>({
    queryKey: ['activityHistory', user?.uid],
    queryFn: async () => {
        const last6WorkDaysStart = getStartOfLastNWorkDays(6);
        const [attendance, leaves] = await Promise.all([
            fetchUserSubcollection(firestore, user!.uid, 'attendanceRecords', [
                where('checkInTime', '>=', Timestamp.fromDate(last6WorkDaysStart)),
                orderBy('checkInTime', 'desc')
            ]),
            fetchUserSubcollection(firestore, user!.uid, 'leaveRequests', [
                where('startDate', '>=', Timestamp.fromDate(last6WorkDaysStart)),
                orderBy('startDate', 'desc')
            ])
        ]);
        return { attendance, leaves };
    },
    enabled: !!user && !!firestore
  });

  const { data: monthlyData, isLoading: isMonthlyLoading } = useQuery<{ attendance: DocumentData[], leaves: DocumentData[] } | undefined>({
    queryKey: ['monthlySummary', user?.uid],
    queryFn: async () => {
        const last30DaysStart = startOfDay(subDays(new Date(), 30));
        const [attendance, leaves] = await Promise.all([
             fetchUserSubcollection(firestore, user!.uid, 'attendanceRecords', [
                where('checkInTime', '>=', Timestamp.fromDate(last30DaysStart)),
                orderBy('checkInTime', 'desc')
            ]),
             fetchUserSubcollection(firestore, user!.uid, 'leaveRequests', [
                where('startDate', '>=', Timestamp.fromDate(last30DaysStart)),
                orderBy('startDate', 'desc')
            ])
        ]);
        return { attendance, leaves };
    },
    enabled: !!user && !!firestore,
  });

  const { data: pendingLeaveRequests, isLoading: isPendingLeaveLoading } = useQuery<DocumentData[]>({
      queryKey: ['pendingLeave', user?.uid],
      queryFn: () => fetchUserSubcollection(firestore, user!.uid, 'leaveRequests', [where('status', '==', 'pending')]),
      enabled: !!user && !!firestore,
  });

  const isLoading = isAuthLoading || isUserDataLoading || isConfigLoading || isAttendanceLoading || isHistoryLoading || isMonthlyLoading || isPendingLeaveLoading;

  // --- Data Processing (Memos) ---

  const recentActivity = useMemo(() => {
    if (!historyData) return [];
    const { attendance: attendanceHistory, leaves: leaveHistory } = historyData;

    const attendanceRecords = attendanceHistory.map(rec => {
        const checkInTime = rec.checkInTime?.toDate();
        const checkOutTime = rec.checkOutTime?.toDate();
        let detailsText = checkInTime && checkOutTime ? `Jam: ${format(checkInTime, 'HH:mm')} - ${format(checkOutTime, 'HH:mm')}` : checkInTime ? `Jam Masuk: ${format(checkInTime, 'HH:mm')}` : undefined;
        return { id: rec.id, date: checkInTime, type: 'Hadir', details: detailsText, status: 'Hadir' };
    });

    const leaveRecords = leaveHistory.filter(l => l.status === 'approved').flatMap(rec => {
        try {
            const sDate = rec.startDate.toDate();
            const eDate = rec.endDate.toDate();
            if (isBefore(eDate, sDate)) return [];
            return eachDayOfInterval({ start: startOfDay(sDate), end: endOfDay(eDate) }).map(loopDate => ({
                id: `${rec.id}-${format(loopDate, 'yyyy-MM-dd')}`,
                date: loopDate,
                type: rec.type,
                details: rec.reason,
                status: rec.type,
            }));
        } catch (e) { return []; }
    });

    const combined = [...attendanceRecords, ...leaveRecords];
    combined.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return combined;
  }, [historyData]);

  const attendanceChartData = useMemo(() => {
    if (!monthlyData || !schoolConfig) return [];
    const { attendance: monthlyAttendance, leaves: monthlyLeave } = monthlyData;

    const dateRange = eachDayOfInterval({ start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) });
    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    const workDays = dateRange.filter(day => !offDays.includes(day.getDay()));
    const attendanceDates = new Set(monthlyAttendance.map(rec => format(rec.checkInTime.toDate(), 'yyyy-MM-dd')));
    const leaveMap = new Map<string, string>();

    monthlyLeave.filter(l => l.status === 'approved').forEach(rec => {
        try {
            const sDate = startOfDay(rec.startDate.toDate());
            const eDate = endOfDay(rec.endDate.toDate());
            if (isBefore(eDate, sDate)) return;
            eachDayOfInterval({ start: sDate, end: eDate }).forEach(day => leaveMap.set(format(day, 'yyyy-MM-dd'), rec.type));
        } catch(e) { console.error("Error processing leave for chart:", e, rec) }
    });

    let hadir = 0, izin = 0, sakit = 0, dinas = 0, alpa = 0;
    const today = new Date();

    for (const day of workDays) {
        if (isBefore(today, day)) continue;
        const dayStr = format(day, 'yyyy-MM-dd');
        if (attendanceDates.has(dayStr)) hadir++;
        else if (leaveMap.has(dayStr)) {
            const type = leaveMap.get(dayStr);
            if (type === 'Izin') izin++; else if (type === 'Sakit') sakit++; else if (type === 'Dinas') dinas++;
        } else alpa++;
    }

    return [{ name: 'Hadir', total: hadir }, { name: 'Izin', total: izin }, { name: 'Sakit', total: sakit }, { name: 'Dinas', total: dinas }, { name: 'Alpa', total: alpa }];
  }, [monthlyData, schoolConfig]);
  
  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;
    if (schoolConfig.isAttendanceActive === false) return true;
    const today = new Date();
    const offDays: number[] = schoolConfig.offDays ?? [0];
    return offDays.includes(today.getDay());
  }, [schoolConfig]);
  
  // --- Render Logic ---

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const renderAttendanceContent = () => {
    const todaysRecord = todaysAttendance?.[0];
    const checkInTime = todaysRecord?.checkInTime?.toDate();
    const checkOutTime = todaysRecord?.checkOutTime?.toDate();

    let isLate = false, isEarly = false;
    if (schoolConfig?.useTimeValidation && checkInTime) {
      const [lateH, lateM] = schoolConfig.checkInEndTime.split(':').map(Number);
      const lateTime = new Date(checkInTime); lateTime.setHours(lateH, lateM, 0, 0);
      if (checkInTime > lateTime) isLate = true;
    }
    if (schoolConfig?.useTimeValidation && checkOutTime) {
      const [earlyH, earlyM] = schoolConfig.checkOutStartTime.split(':').map(Number);
      const earlyTime = new Date(checkOutTime); earlyTime.setHours(earlyH, earlyM, 0, 0);
      if (checkOutTime < earlyTime) isEarly = true;
    }

    let buttonAction = checkInTime && !checkOutTime 
      ? <Button asChild size="lg" className="w-full"><Link href="/dashboard/absen">Absen Pulang</Link></Button>
      : !checkInTime 
      ? <Button asChild size="lg" className="w-full"><Link href="/dashboard/absen">Absen Masuk</Link></Button>
      : <Button disabled size="lg" className="w-full">Absensi Selesai</Button>;

    return (
      <>
        <CardHeader><CardTitle>Kehadiran Anda Hari Ini</CardTitle><CardDescription>Status kehadiran dan jam absensi Anda.</CardDescription></CardHeader>
        <CardContent className="space-y-6 flex flex-col items-center justify-center pt-8">
          <LiveClock />
          <div className="grid grid-cols-2 gap-4 text-center w-full max-w-sm pt-4">
            <div className="rounded-lg border bg-card p-4"><div className="flex items-center justify-center gap-2 mb-1"><LogIn className="w-4 h-4 text-muted-foreground" /><p className="text-sm font-medium text-muted-foreground">Absen Masuk</p></div><p className={cn("text-2xl font-bold text-foreground", isLate && "text-destructive")}>{checkInTime ? format(checkInTime, 'HH:mm') : '--:--'}</p></div>
            <div className="rounded-lg border bg-card p-4"><div className="flex items-center justify-center gap-2 mb-1"><LogOut className="w-4 h-4 text-muted-foreground" /><p className="text-sm font-medium text-muted-foreground">Absen Pulang</p></div><p className={cn("text-2xl font-bold text-foreground", isEarly && "text-destructive")}>{checkOutTime ? format(checkOutTime, 'HH:mm') : '--:--'}</p></div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">{buttonAction}<Button asChild variant="ghost" className="w-full"><Link href="/dashboard/laporan">Lihat Riwayat Lengkap</Link></Button></CardFooter>
      </>
    );
  };

  if (isHoliday) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader className="text-center items-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4"><CalendarOff className="h-8 w-8 text-primary" /></div><CardTitle>Hari Libur</CardTitle><CardDescription>Sistem absensi sedang tidak aktif. Nikmati hari libur Anda.</CardDescription></CardHeader>
        <CardFooter className="flex justify-center border-t pt-6"><Button asChild variant="outline"><Link href="/dashboard/izin">Ajukan Izin/Sakit</Link></Button></CardFooter>
      </Card>
    );
  }

  const activityConfig: { [key: string]: { icon: React.ElementType, variant: 'default' | 'secondary' | 'destructive' } } = {
    'Hadir': { icon: Check, variant: 'default' },
    'Sakit': { icon: Thermometer, variant: 'destructive' },
    'Izin': { icon: FileText, variant: 'secondary' },
    'Dinas': { icon: FileText, variant: 'secondary' },
  };

  return (
    <div className="space-y-6">
       <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Selamat Datang</h1>
            <p className="text-lg text-muted-foreground">{userData?.name || 'Pengguna'}</p>
            <p className="text-muted-foreground !mt-2">Ini adalah ringkasan kehadiran dan aktivitas Anda hari ini.</p>
        </div>

        {pendingLeaveRequests && pendingLeaveRequests.length > 0 && (
            <Alert variant="default" className="bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                <FileText className="h-4 w-4" /><AlertTitle className="font-semibold text-amber-950 dark:text-amber-300">Pengajuan Izin/Sakit Sedang Ditinjau</AlertTitle>
                <AlertDescription>Anda memiliki 1 atau lebih pengajuan yang sedang menunggu persetujuan. Statusnya dapat dilihat pada halaman <Link href="/dashboard/laporan" className="font-bold underline hover:text-amber-700 dark:hover:text-amber-100">Laporan</Link>.</AlertDescription>
            </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="w-full lg:col-span-2">{renderAttendanceContent()}</Card>
          <Card className="w-full">
              <CardHeader><CardTitle>Aktivitas Terkini</CardTitle><CardDescription>Catatan kehadiran &amp; izin dalam 6 hari kerja terakhir.</CardDescription></CardHeader>
              <CardContent className="space-y-2">{
                  recentActivity.length > 0 ? (
                      recentActivity.map(activity => {
                          const config = activityConfig[activity.type] || activityConfig['Hadir'];
                          return <ActivityItem key={activity.id} icon={config.icon} title={activity.type} date={activity.date ? format(activity.date, 'eeee, d MMM yyyy', { locale: id }) : 'Tanggal tidak valid'} details={activity.details} status={activity.status} statusVariant={config.variant}/>;
                      })
                  ) : <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground h-full"><p className="text-sm">Belum ada aktivitas.</p></div>
              }</CardContent>
          </Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-1"><AttendanceChart data={attendanceChartData} /></div>
    </div>
  );
}
