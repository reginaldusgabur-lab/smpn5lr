'use client';

import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarOff, LogIn, LogOut, ClipboardCheck, ArrowRight, FileText, UserCheck } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, Timestamp, getDocs, getDoc, type DocumentData, collectionGroup } from 'firebase/firestore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// LiveClock component, kept internally to avoid touching other files
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

const KepalaSekolahDashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        <div className="space-y-1">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-3/4 !mt-2" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="w-full lg:col-span-2">
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-6 flex flex-col items-center justify-center pt-8">
                    <Skeleton className="h-[72px] w-1/2" />
                    <div className="grid grid-cols-2 gap-4 text-center w-full max-w-sm pt-4">
                        <Skeleton className="h-[88px] w-full" />
                        <Skeleton className="h-[88px] w-full" />
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                    <Skeleton className="h-11 w-full" />
                </CardFooter>
            </Card>
            <div className="space-y-6">
                {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <Skeleton className="h-4 w-1/2" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-1/4" />
                            <Skeleton className="h-3 w-3/4 mt-1" />
                        </CardContent>
                        { i > 0 && <CardFooter><Skeleton className="h-9 w-full" /></CardFooter> }
                    </Card>
                ))}
            </div>
        </div>
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent>
                <div className="space-y-1">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center space-x-4 p-2 border-b">
                            <Skeleton className="h-4 w-1/3 flex-1" />
                            <Skeleton className="h-4 w-1/4" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    </div>
);

async function fetchCollection(firestore: any, collectionName: string) {
    const snapshot = await getDocs(collection(firestore, collectionName));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
}

async function fetchGroup(firestore: any, groupName: string) {
    const snapshot = await getDocs(collectionGroup(firestore, groupName));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
}

