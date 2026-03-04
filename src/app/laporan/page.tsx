'use client';
import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, orderBy, Timestamp, getDocs, doc, getDoc, DocumentData } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, startOfDay } from 'date-fns';
import { id } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronsRight, FileDown, Loader2 } from 'lucide-react';
import Link from 'next/link';

const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(i);
    return {
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy', { locale: id }),
    };
});

async function fetchSchoolConfig(firestore: any) {
    const configRef = doc(firestore, 'schoolConfig', 'default');
    const configSnap = await getDoc(configRef);
    return configSnap.exists() ? configSnap.data() : null;
}

async function fetchMonthlyData(firestore: any, userId: string, month: string) {
    if (!firestore || !userId) return { attendance: [], leaves: [] };
    const targetDate = new Date(`${month}-01T00:00:00`);
    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);

    const attendanceQuery = query(
        collection(firestore, 'users', userId, 'attendanceRecords'),
        where('checkInTime', '>=', Timestamp.fromDate(monthStart)),
        where('checkInTime', '<=', Timestamp.fromDate(monthEnd)),
        orderBy('checkInTime', 'desc')
    );

    const leaveQuery = query(
        collection(firestore, 'users', userId, 'leaveRequests'),
        where('status', '==', 'approved'),
        where('endDate', '>=', Timestamp.fromDate(monthStart))
    );

    const [attendanceSnap, leaveSnap] = await Promise.all([
        getDocs(attendanceQuery),
        getDocs(leaveQuery)
    ]);

    const attendance = attendanceSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const leaves = leaveSnap.docs.map(d => ({ ...d.data(), id: d.id }));

    return { attendance, leaves };
}

