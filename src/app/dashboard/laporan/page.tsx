'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { id } from 'date-fns/locale';

const statusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Dinas': 'secondary',
    'Terlambat': 'outline',
    'Alpa': 'destructive',
};

const approvalStatusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'approved': 'default',
    'pending': 'outline',
    'rejected': 'destructive',
};


export default function LaporanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const isStaff = user?.role === 'guru' || user?.role === 'pegawai';

  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return doc(firestore, 'monthlyConfigs', monthlyConfigId);
  }, [firestore, monthlyConfigId]);
  const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);

  const attendanceHistoryQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), orderBy('checkInTime', 'desc'));
  }, [user, firestore]);

  const leaveHistoryQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(collection(firestore, 'users', user.uid, 'leaveRequests'), orderBy('startDate', 'desc'));
  }, [user, firestore]);

  const { data: attendanceHistory, isLoading: isHistoryLoading } = useCollection(user, attendanceHistoryQuery);
  const { data: leaveHistory, isLoading: isLeaveLoading } = useCollection(user, leaveHistoryQuery);

  const isLoading = isAuthLoading || isHistoryLoading || isLeaveLoading || isConfigLoading || isMonthlyConfigLoading;
  
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

            if (checkInTime && checkOutTime) {
                let description = 'Absen Terekam';
                if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    const checkInDeadline = new Date(checkInTime);
                    checkInDeadline.setHours(endH, endM, 0, 0);
                    if (isBefore(checkInTime, checkInDeadline) === false) {
                        description = 'Terlambat';
                    }
                }
                return {
                    id: attendanceRecord.id,
                    date: day,
                    dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                    checkIn: format(checkInTime, 'HH:mm'),
                    checkOut: format(checkOutTime, 'HH:mm'),
                    status: 'Hadir',
                    description: description,
                };
            } else if (checkInTime) {
                if (isBefore(day, today)) {
                     return {
                        id: attendanceRecord.id,
                        date: day,
                        dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                        checkIn: format(checkInTime, 'HH:mm'),
                        checkOut: '-',
                        status: 'Alpa',
                        description: 'Tidak Absen Pulang',
                    };
                } else {
                     return {
                        id: attendanceRecord.id,
                        date: day,
                        dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                        checkIn: format(checkInTime, 'HH:mm'),
                        checkOut: '-',
                        status: 'Hadir',
                        description: 'Belum Absen Pulang',
                    };
                }
            }
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

  const handlePrevMonth = () => {
    if (isStaff) {
        toast({ 
            variant: 'default',
            title: 'Akses Terbatas', 
            description: 'Silahkan hubungi admin untuk melihat laporan kehadiran sebelumnya.' 
        });
        return;
    }
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
      setCurrentMonth(prev => addMonths(prev, 1));
  };

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-lg border bg-card p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat Absensi &amp; Izin</CardTitle>
        <CardDescription>
            Berikut adalah catatan kehadiran dan pengajuan izin Anda.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                </TableRow>
            </TableHeader>
            <TableBody>
                {monthlyReportData && monthlyReportData.length > 0 ? (
                  monthlyReportData.map((record, index) => (
                      <TableRow key={record.id}>
                          <TableCell className="text-center p-2 sm:p-4">{index + 1}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap p-2 sm:p-4">{record.dateString}</TableCell>
                          <TableCell className="text-center p-2 sm:p-4">{record.checkIn}</TableCell>
                          <TableCell className="text-center p-2 sm:p-4">{record.checkOut}</TableCell>
                          <TableCell className="text-center space-x-1 whitespace-nowrap p-2 sm:p-4">
                              <Badge variant={statusVariant[record.status] || 'default'}>{record.status}</Badge>
                              {record.approvalStatus && (
                                <Badge variant={approvalStatusVariant[record.approvalStatus] || 'secondary'} className="capitalize">
                                    {record.approvalStatus}
                                </Badge>
                              )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap p-2 sm:p-4" title={record.description}>{record.description}</TableCell>
                      </TableRow>
                    )
                ))
                : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      Tidak ada riwayat absensi atau izin untuk bulan ini.
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
      </CardContent>
    </Card>
  );
}
