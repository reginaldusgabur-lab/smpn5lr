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
import { cn } from '@/lib/utils';

interface Activity {
  no: number;
  name: string;
  nip: string;
  checkInTime: string;
  checkOutTime: string;
  rawCheckInTime: Date | null;
  status: string;
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
          where('date', '==', format(today, 'yyyy-MM-dd'))
        );

        const attendanceSnap = await getDocs(attendanceQuery);
        const activitiesData: Omit<Activity, 'no'>[] = [];

        for (const attendanceDoc of attendanceSnap.docs) {
          const attendanceData = attendanceDoc.data();
          const userId = attendanceData.userId || attendanceDoc.ref.parent.parent?.id;

          if (userId) {
            const userRef = doc(firestore, 'users', userId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
              const userData = userSnap.data();
              const checkInDate = attendanceData.checkInTime ? attendanceData.checkInTime.toDate() : null;
              const checkOutDate = attendanceData.checkOutTime ? attendanceData.checkOutTime.toDate() : null;
              const reason = attendanceData.reasonForUpdate || '';
              
              let statusLabel = 'Hadir';
              if (checkOutDate) statusLabel = 'Pulang';
              
              const lowReason = reason.toLowerCase();
              const isDinasSiang = lowReason.includes('dinas siang');
              const isPulangCepat = lowReason.includes('pulang cepat');
              
              if (lowReason.includes('dinas')) statusLabel = reason;
              if (isPulangCepat) statusLabel = 'Pulang cepat';

              activitiesData.push({
                name: userData.name || '-',
                nip: userData.nip || '-',
                rawCheckInTime: checkInDate || checkOutDate, 
                checkInTime: checkInTime ? format(checkInDate, 'HH:mm:ss') : '-',
                checkOutTime: (isDinasSiang || isPulangCepat) ? '-' : (checkOutDate ? format(checkOutDate, 'HH:mm:ss') : '-'),
                status: statusLabel,
                keterangan: reason || (checkOutDate ? 'Absensi selesai' : 'Sedang bertugas'),
              });
            }
          }
        }

        const sortedActivities = activitiesData.sort((a, b) => {
            const timeA = a.rawCheckInTime?.getTime() || 0;
            const timeB = b.rawCheckInTime?.getTime() || 0;
            return timeB - timeA;
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
                <h3 className="text-lg font-bold tracking-tight text-foreground">Hari libur</h3>
                <p className="text-xs">Sistem absensi non-aktif hari ini.</p>
            </div>
        );
    }
    return (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center px-4">
            <WifiOff className="w-10 h-10 mb-4 opacity-50" />
            <h3 className="text-lg font-bold tracking-tight text-foreground">Belum ada aktivitas</h3>
            <p className="text-xs">Belum ada staf yang melakukan absensi masuk hari ini.</p>
        </div>
    );
  }

  const getStatusBadgeStyle = (status: string) => {
      const s = status.toLowerCase();
      if (s === 'pulang') return 'bg-slate-700 text-white border-none';
      if (s.includes('dinas') || s.includes('cepat')) return 'bg-blue-800 text-white border-none';
      return 'bg-primary text-white border-none';
  }

  return (
    <div className="w-full space-y-4">
      <Card className="border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="p-6 border-b border-muted-foreground/5">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <History className="h-5 w-5 text-green-700" />
            </div>
            <div className="space-y-1">
              <CardTitle className="font-bold text-base tracking-tight text-green-700">
                Aktivitas Kehadiran
              </CardTitle>
              <p className="text-sm font-medium text-muted-foreground">
                Absensi tercatat pada {todayFormatted}
              </p>
            </div>
          </div>
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
                    <TableHead className="w-[60px] text-center font-bold text-[10px] uppercase tracking-widest text-green-700">No</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase tracking-widest text-green-700">Nama & NIP</TableHead>
                    <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-green-700">Masuk</TableHead>
                    <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-green-700">Pulang</TableHead>
                    <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-green-700">Status</TableHead>
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
                        <Badge 
                            variant="outline" 
                            className={cn(
                                "text-[9px] font-bold px-3 py-1 rounded-full shadow-sm",
                                getStatusBadgeStyle(activity.status)
                            )}
                        >
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