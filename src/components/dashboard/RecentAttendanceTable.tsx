'use client';

import React, { useEffect, useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, collectionGroup, Timestamp, doc, getDoc } from 'firebase/firestore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
import { Loader2, WifiOff, AlertCircle, CalendarOff, History } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Activity {
  no: number;
  name: string;
  nip: string;
  checkInTime: string;
  checkOutTime: string;
  rawCheckInTime: Date | null;
  status: 'Hadir' | 'Pulang';
  keterangan: string;
}

const RecentAttendanceTable = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHoliday, setIsHoliday] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) {
      setIsLoading(false);
      return;
    }

    const fetchActivities = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const today = new Date();
        const startOfToday = startOfDay(today);
        const endOfToday = endOfDay(today);

        const schoolConfigSnap = await getDoc(doc(firestore, 'schoolConfig', 'default'));
        const schoolConfig = schoolConfigSnap.data();
        
        const monthlyConfigId = format(today, 'yyyy-MM');
        const monthlyConfigSnap = await getDoc(doc(firestore, 'monthlyConfigs', monthlyConfigId));
        const monthlyConfig = monthlyConfigSnap.data();

        const isHolidayToday = (() => {
            if (!schoolConfig) return false;
            if (schoolConfig.isAttendanceActive === false) return true;
            const todayStr = format(today, 'yyyy-MM-dd');
            if (monthlyConfig?.holidays?.includes(todayStr)) return true;
            const offDays: number[] = schoolConfig.offDays ?? [0, 6];
            return offDays.includes(today.getDay());
        })();

        setIsHoliday(isHolidayToday);

        if (isHolidayToday) {
            setActivities([]);
            setIsLoading(false);
            return;
        }

        const attendanceQuery = query(
          collectionGroup(firestore, 'attendanceRecords'),
          where('checkInTime', '>=', Timestamp.fromDate(startOfToday)),
          where('checkInTime', '<', Timestamp.fromDate(endOfToday))
        );

        const attendanceSnap = await getDocs(attendanceQuery);
        const activitiesData: Omit<Activity, 'no'>[] = [];

        for (const attendanceDoc of attendanceSnap.docs) {
          const attendanceData = attendanceDoc.data();
          const userId = attendanceDoc.ref.parent.parent?.id;

          if (userId) {
            const userRef = doc(firestore, 'users', userId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
              const userData = userSnap.data();
              const checkInDate = attendanceData.checkInTime ? attendanceData.checkInTime.toDate() : null;
              
              activitiesData.push({
                name: userData.name || '-',
                nip: userData.nip || '-',
                rawCheckInTime: checkInDate,
                checkInTime: checkInDate ? format(checkInDate, 'HH:mm:ss') : '-',
                checkOutTime: attendanceData.checkOutTime ? format(attendanceData.checkOutTime.toDate(), 'HH:mm:ss') : '-',
                status: attendanceData.checkOutTime ? 'Pulang' : 'Hadir',
                keterangan: attendanceData.checkOutTime ? 'Kehadiran penuh' : 'Masih di tempat',
              });
            }
          }
        }

        const sortedActivities = activitiesData.sort((a, b) => {
            if (a.rawCheckInTime && b.rawCheckInTime) {
                return b.rawCheckInTime.getTime() - a.rawCheckInTime.getTime();
            }
            return 0;
        });

        const finalActivities = sortedActivities.map((activity, index) => ({
            ...activity,
            no: index + 1,
        }));

        setActivities(finalActivities);

      } catch (e: any) {
        console.error("Error fetching today's activity:", e);
        setError("Gagal memuat aktivitas hari ini.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivities();
  }, [firestore]);

  const todayFormatted = format(new Date(), "d MMMM yyyy", { locale: indonesiaLocale });

  const EmptyState = () => {
    if (isHoliday) {
        return (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center px-4">
                <CalendarOff className="w-10 h-10 mb-4 opacity-50" />
                <h3 className="text-lg font-bold tracking-tight">Hari libur</h3>
                <p className="text-xs">Sistem absensi non-aktif hari ini.</p>
            </div>
        );
    }
    return (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center px-4">
            <WifiOff className="w-10 h-10 mb-4 opacity-50" />
            <h3 className="text-lg font-bold tracking-tight">Belum ada aktivitas</h3>
            <p className="text-xs">Belum ada staf yang melakukan absensi masuk hari ini.</p>
        </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Card className="border-none shadow-none rounded-3xl overflow-hidden">
        <CardHeader className="p-6 flex flex-row items-center justify-between gap-1 text-green-700 border-b border-muted-foreground/5">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5" />
            <CardTitle className="font-bold text-sm tracking-tight">Aktivitas Kehadiran</CardTitle>
          </div>
          <p className="text-[11px] font-bold opacity-80 tracking-widest bg-green-500/10 px-3 py-1 rounded-full">{todayFormatted}</p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <span className="text-xs font-bold tracking-widest">Memuat aktivitas...</span>
            </div>
          ) : error ? (
               <div className="flex flex-col items-center justify-center h-40 text-destructive text-center px-4">
                  <AlertCircle className="w-8 h-8 mb-3" />
                  <span className='font-bold text-xs tracking-widest'>Terjadi kesalahan</span>
                  <span className="text-[10px]">{error}</span>
              </div>
          ) : activities.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-green-500/5">
                  <TableRow className="border-none">
                    <TableHead className="w-[60px] text-center font-bold text-[10px] tracking-widest text-green-700">No</TableHead>
                    <TableHead className="font-bold text-[10px] tracking-widest text-green-700">Nama & NIP</TableHead>
                    <TableHead className="text-center font-bold text-[10px] tracking-widest text-green-700">Masuk</TableHead>
                    <TableHead className="text-center font-bold text-[10px] tracking-widest text-green-700">Pulang</TableHead>
                    <TableHead className="text-center font-bold text-[10px] tracking-widest text-green-700">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity, index) => (
                    <TableRow key={index} className="border-muted-foreground/5 hover:bg-green-500/5 transition-colors">
                      <TableCell className="text-center font-bold text-xs text-muted-foreground">{activity.no}</TableCell>
                      <TableCell>
                         <div className="font-bold text-sm text-foreground">{activity.name}</div>
                        <div className="text-[10px] text-muted-foreground font-bold tracking-tight">{activity.nip}</div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold text-foreground">{activity.checkInTime}</TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold text-foreground">{activity.checkOutTime}</TableCell>
                       <TableCell className="text-center">
                        <Badge variant={activity.status === 'Hadir' ? 'default' : 'secondary'} className="text-[9px] font-bold px-3">
                            {activity.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecentAttendanceTable;
