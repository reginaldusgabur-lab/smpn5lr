'use client';

import { useState, useMemo, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useFirestore, useDoc, useUser } from '@/firebase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const getInitial = (name = '') => name.charAt(0).toUpperCase();

const statusMap: { [key: string]: { text: string; className: string } } = {
    HADIR: { text: 'Hadir', className: 'bg-green-100 text-green-800 border-green-200' },
    TERLAMBAT: { text: 'Terlambat', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    SAKIT: { text: 'Sakit', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    IZIN: { text: 'Izin', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    ALPA: { text: 'Alpa', className: 'bg-red-100 text-red-800 border-red-200' },
    LIBUR: { text: 'Libur', className: 'bg-gray-100 text-gray-800 border-gray-200' },
};

function useUserMonthlyDetails(userId: string, month: Date) {
    const firestore = useFirestore();
    const { user } = useUser();
    const [details, setDetails] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const userRef = useMemo(() => doc(firestore, 'users', userId), [firestore, userId]);
    const { data: userData, isLoading: isUserLoading } = useDoc(user, userRef);

    const schoolConfigRef = useMemo(() => doc(firestore, 'schoolConfig', 'default'), [firestore]);
    const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

    const monthlyConfigId = useMemo(() => format(month, 'yyyy-MM'), [month]);
    const monthlyConfigRef = useMemo(() => doc(firestore, 'monthlyConfigs', monthlyConfigId), [firestore, monthlyConfigId]);
    const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);

    useEffect(() => {
        const fetchData = async () => {
            if (!firestore || !user || !userData || schoolConfig === undefined || monthlyConfig === undefined) {
                const stillLoading = isUserLoading || isConfigLoading || isMonthlyConfigLoading;
                 if (!stillLoading) setIsLoading(false);
                return;
            }

            setIsLoading(true);
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);

            const attendanceQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('checkInTime', '>=', monthStart), where('checkInTime', '<=', monthEnd));
            const leaveQuery = query(collection(firestore, 'users', userId, 'leaveRequests'), where('status', '==', 'approved'));

            const [attendanceSnap, leaveSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

            const attendanceRecords = attendanceSnap.docs.map(d => ({ ...d.data(), checkInTime: d.data().checkInTime.toDate(), checkOutTime: d.data().checkOutTime?.toDate() }));
            const leaveRecords = leaveSnap.docs.map(d => ({ ...d.data(), startDate: new Date(d.data().startDate), endDate: new Date(d.data().endDate) }));
            
            const isAttendanceActive = schoolConfig?.isAttendanceActive ?? true;
            const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig?.holidays ?? [];
            const checkInDeadlineTime = schoolConfig?.checkInEndTime ? schoolConfig.checkInEndTime.split(':').map(Number) : [8, 0];

            const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

            const dailyDetails = daysInMonth.map(day => {
                const formattedDay = format(day, 'yyyy-MM-dd');
                let status = statusMap.ALPA;
                let checkIn = '-';
                let checkOut = '-';
                let keterangan = 'Tanpa Keterangan';

                const isFuture = isBefore(new Date(), day) && !isSameDay(new Date(), day);

                if (!isAttendanceActive || offDays.includes(day.getDay()) || holidays.includes(formattedDay)) {
                    status = statusMap.LIBUR;
                    keterangan = 'Hari Libur';
                } else {
                    const attendance = attendanceRecords.find(att => isSameDay(att.checkInTime, day));
                    const leave = leaveRecords.find(l => day.setHours(0,0,0,0) >= l.startDate.setHours(0,0,0,0) && day.setHours(0,0,0,0) <= l.endDate.setHours(0,0,0,0));

                    if (attendance) {
                        checkIn = format(attendance.checkInTime, 'HH:mm');
                        keterangan = attendance.checkInMessage || 'Absensi Terekam';

                        const deadline = setHours(setMinutes(day, checkInDeadlineTime[1]), checkInDeadlineTime[0]);
                        status = isBefore(attendance.checkInTime, deadline) ? statusMap.HADIR : statusMap.TERLAMBAT;
                        
                        if (attendance.checkOutTime) {
                            checkOut = format(attendance.checkOutTime, 'HH:mm');
                        } else {
                            keterangan += '; Belum Absen Pulang';
                        }

                    } else if (leave) {
                        status = leave.type === 'Sakit' ? statusMap.SAKIT : statusMap.IZIN;
                        keterangan = leave.reason;
                    }
                }
                
                if (isFuture && status.text === 'Alpa') {
                    status = {text: '-', className: ''}; 
                    keterangan = '-';
                }

                return { date: day, status, checkIn, checkOut, keterangan };
            });

            setDetails(dailyDetails);
            setIsLoading(false);
        };

        fetchData();

    }, [firestore, user, userId, month, userData, schoolConfig, monthlyConfig, isUserLoading, isConfigLoading, isMonthlyConfigLoading]);

    return { userData, details, isLoading };
}


export default function UserDetailPage({ params }: { params: { userId: string } }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const monthParam = searchParams.get('month'); 
    const currentMonth = useMemo(() => monthParam ? new Date(`${monthParam}-02T00:00:00`) : new Date(), [monthParam]);

    const resolvedParams = use(params);
    const userId = resolvedParams.userId;
    
    const { userData, details, isLoading } = useUserMonthlyDetails(userId, currentMonth);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4"/>
                    </Button>
                    {isLoading || !userData ? (
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-12 w-12 rounded-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-[250px]" />
                                <Skeleton className="h-4 w-[200px]" />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                                <AvatarImage src={userData?.photoURL} alt={userData?.name} />
                                <AvatarFallback>{getInitial(userData?.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <CardTitle>{userData?.name}</CardTitle>
                                <CardDescription>Detail Kehadiran untuk bulan {format(currentMonth, 'MMMM yyyy', { locale: id })}</CardDescription>
                            </div>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                 <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px] text-center">No.</TableHead>
                                <TableHead className="w-[200px]">Tanggal</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-center">Jam Masuk</TableHead>
                                <TableHead className="text-center">Jam Pulang</TableHead>
                                <TableHead>Keterangan</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(10)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                </TableRow>
                                ))
                            ) : details.length > 0 ? (
                                details.map(({ date, status, checkIn, checkOut, keterangan }, index) => (
                                    <TableRow key={date.toISOString()}>
                                        <TableCell className="text-center font-medium">{index + 1}</TableCell>
                                        <TableCell className="font-medium">{format(date, 'EEEE, dd MMMM yyyy', { locale: id })}</TableCell>
                                        <TableCell>
                                            {status.text !== '-' && <Badge className={status.className}>{status.text}</Badge>}
                                        </TableCell>
                                        <TableCell className="text-center">{checkIn}</TableCell>
                                        <TableCell className="text-center">{checkOut}</TableCell>
                                        <TableCell>{keterangan}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">Tidak ada data untuk bulan ini.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
