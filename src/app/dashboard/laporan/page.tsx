'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, orderBy, doc, where, Timestamp, getDoc, getDocs, type DocumentData } from 'firebase/firestore';
import { format, isBefore, isAfter, eachDayOfInterval, startOfMonth, lastDayOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
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

// --- Refactored Firestore Fetching Functions ---
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

export default function LaporanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();

  const [currentDate, setCurrentDate] = useState(() => new Date());

  const isRestrictedUser = useMemo(() => {
    if (!user) return true; // Assume restricted if user not loaded
    return !['admin', 'kepala_sekolah'].includes(user.role);
  }, [user]);

  const handlePrevMonthClick = () => {
    if (isRestrictedUser) {
      alert('Akses Riwayat Dibatasi: Riwayat laporan bulan sebelumnya hanya dapat diakses oleh admin.');
      return;
    }
    setCurrentDate(subMonths(currentDate, 1));
  };
  
  const handleNextMonthClick = () => {
    if (isRestrictedUser) {
       alert('Akses Riwayat Dibatasi: Anda hanya dapat melihat laporan bulan ini.');
      return;
    }
    setCurrentDate(addMonths(currentDate, 1));
  };

  const { isPrevMonthNavDisabled } = useMemo(() => {
    const startOfSelectedMonth = startOfMonth(currentDate);
    const projectStartDate = new Date(2026, 0, 1); // Lock navigation before January 2026
    return {
      isPrevMonthNavDisabled: !isAfter(startOfSelectedMonth, projectStartDate)
    };
  }, [currentDate]);

  const isNextMonthNavDisabled = useMemo(() => {
    return isSameMonth(currentDate, new Date()) || isAfter(currentDate, new Date());
  }, [currentDate]);

  const { data: schoolConfig, isLoading: isConfigLoading } = useQuery<DocumentData | null>({
    queryKey: ['schoolConfig'],
    queryFn: () => fetchSingleDoc(firestore, 'schoolConfig', 'default'),
    enabled: !!firestore,
  });

  const { data: reportData, isLoading: isReportLoading } = useQuery({
    queryKey: ['monthlyReport', user?.uid, format(currentDate, 'yyyy-MM')],
    queryFn: async () => {
      if (!user || !firestore || !schoolConfig) return [];

      const dateRange = {
        start: startOfMonth(currentDate),
        end: lastDayOfMonth(currentDate)
      };

      const [attendanceHistory, leaveHistory] = await Promise.all([
        fetchUserSubcollection(firestore, user.uid, 'attendanceRecords', [
          where('checkInTime', '>=', Timestamp.fromDate(dateRange.start)),
          where('checkInTime', '<=', Timestamp.fromDate(dateRange.end)),
          orderBy('checkInTime', 'desc')
        ]),
        fetchUserSubcollection(firestore, user.uid, 'leaveRequests', [
          where('endDate', '>=', Timestamp.fromDate(dateRange.start)),
          orderBy('endDate', 'desc')
        ])
      ]);

      const attendanceRecords = attendanceHistory.map(rec => {
          const checkInTime = rec.checkInTime?.toDate();
          const checkOutTime = rec.checkOutTime ? rec.checkOutTime.toDate() : null;

          let description = '';
          if (checkInTime && !checkOutTime) {
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
              id: rec.id,
              date: checkInTime,
              dateString: checkInTime ? format(checkInTime, 'eee, dd/MM/yy', { locale: id }) : '-',
              checkIn: checkInTime ? format(checkInTime, 'HH:mm') : '-',
              checkOut: checkOutTime ? format(checkOutTime, 'HH:mm') : '-',
              status: 'Hadir',
              description: description,
              approvalStatus: undefined,
          };
      });

      const leaveRecords = leaveHistory
          .filter(rec => rec.startDate.toDate() <= dateRange.end)
          .flatMap(rec => {
            try {
                if (!rec?.startDate?.toDate || !rec?.endDate?.toDate) return [];
                const sDate = rec.startDate.toDate();
                const eDate = rec.endDate.toDate();
                if (isBefore(eDate, sDate)) return [];
                const intervalStart = isBefore(sDate, dateRange.start) ? dateRange.start : sDate;
                const intervalEnd = isAfter(eDate, dateRange.end) ? dateRange.end : eDate;
                if (isBefore(intervalEnd, intervalStart)) return [];
                return eachDayOfInterval({ start: intervalStart, end: intervalEnd }).map(loopDate => ({
                    id: `${rec.id}-${format(loopDate, 'yyyy-MM-dd')}`,
                    date: loopDate,
                    dateString: format(loopDate, 'eee, dd/MM/yy', { locale: id }),
                    checkIn: '-',
                    checkOut: '-',
                    status: rec.type,
                    approvalStatus: rec.status,
                    description: rec.reason,
                }));
            } catch(e) {
                 console.error("Laporan Page: Error processing leave record:", rec, e);
                 return [];
            }
      });

      const combined = [...attendanceRecords, ...leaveRecords];
      combined.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

      const uniqueRecords: any[] = [];
      const processedDates = new Set();
      for (const record of combined) {
          if (record.date) {
              const dateString = format(record.date, 'yyyy-MM-dd');
              if (!processedDates.has(dateString)) {
                  uniqueRecords.push(record);
                  processedDates.add(dateString);
              }
          }
      }
      return uniqueRecords;
    },
    enabled: !!user && !!firestore && !!schoolConfig,
  });

  const chartData = useMemo(() => {
    if (!reportData) return [];
    const summary = {
      'Hadir': 0,
      'Terlambat': 0,
      'Izin': 0,
      'Sakit': 0,
      'Dinas': 0,
      'Alpa': 0,
    };

    reportData.forEach((record: any) => {
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

  const isLoading = isAuthLoading || isReportLoading || isConfigLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card><CardHeader><CardTitle>Grafik Kehadiran</CardTitle></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Riwayat Absensi &amp; Izin</CardTitle></CardHeader><CardContent><div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></CardContent></Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
    <AttendanceChart data={chartData} selectedMonth={format(currentDate, 'yyyy-MM')} />
    <Card>
      <CardHeader className="flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Riwayat Absensi &amp; Izin</CardTitle>
          <CardDescription>
          Berikut adalah catatan kehadiran dan pengajuan izin Anda.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
            <Button variant="outline" size="icon" onClick={handlePrevMonthClick} disabled={!isRestrictedUser && isPrevMonthNavDisabled}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-center w-32">{format(currentDate, 'MMMM yyyy', { locale: id })}</span>
            <Button variant="outline" size="icon" onClick={handleNextMonthClick} disabled={isNextMonthNavDisabled}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
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
                  reportData.map((record: any, index) => (
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
