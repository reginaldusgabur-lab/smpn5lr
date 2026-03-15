'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc, collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { eachDayOfInterval, startOfMonth, endOfMonth, format, parse, isSameDay, isBefore, startOfDay, addMonths, subMonths, isSameMonth, isWithinInterval, endOfDay, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Dinas': 'secondary',
    'Terlambat': 'outline',
    'Alpa': 'destructive',
};

export default function HeadmasterUserAttendanceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();

  const userId = params.userId as string;
  const monthStr = searchParams.get('month'); // expecting yyyy-MM

  const initialMonth = useMemo(() => monthStr ? parse(monthStr, 'yyyy-MM', new Date()) : new Date(), [monthStr]);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);

  // ====================================================================
  // DATA FETCHING
  // ====================================================================

  const userDocRef = useMemoFirebase(() => userId ? doc(firestore, 'users', userId) : null, [firestore, userId]);
  const { data: userData, isLoading: isUserLoading } = useDoc(authUser, userDocRef);

  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(authUser, schoolConfigRef);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
  const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(authUser, monthlyConfigRef);

  const attendanceHistoryQuery = useMemoFirebase(() => userId ? query(collection(firestore, 'users', userId, 'attendanceRecords'), orderBy('checkInTime', 'desc')) : null, [firestore, userId]);
  const { data: attendanceHistory, isLoading: isHistoryLoading } = useCollection(authUser, attendanceHistoryQuery);

  const leaveHistoryQuery = useMemoFirebase(() => userId ? query(collection(firestore, 'users', userId, 'leaveRequests'), orderBy('startDate', 'desc')) : null, [firestore, userId]);
  const { data: leaveHistory, isLoading: isLeaveLoading } = useCollection(authUser, leaveHistoryQuery);

  const isLoading = isAuthLoading || isUserLoading || isHistoryLoading || isLeaveLoading || isConfigLoading || isMonthlyConfigLoading;

  // ====================================================================
  // DATA PROCESSING
  // ====================================================================

  const monthlyReportData = useMemo(() => {
    if (isLoading || !attendanceHistory || !leaveHistory || !schoolConfig) {
      return [];
    }

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
                status: leaveRecord.type, // e.g., 'Sakit', 'Izin'
                description: leaveRecord.reason,
            };
        }

        const attendanceRecord = attendanceHistory.find(a => {
            const checkInDate = a.checkInTime?.toDate();
            return checkInDate && format(checkInDate, 'yyyy-MM-dd') === dayStr;
        });

        if (attendanceRecord) {
            const checkInTime = attendanceRecord.checkInTime.toDate();
            const checkOutTime = attendanceRecord.checkOutTime?.toDate();
            let status = 'Hadir';
            let description = 'Absen Terekam';

            if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                const checkInDeadline = setHours(setMinutes(startOfDay(checkInTime), endH), endM);
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

  // ====================================================================
  // HANDLERS & RENDER
  // ====================================================================

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  useEffect(() => {
     if (!isAuthLoading && authUser) {
        const fetchRole = async () => {
            const loggedInUserDocRef = doc(firestore, 'users', authUser.uid);
            const loggedInUserDocSnap = await getDoc(loggedInUserDocRef);
            if (!loggedInUserDocSnap.exists() || loggedInUserDocSnap.data().role !== 'kepala_sekolah') {
                router.replace('/dashboard');
            }
        };
        fetchRole();
     }
      if (!isAuthLoading && !authUser) {
        router.replace('/');
     }
  }, [authUser, isAuthLoading, firestore, router]);

  if (isLoading || !userData) {
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
        <CardHeader>
            <CardTitle>Riwayat Absensi & Izin</CardTitle>
            <CardDescription>
                Berikut adalah catatan kehadiran dan pengajuan izin untuk pengguna ini.
            </CardDescription>
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
                    <TableHead className="px-2 sm:p-4">Keterangan</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {monthlyReportData && monthlyReportData.length > 0 ? (
                    monthlyReportData.map((record, index) => (
                        <TableRow key={record.id}>
                            <TableCell className="text-center p-2 sm:p-4">{index + 1}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap p-2 sm:p-4">{record.dateString}</TableCell>
                            <TableCell className="text-center p-2 sm:p-4 font-mono">{record.checkIn}</TableCell>
                            <TableCell className="text-center p-2 sm:p-4 font-mono">{record.checkOut}</TableCell>
                            <TableCell className="text-center space-x-1 whitespace-nowrap p-2 sm:p-4">
                                <Badge variant={statusVariant[record.status] || 'default'}>{record.status}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap p-2 sm:p-4" title={record.description}>{record.description}</TableCell>
                        </TableRow>
                        ))
                    )
                    : (
                    <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                        Tidak ada riwayat absensi atau izin untuk bulan ini.
                        </TableCell
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
