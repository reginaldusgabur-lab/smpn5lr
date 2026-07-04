
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
        const todayStr = format(today, 'yyyy-MM-dd');

        const schoolConfigSnap = await getDoc(doc(firestore, 'schoolConfig', 'default'));
        const schoolConfig = schoolConfigSnap.data();
        const monthlyConfigSnap = await getDoc(doc(firestore, 'monthlyConfigs', format(today, 'yyyy-MM')));
        const monthlyConfig = monthlyConfigSnap.data();

        const isHolidayToday = (() => {
            if (!schoolConfig) return false;
            if (schoolConfig.isAttendanceActive === false) return true;
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

        const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('date', '==', todayStr));
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
              const reason = (attendanceData.reasonForUpdate || '').toLowerCase();
              
              const isSpecial = reason.includes('dinas') || reason.includes('pulang cepat');
              
              let statusLabel = checkOutDate ? 'Pulang' : 'Hadir';
              if (isSpecial) statusLabel = attendanceData.reasonForUpdate;

              activitiesData.push({
                name: userData.name || '-',
                nip: userData.nip || '-',
                rawCheckInTime: checkInDate || checkOutDate, 
                checkInTime: checkInDate ? format(checkInDate, 'HH:mm:ss') : '-',
                checkOutTime: isSpecial ? '-' : (checkOutDate ? format(checkOutDate, 'HH:mm:ss') : '-'),
                status: statusLabel,
                keterangan: attendanceData.reasonForUpdate || (checkOutDate ? 'Absensi selesai' : 'Sedang bertugas'),
              });
            }
          }
        }

        const sortedActivities = activitiesData.sort((a, b) => {
            const tA = a.rawCheckInTime?.getTime() || 0;
            const tB = b.rawCheckInTime?.getTime() || 0;
            return tB - tA;
        });

        setActivities(sortedActivities.map((act, i) => ({ ...act, no: i + 1 })));
      } catch (e: any) {
        console.error("Error fetching activities:", e);
        setError("Gagal memuat aktivitas hari ini.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivities();
  }, [firestore]);

  const getStatusBadgeStyle = (status: string) => {
      const s = status.toLowerCase();
      if (s === 'pulang') return 'bg-slate-700 text-white border-none shadow-sm';
      if (s.includes('dinas') || s.includes('cepat')) return 'bg-blue-800 text-white border-none shadow-sm';
      return 'bg-primary text-white border-none shadow-sm';
  }

  if (isHoliday) {
      return (
          <Card className="border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden">
              <CardContent className="h-40 flex flex-col items-center justify-center text-muted-foreground text-center">
                  <CalendarOff className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm font-bold uppercase tracking-widest opacity-60">Hari Libur Sekolah</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="w-full space-y-4">
      <Card className="border border-muted-foreground/10 shadow-none rounded-xl overflow-hidden bg-card">
        <CardHeader className="p-6 border-b border-muted-foreground/5">
          <div className="flex items-start gap-3">
            <History className="h-5 w-5 text-green-700 mt-0.5" />
            <div>
              <CardTitle className="font-bold text-base tracking-tight text-green-700">Aktivitas Kehadiran</CardTitle>
              <p className="text-sm font-medium text-muted-foreground">Absensi tercatat pada {format(new Date(), "d MMMM yyyy", { locale: indonesiaLocale })}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mr-3" /><span className="text-xs font-bold uppercase tracking-widest">Memuat...</span>
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
                  {activities.map((act) => (
                    <TableRow key={act.no} className="border-muted-foreground/5 hover:bg-green-500/5 transition-colors">
                      <TableCell className="text-center font-bold text-xs text-muted-foreground">{act.no}</TableCell>
                      <TableCell>
                         <div className="font-bold text-sm text-foreground">{act.name}</div>
                        <div className="text-[10px] text-muted-foreground font-bold">{act.nip}</div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold">{act.checkInTime}</TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold">{act.checkOutTime}</TableCell>
                       <TableCell className="text-center">
                        <Badge variant="outline" className={cn("text-[9px] font-bold px-3 py-1 rounded-full uppercase", getStatusBadgeStyle(act.status))}>{act.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center">
                <WifiOff className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs font-bold uppercase tracking-widest opacity-60">Belum ada aktivitas masuk</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecentAttendanceTable;
