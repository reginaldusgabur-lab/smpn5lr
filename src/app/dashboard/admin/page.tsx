'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserCheck, Users, FileWarning, ShieldAlert, FileText, CalendarOff, Lock, UserX, BookUser } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMemo, useEffect, useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, getDocs, type DocumentData, collectionGroup, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { startOfDay, endOfDay, format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getDailyStaffAttendanceStats } from '@/lib/attendance';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default', 'Pulang': 'secondary', 'Sakit': 'destructive', 'Izin': 'secondary', 'Terlambat': 'outline',
}

const AdminDashboardSkeletons = () => (
    <div className="space-y-6">
        <div className="space-y-1">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-3/4 !mt-2" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-5 w-5 rounded-full" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-1/4" />
                        <Skeleton className="h-3 w-3/4 mt-1" />
                    </CardContent>
                </Card>
            ))}
        </div>
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
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


export default function AdminDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isHoliday, setIsHoliday] = useState(false);
  const [isManualDisabled, setIsManualDisabled] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isRoleCheckLoading = isUserLoading || isUserDataLoading;
  const isAdmin = !isRoleCheckLoading && userData?.role === 'admin';

  const allUsersQuery = useMemoFirebase(() => (isAdmin && firestore) ? collection(firestore, 'users') : null, [firestore, isAdmin]);
  const { data: usersData, isLoading: isUsersLoading } = useCollection(user, allUsersQuery);
  
  const [dashboardData, setDashboardData] = useState({
    allAttendanceData: [] as DocumentData[],
    pendingLeaveRequests: [] as DocumentData[],
    stats: { hadir: 0, izin: 0, sakit: 0, pending: 0, alpa: 0 }
  });
  const [isDashboardDataLoading, setIsDashboardDataLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin || !firestore || !usersData) {
        if (!isUsersLoading) setIsDashboardDataLoading(false);
        return;
    }

    const fetchDashboardData = async () => {
        setIsDashboardDataLoading(true);
        try {
            const today = new Date();
            const todayStr = format(today, 'yyyy-MM-dd');
            const dailyStats = await getDailyStaffAttendanceStats(firestore);
            
            setIsManualDisabled(!!dailyStats.isManualDisabled);
            setIsHoliday(!!dailyStats.isHoliday);

            const attendanceQuery = collectionGroup(firestore, 'attendanceRecords');
            const leaveQuery = collectionGroup(firestore, 'leaveRequests');
            
            const [attendanceSnap, leaveSnap] = await Promise.all([
                getDocs(attendanceQuery),
                getDocs(leaveQuery)
            ]);

            const todayStart = startOfDay(new Date());
            const todayEnd = endOfDay(new Date());

            const allAttendance = attendanceSnap.docs
                .map(d => ({ ...d.data(), id: d.id }))
                .filter(att => {
                    const dStr = att.date || (att.checkInTime ? format(att.checkInTime.toDate(), 'yyyy-MM-dd') : null);
                    return dStr === todayStr;
                });

            const userMap = new Map(usersData.map(u => [u.id, u.role]));
            const allPendingLeave = leaveSnap.docs
                .map(d => ({ ...d.data(), id: d.id }))
                .filter(req => {
                    const userRole = userMap.get(req.userId);
                    return userRole && ['guru', 'kepala_sekolah', 'pegawai'].includes(userRole) && req.status === 'pending';
                });

            setDashboardData({
                allAttendanceData: allAttendance,
                pendingLeaveRequests: allPendingLeave,
                stats: {
                    hadir: dailyStats.hadir,
                    izin: dailyStats.izin,
                    sakit: dailyStats.sakit,
                    pending: dailyStats.pending,
                    alpa: dailyStats.alpa
                }
            });
        } catch (error) {
            console.error("Dashboard error:", error);
            toast({ variant: "destructive", title: "Error", description: "Gagal memuat data aktivitas." });
        } finally {
            setIsDashboardDataLoading(false);
        }
    };

    fetchDashboardData();
  }, [isAdmin, firestore, usersData, isUsersLoading, toast]);
  
  useEffect(() => {
    if (!isRoleCheckLoading) {
      if (!user) { router.replace('/'); } 
      else if (!isAdmin) { router.replace('/dashboard'); }
    }
  }, [isRoleCheckLoading, user, isAdmin, router]);

  const recentUserActivity = useMemo(() => {
    if (!usersData || !dashboardData.allAttendanceData || !isAdmin) return [];
    const userMap = new Map(usersData.map(u => [u.id, u]));
    
    return [...dashboardData.allAttendanceData]
        .sort((a, b) => {
            const timeA = a.checkInTime?.toDate().getTime() || a.checkOutTime?.toDate().getTime() || 0;
            const timeB = b.checkInTime?.toDate().getTime() || b.checkOutTime?.toDate().getTime() || 0;
            return timeB - timeA;
        })
        .map((att, index) => {
            const userDoc = userMap.get(att.userId);
            return {
                ...att,
                sequence: index + 1,
                name: userDoc?.name || 'Pengguna tidak dikenal',
                role: (userDoc?.role || 'user').replace('_', ' '),
                checkInTimeFormatted: att.checkInTime ? format(att.checkInTime.toDate(), 'HH:mm:ss') : '-',
                checkOutTimeFormatted: att.checkOutTime ? format(att.checkOutTime.toDate(), 'HH:mm:ss') : '-',
                status: att.checkOutTime ? 'Pulang' : 'Hadir',
            };
        });
  }, [usersData, dashboardData.allAttendanceData, isAdmin]);

  if (isRoleCheckLoading || isUsersLoading || isDashboardDataLoading || !isAdmin) {
    return <AdminDashboardSkeletons />;
  }
  
  const isTemporaryAdmin = user?.email === 'admin@sekolah.sch.id';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Selamat Datang</h1>
          <p className="text-lg text-muted-foreground">{userData?.name || 'Admin'}</p>
          <p className="text-muted-foreground !mt-2">Ini adalah ringkasan data dan statistik sekolah.</p>
      </div>
      
       <div className="grid gap-6">
        {isTemporaryAdmin && (
            <Alert variant="default" className="bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle className="font-semibold">Langkah Keamanan Penting</AlertTitle>
                <AlertDescription>
                    Anda menggunakan akun sementara. Segera buat akun admin baru dengan email pribadi Anda.
                </AlertDescription>
            </Alert>
        )}
        
        {isManualDisabled ? (
            <Alert className="bg-amber-50 border-amber-200">
                <Lock className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 font-bold">Sistem Absensi Dinonaktifkan</AlertTitle>
                <AlertDescription className="text-amber-700">Sistem saat ini sedang dinonaktifkan secara manual oleh Administrator.</AlertDescription>
            </Alert>
        ) : isHoliday && (
            <Alert className="bg-blue-50 border-blue-200">
                <CalendarOff className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800 font-bold">Hari Libur Terdeteksi</AlertTitle>
                <AlertDescription className="text-blue-700">Sistem absensi non-aktif hari ini berdasarkan jadwal libur.</AlertDescription>
            </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-none">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[10px] font-bold uppercase text-muted-foreground">Hadir</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{dashboardData.stats.hadir}</div>
                </CardContent>
            </Card>
            <Card className="shadow-none">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[10px] font-bold uppercase text-muted-foreground">Izin/Sakit</CardTitle>
                    <BookUser className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{dashboardData.stats.izin + dashboardData.stats.sakit}</div>
                </CardContent>
            </Card>
            <Card className="shadow-none">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[10px] font-bold uppercase text-muted-foreground">Menunggu</CardTitle>
                    <FileWarning className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-amber-600">{dashboardData.stats.pending}</div>
                </CardContent>
            </Card>
            <Card className="shadow-none">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[10px] font-bold uppercase text-muted-foreground">Alpa</CardTitle>
                    <UserX className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{dashboardData.stats.alpa}</div>
                </CardContent>
            </Card>
        </div>

        <Card className="shadow-none overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-muted-foreground/5">
                <CardTitle className="text-lg font-bold">Aktivitas Kehadiran Terbaru</CardTitle>
                <CardDescription>Daftar personil yang telah melakukan absensi hari ini.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="border-none">
                                <TableHead className="w-[60px] text-center font-bold text-[10px] uppercase tracking-widest">No</TableHead>
                                <TableHead className="font-bold text-[10px] uppercase tracking-widest">Nama Personil</TableHead>
                                <TableHead className="font-bold text-[10px] uppercase tracking-widest">Peran</TableHead>
                                <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest">Masuk</TableHead>
                                <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest">Pulang</TableHead>
                                <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentUserActivity.length > 0 ? recentUserActivity.map((item) => (
                                <TableRow key={item.id} className="border-muted-foreground/5 hover:bg-primary/5">
                                    <TableCell className="text-center font-bold text-muted-foreground">{item.sequence}</TableCell>
                                    <TableCell className="font-bold text-sm">{item.name}</TableCell>
                                    <TableCell className="capitalize text-xs font-medium">{item.role}</TableCell>
                                    <TableCell className="text-center font-mono text-xs font-bold text-foreground">{item.checkInTimeFormatted}</TableCell>
                                    <TableCell className="text-center font-mono text-xs font-bold text-foreground">{item.checkOutTimeFormatted}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={statusVariant[item.status] || 'default'} className="text-[9px] font-bold uppercase">
                                            {item.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-bold">Belum ada aktivitas kehadiran hari ini.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
