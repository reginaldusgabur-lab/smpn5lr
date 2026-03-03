'use client';

import { useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { format, isBefore, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
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

  const isLoading = isAuthLoading || isHistoryLoading || isLeaveLoading;
  
  const reportData = useMemo(() => {
    if (!attendanceHistory || !leaveHistory) {
      return [];
    }

    const attendanceRecords = attendanceHistory.map(rec => {
        const checkInTime = rec.checkInTime?.toDate();
        const checkOutTime = rec.checkOutTime ? rec.checkOutTime.toDate() : null;

        return {
            id: rec.id, // Pass ID for key
            date: checkInTime,
            dateString: checkInTime ? format(checkInTime, 'd MMMM yyyy', { locale: id }) : '-',
            checkIn: checkInTime ? format(checkInTime, 'HH:mm') : '-',
            checkOut: checkOutTime ? format(checkOutTime, 'HH:mm') : '-',
            status: 'Hadir',
            description: 'Absensi terekam',
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
                dateString: format(loopDate, 'd MMMM yyyy', { locale: id }),
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

    return combined;
  }, [attendanceHistory, leaveHistory]);

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
        <CardTitle>Riwayat Absensi & Izin</CardTitle>
        <CardDescription>
        Berikut adalah catatan kehadiran dan pengajuan izin Anda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
            <Table>
            <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] text-center">No.</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-center">Jam Masuk</TableHead>
                  <TableHead className="text-center">Jam Pulang</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {reportData && reportData.length > 0 ? (
                  reportData.map((record, index) => (
                      <TableRow key={record.id}>
                          <TableCell className="text-center">{index + 1}</TableCell>
                          <TableCell className="font-medium">{record.dateString}</TableCell>
                          <TableCell className="text-center">{record.checkIn}</TableCell>
                          <TableCell className="text-center">{record.checkOut}</TableCell>
                          <TableCell className="text-center space-x-1 whitespace-nowrap">
                              <Badge variant={statusVariant[record.status] || 'default'}>{record.status}</Badge>
                              {record.approvalStatus && (
                                <Badge variant={approvalStatusVariant[record.approvalStatus] || 'secondary'} className="capitalize">
                                    {record.approvalStatus}
                                </Badge>
                              )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={record.description}>{record.description}</TableCell>
                      </TableRow>
                    )
                ))
                : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      Belum ada riwayat absensi atau izin.
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