async function fetchSingleDoc(firestore: any, collectionName: string, docId: string) {
    if (!firestore || !docId) return null;
    const docRef = doc(firestore, collectionName, docId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? snapshot.data() : null;
}

export default function KepalaSekolahDashboardPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  // --- Data Fetching ---
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);
  
  const isRoleLoading = isAuthLoading || isUserDataLoading;
  const isHeadmaster = !isRoleLoading && userData?.role === 'kepala_sekolah';

  const { data: schoolConfig, isLoading: isConfigLoading } = useQuery<DocumentData | null | undefined>({
    queryKey: ['schoolConfig', 'default'],
    queryFn: () => fetchSingleDoc(firestore, 'schoolConfig', 'default'),
    enabled: !!firestore && !!user,
  });

  const todaysPersonalAttendanceQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    return query(
      collection(firestore, 'users', user.uid, 'attendanceRecords'),
      where('checkInTime', '>=', Timestamp.fromDate(todayStart)),
      where('checkInTime', '<=', Timestamp.fromDate(todayEnd))
    );
  }, [user, firestore]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysPersonalAttendanceQuery);

  const { data: usersData, isLoading: isUsersLoading } = useQuery({
      queryKey: ['users'],
      queryFn: () => fetchCollection(firestore, 'users'),
      enabled: !!firestore && isHeadmaster,
  });

  const { data: dashboardData, isLoading: isDashboardDataLoading } = useQuery({
    queryKey: ['headmasterDashboardData', user?.uid],
    queryFn: async () => {
      try {
        const [attendanceDocs, leaveDocs] = await Promise.all([
          fetchGroup(firestore, 'attendanceRecords'),
          fetchGroup(firestore, 'leaveRequests')
        ]);

        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());
        const userMap = new Map(usersData?.map((u: any) => [u.id, u.role]));

        const allAttendance = attendanceDocs.filter((att: any) => {
          const checkIn = att.checkInTime?.toDate();
          const role = userMap.get(att.userId);
          return checkIn && checkIn >= todayStart && checkIn <= todayEnd && role && ['guru', 'kepala_sekolah', 'pegawai'].includes(role);
        });

        const allPendingLeave = leaveDocs.filter((req: any) => {
          const role = userMap.get(req.userId);
          return req.status === 'pending' && role && ['guru', 'kepala_sekolah', 'pegawai'].includes(role);
        });

        return { allAttendanceData: allAttendance, pendingLeaveRequests: allPendingLeave };
      } catch (error) {
        console.error("Failed to fetch headmaster dashboard data:", error);
        toast({
          variant: "destructive",
          title: "Gagal Memuat Data Dasbor",
          description: "Gagal mengambil data aktivitas terbaru.",
        });
        throw error;
      }
    },
    enabled: isHeadmaster && !!firestore && !!usersData,
  });

  const isLoading = isRoleLoading || isConfigLoading || isAttendanceLoading || isUsersLoading || (isHeadmaster && isDashboardDataLoading);

  useEffect(() => {
    if (!isRoleLoading) {
      if (!user) router.replace('/');
      else if (!isHeadmaster) router.replace('/dashboard');
    }
  }, [isRoleLoading, isHeadmaster, router, user]);

  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;
    if (schoolConfig.isAttendanceActive === false) return true;
    const today = new Date();
    const offDays: number[] = schoolConfig.offDays ?? [0]; 
    return offDays.includes(today.getDay());
  }, [schoolConfig]);

  const { staffPresentToday, totalStaff, recentStaffAttendance } = useMemo(() => {
    if (!usersData || !dashboardData || !isHeadmaster) {
      return { staffPresentToday: 0, totalStaff: 0, recentStaffAttendance: [] };
    }

    const userMap = new Map(usersData.map((u: any) => [u.id, u]));
    const staffAndTeachers = usersData.filter((u: any) => ['guru', 'kepala_sekolah', 'pegawai'].includes(u.role));
    const presentStaffIds = new Set(dashboardData.allAttendanceData.map((att: any) => att.userId));

    const sortedRecentAttendance = [...dashboardData.allAttendanceData].sort((a: any, b: any) => (b.checkInTime?.toDate().getTime() || 0) - (a.checkInTime?.toDate().getTime() || 0));

    const enrichedRecentAttendance = sortedRecentAttendance.map((att: any, index) => ({
      ...att,
      sequence: index + 1,
      name: userMap.get(att.userId)?.name || 'Pengguna tidak dikenal',
      checkInTimeFormatted: att.checkInTime ? att.checkInTime.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Belum absen masuk',
      checkOutTimeFormatted: att.checkOutTime ? att.checkOutTime.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Belum absen pulang',
      status: 'Hadir',
      statusVariant: 'default',
    }));

    return {
      totalStaff: staffAndTeachers.length,
      staffPresentToday: presentStaffIds.size,
      recentStaffAttendance: enrichedRecentAttendance,
    };
  }, [usersData, dashboardData, isHeadmaster]);

  if (isLoading || !isHeadmaster) {
    return <KepalaSekolahDashboardSkeleton />;
  }

  const todaysRecord = todaysAttendance?.[0];
  const checkInTime = todaysRecord?.checkInTime?.toDate();
  const checkOutTime = todaysRecord?.checkOutTime?.toDate();

  let isLate = false;
  let isEarly = false;

  if (schoolConfig?.useTimeValidation && checkInTime) {
    const [lateH, lateM] = schoolConfig.checkInEndTime.split(':').map(Number);
    const lateTime = new Date(checkInTime);
    lateTime.setHours(lateH, lateM, 0, 0);
    isLate = checkInTime > lateTime;
  }

  if (schoolConfig?.useTimeValidation && checkOutTime) {
    const [earlyH, earlyM] = schoolConfig.checkOutStartTime.split(':').map(Number);
    const earlyTime = new Date(checkOutTime);
    earlyTime.setHours(earlyH, earlyM, 0, 0);
    isEarly = checkOutTime < earlyTime;
  }

    let isPastCheckInTime = false;
    if (schoolConfig?.useTimeValidation && schoolConfig?.checkInEndTime && !checkInTime) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [inEndH, inEndM] = schoolConfig.checkInEndTime.split(':').map(Number);
        const checkInEndTime = inEndH * 60 + inEndM;
        if (currentTime > checkInEndTime) {
            isPastCheckInTime = true;
        }
    }

    let personalButtonAction;
    if ((checkInTime && !checkOutTime) || isPastCheckInTime) {
      personalButtonAction = <Button asChild size="lg" className="w-full"><Link href="/dashboard/absen">Absen Pulang</Link></Button>;
    } else if (!checkInTime) {
      personalButtonAction = <Button asChild size="lg" className="w-full"><Link href="/dashboard/absen">Absen Masuk</Link></Button>;
    } else {
      personalButtonAction = <Button disabled size="lg" className="w-full">Absensi Selesai</Button>;
    }
  
  if (isHoliday) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Selamat Datang</h1>
            <p className="text-lg text-muted-foreground">{(userData as any)?.name || 'Kepala Sekolah'}</p>
            <p className="text-muted-foreground !mt-2">Dasbor pemantauan untuk Kepala Sekolah.</p>
        </div>
        <Card className="w-full max-w-lg mx-auto">
          <CardHeader className="text-center items-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <CalendarOff className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Hari Libur</CardTitle>
            <CardDescription>Sistem absensi sedang tidak aktif. Nikmati hari libur Anda.</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center border-t pt-6">
             <Button asChild variant="outline">
              <Link href="/dashboard/admin/izin">
                Tinjau Pengajuan Izin
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Selamat Datang</h1>
        <p className="text-lg text-muted-foreground">{(userData as any)?.name || 'Kepala Sekolah'}</p>
        <p className="text-muted-foreground !mt-2">Ini adalah dasbor pribadi dan ringkasan pemantauan Anda.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="w-full lg:col-span-2">
          <CardHeader>
            <CardTitle>Kehadiran Anda Hari Ini</CardTitle>
            <CardDescription>Status kehadiran dan jam absensi pribadi Anda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex flex-col items-center justify-center pt-8">
            <LiveClock />
            <div className="grid grid-cols-2 gap-4 text-center w-full max-w-sm pt-4">
              <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                      <LogIn className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">Absen Masuk</p>
                  </div>
                <p className={cn("text-2xl font-bold text-foreground", isLate && "text-destructive")}>
                  {checkInTime ? format(checkInTime, 'HH:mm') : '--:--'}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                      <LogOut className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">Absen Pulang</p>
                  </div>
                <p className={cn("text-2xl font-bold text-foreground", isEarly && "text-destructive")}>
                  {checkOutTime ? format(checkOutTime, 'HH:mm') : '--:--'}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">{personalButtonAction}</CardFooter>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Guru &amp; Pegawai Hadir</CardTitle>
                <UserCheck className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">
                    {staffPresentToday}<span className="text-xl font-normal text-muted-foreground">/{totalStaff}</span>
                </div>
                <p className="text-xs text-muted-foreground">Guru &amp; pegawai yang tercatat masuk hari ini</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Persetujuan Izin</CardTitle>
              <ClipboardCheck className="h-5 w-5 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{dashboardData?.pendingLeaveRequests?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Permintaan izin/sakit tertunda</p>
            </CardContent>
            <CardFooter>
                <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/dashboard/admin/izin">Lihat Detail <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
            </CardFooter>
          </Card>
          
           <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Laporan</CardTitle>
              <FileText className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Akses semua laporan kehadiran sekolah.</p>
            </CardContent>
             <CardFooter>
                <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/dashboard/admin/laporan">Buka Laporan <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader>
            <CardTitle>Riwayat Kehadiran Guru &amp; Pegawai Terbaru</CardTitle>
            <CardDescription>Aktivitas kehadiran guru &amp; pegawai yang tercatat hari ini.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px] text-center">No.</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead className="text-center">Waktu Masuk</TableHead>
                            <TableHead className="text-center">Waktu Pulang</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentStaffAttendance.length > 0 ? (
                            recentStaffAttendance.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell className="text-center font-medium">{item.sequence}</TableCell>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-center">{item.checkInTimeFormatted}</TableCell>
                                    <TableCell className="text-center">{item.checkOutTimeFormatted}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={item.statusVariant as any}>{item.status}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    Belum ada aktivitas kehadiran dari guru &amp; pegawai hari ini.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
