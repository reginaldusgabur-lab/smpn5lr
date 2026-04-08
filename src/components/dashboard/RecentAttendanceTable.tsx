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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, onSnapshot, documentId, collectionGroup } from 'firebase/firestore';
import { startOfDay, endOfDay, format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { AlertCircle, Loader2, TimerOff, WifiOff } from 'lucide-react';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';

interface Activity {
  no: number; 
  name: string;
  nip: string;
  checkInTime: string;
  checkOutTime: string;
  rawCheckInTime: Date;
  status: 'hadir' | 'proses';
  keterangan: string;
}

interface UserData {
  [key: string]: {
    name: string;
    nip: string;
  };
}

const RecentAttendanceTable = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firestore = useFirestore();
  const { status } = useAttendanceWindow();

  useEffect(() => {
    if (!firestore) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const attendanceQuery = query(
      collectionGroup(firestore, 'attendanceRecords'),
      where('checkInTime', '>=', todayStart),
      where('checkInTime', '<=', todayEnd)
    );

    const unsubscribe = onSnapshot(attendanceQuery, async (attendanceSnap) => {
      if (attendanceSnap.empty) {
        setActivities([]);
        setIsLoading(false);
        return;
      }

      const userIds = new Set<string>();
      const attendanceRecords: { [key: string]: any } = {};
      
      attendanceSnap.forEach(doc => {
        const userId = doc.ref.parent.parent?.id;
        if (userId) {
            userIds.add(userId);
            attendanceRecords[userId] = doc.data();
        }
      });

      if (userIds.size === 0) {
        setActivities([]);
        setIsLoading(false);
        return;
      }
      
      const usersQuery = query(
        collection(firestore, 'users'),
        where(documentId(), 'in', Array.from(userIds))
      );
      const userSnap = await getDocs(usersQuery);
      const usersData: UserData = {};
      userSnap.forEach(doc => {
        usersData[doc.id] = { name: doc.data().name, nip: doc.data().nip || '-' };
      });

      const unsortedActivities: Omit<Activity, 'no'>[] = Object.entries(attendanceRecords).map(([userId, attendance]) => {
        const userDetail = usersData[userId];
        const checkInDate = attendance.checkInTime.toDate();
        const checkInTime = format(checkInDate, 'HH:mm:ss');
        const checkOutTime = attendance.checkOutTime ? format(attendance.checkOutTime.toDate(), 'HH:mm:ss') : '--:--';
        const status: Activity['status'] = checkOutTime !== '--:--' ? 'hadir' : 'proses';

        return {
          name: userDetail?.name || 'Nama Tidak Ditemukan',
          nip: userDetail?.nip || '-',
          rawCheckInTime: checkInDate,
          checkInTime,
          checkOutTime,
          status,
          keterangan: status === 'hadir' ? 'Kehadiran Penuh' : 'Belum Absen Pulang',
        };
      });

      const sortedActivities = unsortedActivities.sort((a, b) => a.rawCheckInTime.getTime() - b.rawCheckInTime.getTime());

      const finalActivities = sortedActivities.map((activity, index) => ({
        ...activity,
        no: index + 1,
      }));

      setActivities(finalActivities);
      setIsLoading(false);
    }, (err) => {
      console.error("Error loading real-time attendance:", err);
      setError(err.code === 'permission-denied' ? "Permission denied. Check Firestore Security Rules." : "An error occurred while fetching data.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  const BadgeStatus = ({ status }: { status: Activity['status'] }) => {
    const variant = status === 'hadir' ? 'default' : 'outline';
    const text = status === 'hadir' ? 'Hadir' : 'Proses';
    return <Badge variant={variant}>{text}</Badge>;
  };

  const EmptyState = () => {
    if (isLoading) {
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Memuat data kehadiran...</span></div>;
    }
    if (error) {
        return <div className="flex flex-col items-center justify-center h-40 text-destructive"><AlertCircle className="h-8 w-8 mb-3" /><span>{error}</span></div>;
    }

    switch (status) {
      case 'CLOSED':
      case 'SESSION_INACTIVE':
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><TimerOff className="h-8 w-8 mb-3" /><span>Sesi Absensi Ditutup</span><span className="text-xs mt-1 text-center">Semua sesi hari ini telah berakhir.</span></div>;
      case 'CHECK_IN_OPEN':
      case 'CHECK_OUT_OPEN':
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><WifiOff className="h-8 w-8 mb-3" /><span>Menunggu Aktivitas</span><span className="text-xs mt-1">Belum ada absensi yang tercatat pada sesi ini.</span></div>;
      default:
        return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><WifiOff className="h-8 w-8 mb-3" /><span>Belum ada aktivitas kehadiran hari ini.</span></div>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivitas Kehadiran Hari Ini</CardTitle>
        <CardDescription>Daftar absensi pada tanggal {format(new Date(), 'd MMMM yyyy', { locale: localeId })}</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Jam Masuk / Pulang</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((activity, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{activity.no}</TableCell>
                  <TableCell>
                    <div className="font-medium">{activity.name}</div>
                    <div className="text-sm text-muted-foreground">NIP: {activity.nip}</div>
                  </TableCell>
                  <TableCell>{activity.checkInTime} / {activity.checkOutTime}</TableCell>
                  <TableCell><BadgeStatus status={activity.status} /></TableCell>
                  <TableCell>{activity.keterangan}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
};

export default RecentAttendanceTable;