function LaporanComponent() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const defaultMonth = format(new Date(), 'yyyy-MM');
    const [selectedMonth, setSelectedMonth] = useState(searchParams.get('month') || defaultMonth);

    const { data: schoolConfig, isLoading: isConfigLoading } = useQuery({
        queryKey: ['schoolConfig'],
        queryFn: () => fetchSchoolConfig(firestore),
        enabled: !!firestore,
    });

    const { data: monthlyData, isLoading: isMonthlyDataLoading, isFetching } = useQuery<{
        attendance: DocumentData[];
        leaves: DocumentData[];
    } | undefined>({
        queryKey: ['monthlyReport', user?.uid, selectedMonth],
        queryFn: () => fetchMonthlyData(firestore, user!.uid, selectedMonth),
        enabled: !!user && !!firestore,
    });

    const reportData = useMemo(() => {
        if (!monthlyData || !schoolConfig) return [];

        const { attendance, leaves } = monthlyData;
        const targetDate = new Date(`${selectedMonth}-01T00:00:00`);
        const monthStart = startOfMonth(targetDate);
        const monthEnd = endOfMonth(targetDate);
        const today = new Date();

        const attendanceMap = new Map(attendance.map(rec => [format(rec.checkInTime.toDate(), 'yyyy-MM-dd'), rec]));
        const leaveMap = new Map<string, DocumentData>();
        leaves.forEach(leave => {
            const start = leave.startDate.toDate();
            const end = leave.endDate.toDate();
            eachDayOfInterval({ start, end }).forEach(day => {
                if (day >= monthStart && day <= monthEnd) {
                    leaveMap.set(format(day, 'yyyy-MM-dd'), leave);
                }
            });
        });

        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const offDays: number[] = schoolConfig.offDays ?? [0, 6]; 

        const [lateH, lateM] = (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) 
            ? schoolConfig.checkInEndTime.split(':').map(Number) 
            : [0, 0];

        return allDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const isOffDay = offDays.includes(day.getDay());
            const attendanceRecord = attendanceMap.get(dayStr);
            const leaveRecord = leaveMap.get(dayStr);

            let status: string;
            let checkIn: string | null = null;
            let checkOut: string | null = null;

            if (attendanceRecord) {
                const checkInTime = attendanceRecord.checkInTime.toDate();
                checkIn = format(checkInTime, 'HH:mm:ss');
                checkOut = attendanceRecord.checkOutTime ? format(attendanceRecord.checkOutTime.toDate(), 'HH:mm:ss') : 'Belum absen pulang';
                
                let isLate = false;
                if(schoolConfig.useTimeValidation && lateH > 0) {
                    const lateTime = new Date(checkInTime); lateTime.setHours(lateH, lateM, 0, 0);
                    if (checkInTime > lateTime) isLate = true;
                }

                status = isLate ? 'Terlambat' : 'Hadir';
            } else if (leaveRecord) {
                status = leaveRecord.type; // e.g., 'Sakit', 'Izin', 'Dinas'
                checkIn = '-';
                checkOut = '-';
            } else if (isOffDay) {
                status = 'Libur';
                checkIn = '-';
                checkOut = '-';
            } else if (isBefore(day, startOfDay(today))) {
                status = 'Alpa';
                checkIn = 'Belum absen masuk';
                checkOut = '-';
            } else {
                status = 'Belum ada data';
                checkIn = '-';
                checkOut = '-';
            }

            return {
                date: format(day, 'eeee, dd MMM yyyy', { locale: id }),
                checkIn,
                checkOut,
                status,
            };
        });
    }, [monthlyData, schoolConfig, selectedMonth]);

    const handleMonthChange = (value: string) => {
        setSelectedMonth(value);
    };

    const isLoading = isUserLoading || isConfigLoading || isMonthlyDataLoading;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button asChild variant="outline" size="icon" className="shrink-0">
                    <Link href="/dashboard">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Kembali ke Dasbor</span>
                    </Link>
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Riwayat Kehadiran</h1>
            </div>

            <Card>
                <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1">
                        <CardTitle>Laporan Bulanan</CardTitle>
                        <CardDescription>Pilih bulan untuk melihat riwayat kehadiran Anda.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                         <Select value={selectedMonth} onValueChange={handleMonthChange}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Pilih Bulan" />
                            </SelectTrigger>
                            <SelectContent>
                                {monthOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                         <Button variant="outline" disabled={isFetching || reportData.length === 0}>
                            <FileDown className="h-4 w-4 mr-2" />
                            Unduh
                        </Button>
                        {isFetching && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>}
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead><Skeleton className="h-5 w-24" /></TableHead>
                                    <TableHead className="text-center"><Skeleton className="h-5 w-20 mx-auto" /></TableHead>
                                    <TableHead className="text-center"><Skeleton className="h-5 w-20 mx-auto" /></TableHead>
                                    <TableHead className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                        <TableCell className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                        <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto rounded-full" /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : reportData.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead className="text-center">Waktu Masuk</TableHead>
                                    <TableHead className="text-center">Waktu Pulang</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.map((row) => (
                                    <TableRow key={row.date}>
                                        <TableCell className="font-medium">{row.date}</TableCell>
                                        <TableCell className="text-center">{row.checkIn}</TableCell>
                                        <TableCell className="text-center">{row.checkOut}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge 
                                               variant={{
                                                    'Hadir': 'default',
                                                    'Terlambat': 'destructive',
                                                    'Sakit': 'yellow',
                                                    'Izin': 'orange',
                                                    'Dinas': 'blue',
                                                    'Alpa': 'secondary',
                                                    'Libur': 'outline',
                                                }[row.status] as any || 'secondary'}
                                            >
                                                {row.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-16">
                            <p className="text-muted-foreground">Tidak ada data kehadiran untuk bulan yang dipilih.</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="text-sm text-muted-foreground">
                    Menampilkan {reportData.length} dari total {reportData.length} data. Laporan ini bersifat pribadi.
                </CardFooter>
            </Card>
        </div>
    );
}

export default function LaporanPage() {
    return (
        <Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
            <LaporanComponent />
        </Suspense>
    )
}
