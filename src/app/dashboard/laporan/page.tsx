'use client';

import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, doc, where, Timestamp } from 'firebase/firestore';
import { format, isBefore, eachDayOfInterval, startOfDay, endOfDay, getMonth, getYear, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { AttendanceChart } from '@/components/dashboard/AttendanceChart';

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

  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

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

  const isLoading = isAuthLoading || isHistoryLoading || isLeaveLoading || isConfigLoading;
  
  const allMonths = useMemo(() => {
    if (!attendanceHistory || !leaveHistory) return [];
    const months = new Set<string>();
    [...attendanceHistory, ...leaveHistory].forEach(rec => {
      const date = rec.checkInTime?.toDate() || rec.startDate?.toDate();
      if (date) {
        months.add(format(date, 'yyyy-MM'));
      }
    });
    return Array.from(months);
  }, [attendanceHistory, leaveHistory]);

  const reportData = useMemo(() => {
    if (!attendanceHistory || !leaveHistory || !schoolConfig) {
      return [];
    }

    const attendanceRecords = attendanceHistory.map(rec => {
        const checkInTime = rec.checkInTime?.toDate();
        const checkOutTime = rec.checkOutTime ? rec.checkOutTime.toDate() : null;

        let description = '';

        if (rec.keterangan === 'Tepat waktu') {
            description = 'Tepat waktu';
        } else if (checkInTime && !checkOutTime) {
          description = 'Belum absen pulang';
        } else if (checkInTime && checkOutTime) {
           if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
            const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
            const checkInDeadline = new Date(checkInTime);
            checkInDeadline.setHours(endH, endM, 0, 0);
            description = isBefore(checkInTime, checkInDeadline) ? 'Tepat waktu' : 'Terlambat';
          } else {
            description = 'Absensi terekam';
          }
        } else {
          description = 'Data tidak lengkap';
        }


        return {
            id: rec.id, // Pass ID for key
            date: checkInTime,
            dateString: checkInTime ? format(checkInTime, 'eee, dd/MM/yy', { locale: id }) : '-',
            checkIn: checkInTime ? format(checkInTime, 'HH:mm') : '-',
            checkOut: checkOutTime ? format(checkOutTime, 'HH:mm') : '-',
            status: 'Hadir',
            description: description,
            approvalStatus: undefined,
        };
    });

    const leaveRecords = leaveHistory.flatMap(rec => {
        try {
            if (!rec || !rec.startDate || typeof rec.startDate.toDate !== 'function' || !rec.endDate || typeof rec.endDate.toDate !== 'function') {
                console.warn('Laporan Page: Skipping invalid leave record (malformed or missing dates):', rec);
                return [];
            }
            const sDate = rec.startDate.toDate();
            const eDate = rec.endDate.toDate();
            
            if (isBefore(eDate, sDate)) {
                console.warn("Laporan Page: End date is before start date, skipping", rec);
                return [];
            }
            
            const interval = { start: startOfDay(sDate), end: endOfDay(eDate) };
            return eachDayOfInterval(interval).map(loopDate => ({
                id: `${rec.id}-${format(loopDate, 'yyyy-MM-dd')}`,
                date: loopDate,
                dateString: format(loopDate, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: rec.type, // Sakit, Izin, Dinas
                approvalStatus: rec.status,
                description: rec.reason,
            }));

        } catch(e) {
             console.error("Laporan Page: Error processing leave record, skipping:", rec, e);
             return [];
        }
    });

    const combined = [...attendanceRecords, ...leaveRecords];
    combined.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const [year, month] = selectedMonth.split('-').map(Number);

    return combined.filter(rec => {
        if (!rec.date) return false;
        return getYear(rec.date) === year && getMonth(rec.date) === month - 1;
    });

  }, [attendanceHistory, leaveHistory, schoolConfig, selectedMonth]);

  const chartData = useMemo(() => {
    const summary = {
      'Hadir': 0,
      'Terlambat': 0,
      'Izin': 0,
      'Sakit': 0,
      'Dinas': 0,
      'Alpa': 0,
    };

    reportData.forEach(record => {
        if (record.status === 'Hadir') {
            if (record.description === 'Terlambat') {
                summary['Terlambat']++;
            } else {
                summary['Hadir']++;
            }
        } else if (summary.hasOwnProperty(record.status)) {
            summary[record.status as keyof typeof summary]++;
        }
    });

    return Object.entries(summary).map(([name, total]) => ({ name, total }));

  }, [reportData]);


  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-lg border bg-card p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
    <AttendanceChart data={chartData} selectedMonth={selectedMonth} />
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Riwayat Absensi &amp; Izin</CardTitle>
          <CardDescription>
          Berikut adalah catatan kehadiran dan pengajuan izin Anda.
          </CardDescription>
        </div>
        {allMonths.length > 0 && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Pilih Bulan" />
                </SelectTrigger>
                <SelectContent>
                    {allMonths.map(month => (
                        <SelectItem key={month} value={month}>
                            {format(new Date(month + '-02'), 'MMMM yyyy', { locale: id })}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )}
      </CardHeader>
      <CardContent>
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
                {reportData && reportData.length > 0 ? (
                  reportData.map((record, index) => (
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
                      Belum ada riwayat absensi atau izin untuk bulan ini.
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
