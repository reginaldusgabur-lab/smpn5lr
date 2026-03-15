'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc, collection, query, orderBy } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { useCache } from '@/context/CacheContext';
import { eachDayOfInterval, startOfDay, startOfMonth, endOfMonth, format, parse, isBefore, addMonths, subMonths, isSameMonth, isWithinInterval, endOfDay, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, Download, ChevronDown, Edit } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import { exportDetailedReportToPdf, exportDetailedReportToExcel } from '@/lib/export';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Dinas': 'secondary',
    'Terlambat': 'outline',
    'Alpa': 'destructive',
};

export default function AdminUserAttendanceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const { schoolConfig, isCacheLoading } = useCache();

  const userId = params.userId as string;
  const monthStr = searchParams.get('month'); // expecting yyyy-MM

  const initialMonth = useMemo(() => monthStr ? parse(monthStr, 'yyyy-MM', new Date()) : new Date(), [monthStr]);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);

  // Data Fetching (Page Specific)
  const userDocRef = useMemoFirebase(() => userId ? doc(firestore, 'users', userId) : null, [firestore, userId]);
  const { data: userData, isLoading: isUserLoading } = useDoc(authUser, userDocRef);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
  const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(authUser, monthlyConfigRef);

  const attendanceHistoryQuery = useMemoFirebase(() => userId ? query(collection(firestore, 'users', userId, 'attendanceRecords'), orderBy('checkInTime', 'desc')) : null, [firestore, userId]);
  const { data: attendanceHistory, isLoading: isHistoryLoading } = useCollection(authUser, attendanceHistoryQuery);

  const leaveHistoryQuery = useMemoFirebase(() => userId ? query(collection(firestore, 'users', userId, 'leaveRequests'), orderBy('startDate', 'desc')) : null, [firestore, userId]);
  const { data: leaveHistory, isLoading: isLeaveLoading } = useCollection(authUser, leaveHistoryQuery);

  const isLoading = isAuthLoading || isCacheLoading || isUserLoading || isHistoryLoading || isLeaveLoading || isMonthlyConfigLoading;

  // Data Processing
  const monthlyReportData = useMemo(() => {
    if (isLoading || !attendanceHistory || !leaveHistory || !schoolConfig) return [];

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = startOfDay(new Date());
    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    const holidays: string[] = monthlyConfig?.holidays ?? [];

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const report = allDaysInMonth.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);

        const leaveRecord = leaveHistory.find(l => 
            l.status === 'approved' && isWithinInterval(day, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) })
        );

        if (leaveRecord) {
            return {
                id: `${leaveRecord.id}-${dayStr}`,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: leaveRecord.type,
                description: leaveRecord.reason,
            };
        }

        const attendanceRecord = attendanceHistory.find(a => a.checkInTime && format(a.checkInTime.toDate(), 'yyyy-MM-dd') === dayStr);

        if (attendanceRecord) {
            const checkInTime = attendanceRecord.checkInTime.toDate();
            const checkOutTime = attendanceRecord.checkOutTime?.toDate();
            let status = 'Hadir';
            let description = 'Absen Terekam';

            if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                const checkInDeadline = setHours(setMinutes(startOfDay(checkInTime), endM), endH);
                if (isBefore(checkInTime, checkInDeadline) === false) {
                    status = 'Terlambat';
                    description = 'Terlambat';
                }
            }
            
            if (!checkOutTime && isBefore(day, today)) {
                status = 'Alpa';
                description = 'Tidak Absen Pulang';
            } else if (!checkOutTime) {
                description = 'Belum Absen Pulang';
            }

            return {
                id: attendanceRecord.id,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: format(checkInTime, 'HH:mm:ss'),
                checkOut: checkOutTime ? format(checkOutTime, 'HH:mm:ss') : '-',
                status,
                description,
            };
        }
        
        if (isWorkingDay && isBefore(day, today)) {
             return {
                id: dayStr,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: 'Alpa',
                description: 'Tidak Ada Keterangan',
            };
        }

        return null;
    });

    return report.filter(Boolean).sort((a, b) => (b.date.getTime()) - (a.date.getTime()));

  }, [attendanceHistory, leaveHistory, schoolConfig, monthlyConfig, currentMonth, isLoading]);

  // Handlers & Authorization
  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const noData = monthlyReportData.length === 0;

  const handleExportPdf = () => {
      if(userData && schoolConfig) exportDetailedReportToPdf(monthlyReportData, userData, currentMonth, schoolConfig);
  };

  const handleExportExcel = () => {
      if(userData) exportDetailedReportToExcel(monthlyReportData, userData, currentMonth);
  };
  
  const handleEdit = (record: any) => {
    const dateStr = format(record.date, 'yyyy-MM-dd');
    router.push(`/dashboard/admin/kehadiran/${userId}/manual?date=${dateStr}`);
  };

  useEffect(() => {
     if (!isAuthLoading && authUser) {
        const fetchRole = async () => {
            const loggedInUserDocRef = doc(firestore, 'users', authUser.uid);
            const loggedInUserDocSnap = await getDoc(loggedInUserDocRef);
            if (!loggedInUserDocSnap.exists() || loggedInUserDocSnap.data().role !== 'admin') {
                router.replace('/dashboard');
            }
        };
        fetchRole();
     }
     if (!isAuthLoading && !authUser) {
        router.replace('/');
     }
  }, [authUser, isAuthLoading, firestore, router]);

  if (isLoading || !userData || !schoolConfig) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-12 w-12 border">
                <AvatarImage src={userData.photoURL} alt={userData.name} />
                <AvatarFallback>{getInitials(userData.name)}</AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-xl font-bold">{userData.name}</h1>
                <p className="text-sm text-muted-foreground">{userData.position} | {userData.nip || 'NIP tidak tersedia'}</p>
            </div>
        </div>
        <Card>
        <CardHeader className="flex flex-row items-start justify-between">
            <div>
                <CardTitle>Riwayat Absensi & Izin</CardTitle>
                <CardDescription>
                    Berikut adalah catatan kehadiran dan pengajuan izin untuk pengguna ini. Klik tombol edit untuk mengubah status kehadiran.
                </CardDescription>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                     <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Unduh Laporan
                        <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportExcel} disabled={isLoading || noData}>
                        Unduh Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPdf} disabled={isLoading || noData || !schoolConfig}>
                        Unduh PDF
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
                <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-semibold text-center w-32 capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: id })}
                </span>
                <Button variant="outline" size="icon" onClick={handleNextMonth} disabled={isSameMonth(currentMonth, new Date())}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
            <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[50px] text-center px-2 sm:px-4">No.</TableHead>
                    <TableHead className="px-2 sm:px-4">Tanggal</TableHead>
                    <TableHead className="text-center px-2 sm:px-4">Jam Masuk</TableHead>
                    <TableHead className="text-center px-2 sm:px-4">Jam Pulang</TableHead>
                    <TableHead className="text-center px-2 sm:px-4">Status</TableHead>
                    <TableHead className="px-2 sm:px-4">Keterangan</TableHead>
                    <TableHead className="text-center px-2 sm:px-4">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {monthlyReportData.length > 0 
                        ? monthlyReportData.map((record, index) => (
                            <TableRow key={record.id}>
                                <TableCell className="text-center p-2 sm:p-4">{index + 1}</TableCell>
                                <TableCell className="font-medium whitespace-nowrap p-2 sm:p-4">{record.dateString}</TableCell>
                                <TableCell className="text-center p-2 sm:p-4 font-mono">{record.checkIn}</TableCell>
                                <TableCell className="text-center p-2 sm:p-4 font-mono">{record.checkOut}</TableCell>
                                <TableCell className="text-center space-x-1 whitespace-nowrap p-2 sm:p-4">
                                    <Badge variant={statusVariant[record.status] || 'default'}>{record.status}</Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap p-2 sm:p-4" title={record.description}>{record.description}</TableCell>
                                <TableCell className="text-center p-2 sm:p-4">
                                    {isBefore(record.date, startOfDay(new Date())) && (
                                        <Button variant="outline" size="icon" onClick={() => handleEdit(record)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))
                        : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    Tidak ada riwayat absensi atau izin untuk bulan ini.
                                </TableCell>
                            </TableRow>
                        )
                    }
                </TableBody>
                </Table>
            </div>
        </CardContent>
        </Card>
    </div>
  );
}
