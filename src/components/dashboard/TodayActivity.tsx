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
import { collection, query, where, getDocs, collectionGroup, Timestamp, doc, getDoc } from 'firebase/firestore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
import { Loader2, WifiOff } from 'lucide-react';

interface Activity {
  no: number;
  name: string;
  nip: string;
  checkInTime: string;
  checkOutTime: string;
  status: 'Hadir' | 'Pulang';
  keterangan: string;
}

const TodayActivity = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

        const attendanceQuery = query(
          collectionGroup(firestore, 'attendanceRecords'),
          where('checkIn', '>=', Timestamp.fromDate(startOfToday)),
          where('checkIn', '<', Timestamp.fromDate(endOfToday))
        );

        const attendanceSnap = await getDocs(attendanceQuery);
        const activitiesData: Activity[] = [];

        for (const [index, attendanceDoc] of attendanceSnap.docs.entries()) {
          const attendanceData = attendanceDoc.data();
          const userId = attendanceDoc.ref.parent.parent?.id;

          if (userId) {
            const userRef = doc(firestore, 'users', userId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
              const userData = userSnap.data();
              activitiesData.push({
                no: index + 1,
                name: userData.name || '-',
                nip: userData.nip || '-',
                checkInTime: attendanceData.checkIn ? format(attendanceData.checkIn.toDate(), 'HH:mm:ss') : '-',
                checkOutTime: attendanceData.checkOut ? format(attendanceData.checkOut.toDate(), 'HH:mm:ss') : '-',
                status: attendanceData.checkOut ? 'Pulang' : 'Hadir',
                keterangan: attendanceData.checkOut ? 'Kehadiran Penuh' : 'Masih di tempat',
              });
            }
          }
        }

        setActivities(activitiesData.sort((a,b) => a.name.localeCompare(b.name)));

      } catch (e: any) {
        console.error("Error fetching today's activity:", e);
        if (e.code === 'failed-precondition') {
            setError("Database memerlukan indeks. Silakan buat dari link di log error konsol.");
        } else {
            setError("Gagal memuat aktivitas hari ini.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivities();
  }, [firestore]);

  const todayFormatted = format(new Date(), "d MMMM yyyy", { locale: indonesiaLocale });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivitas Kehadiran Hari Ini</CardTitle>
        <CardDescription>Daftar absensi pada tanggal {todayFormatted}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span>Memuat aktivitas...</span>
          </div>
        ) : error ? (
             <div className="flex flex-col items-center justify-center h-40 text-destructive text-center px-4">
                <span>{error}</span>
            </div>
        ) : activities.length > 0 ? (
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
              {activities.map((activity) => (
                <TableRow key={activity.no}>
                  <TableCell className="font-medium">{activity.no}</TableCell>
                  <TableCell>
                     <div className="font-medium">{activity.name}</div>
                    <div className="text-sm text-muted-foreground">NIP: {activity.nip}</div>
                  </TableCell>
                  <TableCell>{activity.checkInTime} / {activity.checkOutTime}</TableCell>
                   <TableCell>
                    <Badge variant={activity.status === 'Hadir' ? 'default' : 'secondary'}>
                        {activity.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{activity.keterangan}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
           <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
             <WifiOff className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-semibold">Menunggu Aktivitas</h3>
            <p>Belum ada absensi yang tercatat pada sesi ini.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TodayActivity;
