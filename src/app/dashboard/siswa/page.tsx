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
import { format, isBefore, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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

const DashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-1"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-3/4 !mt-2" /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="w-full lg:col-span-3">
          <CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader>
          <CardContent className="space-y-6 flex flex-col items-center justify-center pt-8"><Skeleton className="h-[72px] w-1/2" /><div className="grid grid-cols-2 gap-4 text-center w-full max-w-sm pt-4"><Skeleton className="h-[88px] w-full" /><Skeleton className="h-[88px] w-full" /></div></CardContent>
          <CardFooter className="flex flex-col gap-2"><Skeleton className="h-11 w-full" /><Skeleton className="h-10 w-full" /></CardFooter>
        </Card>
      </div>
    </div>
);


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

export default function SiswaDashboardPage() {
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

  const { data: pendingLeaveRequests, isLoading: isPendingLeaveLoading } = useQuery<DocumentData[]>({
      queryKey: ['pendingLeave', user?.uid],
      queryFn: () => fetchUserSubcollection(firestore, user!.uid, 'leaveRequests', [where('status', '==', 'pending')]),
      enabled: !!user && !!firestore,
  });

  const isLoading = isAuthLoading || isUserDataLoading || isConfigLoading || isAttendanceLoading || isPendingLeaveLoading;

  // --- Data Processing (Memos) ---
  
  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;
    if (schoolConfig.isAttendanceActive === false) return true;
    const today = new Date();
    const offDays: number[] = schoolConfig.offDays ?? [0]; 
    return offDays.includes(today.getDay());
  }, [schoolConfig]);
  
  // --- Render Logic ---

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
  
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isHoliday) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader className="text-center items-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4"><CalendarOff className="h-8 w-8 text-primary" /></div><CardTitle>Hari Libur</CardTitle><CardDescription>Sistem absensi sedang tidak aktif. Nikmati hari libur Anda.</CardDescription></CardHeader>
        <CardFooter className="flex justify-center border-t pt-6"><Button asChild variant="outline"><Link href="/dashboard/izin">Ajukan Izin/Sakit</Link></Button></CardFooter>
      </Card>
    );
  }

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
          <Card className="w-full lg:col-span-3">{renderAttendanceContent()}</Card>
        </div>
    </div>
  );
}
