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
// MODIFIED: Imported collectionGroup to perform the correct query as per security rules.
import { collection, query, where, getDocs, onSnapshot, documentId, collectionGroup } from 'firebase/firestore';
import { startOfDay, endOfDay, format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { AlertCircle, Loader2, TimerOff, WifiOff } from 'lucide-react';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';

// Interface for the final formatted data
interface Activity {
  no: number;
  name: string;
  nip: string;
  checkInTime: string;
  checkOutTime: string;
  status: 'hadir' | 'proses';
  keterangan: string;
}

// Interface for raw user data fetched from Firestore
interface UserData {
  [key: string]: {
    name: string;
    nip: string;
  };
}

// The main component
const RecentAttendanceTable = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // State to hold any permission errors
  const firestore = useFirestore();
  const { status, config } = useAttendanceWindow(); // This hook is now for displaying status messages only.

  useEffect(() => {
    if (!firestore) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null); // Reset error on new fetch

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // --- CORE FIX ---
    // The query now uses collectionGroup('attendanceRecords') to match the Firebase Security Rules.
    // This allows admins/kepsek to read from all user attendance sub-collections at once.
    // The previous query on collection('absensi') was causing "Missing or insufficient permissions".
    const attendanceQuery = query(
      collectionGroup(firestore, 'attendanceRecords'), // This is the correct way designed by the security rules.
      where('tanggal', '>=', todayStart),
      where('tanggal', '<=', todayEnd)
    );

    const unsubscribe = onSnapshot(attendanceQuery, async (attendanceSnap) => {
      if (attendanceSnap.empty) {
        setActivities([]);
        setIsLoading(false);
        return;
      }

      const userIds = new Set<string>();
      const attendanceRecords: { [userId: string]: any } = {};

      attendanceSnap.forEach(doc => {
        const data = doc.data();
        // Assuming 'userId' field exists within each attendance record.
        if (data.userId) {
            userIds.add(data.userId);
            attendanceRecords[data.userId] = data;
        } else {
            console.warn("Attendance record found without a userId:", doc.id);
        }
      });

      if (userIds.size === 0) {
          setActivities([]);
          setIsLoading(false);
          return;
      }
      
      // Fetch user details for all users who have attendance records
      const usersQuery = query(
        collection(firestore, 'users'),
        where(documentId(), 'in', Array.from(userIds))
      );
      const userSnap = await getDocs(usersQuery);
      const usersData: UserData = {};
      userSnap.forEach(doc => {
        const data = doc.data();
        usersData[doc.id] = { name: data.nama, nip: data.nip || '-' };
      });

      // Combine user data with attendance data
      const finalActivities: Activity[] = Object.keys(usersData).map((userId, index) => {
        const userDetail = usersData[userId];
        const attendance = attendanceRecords[userId];

        const checkInTime = attendance.jamMasuk ? format(attendance.jamMasuk.toDate(), 'HH:mm') : '--:--';
        const checkOutTime = attendance.jamPulang ? format(attendance.jamPulang.toDate(), 'HH:mm') : '--:--';

        let status: Activity['status'] = 'proses';
        let keterangan = 'Belum Absen Pulang';

        if (attendance.jamMasuk && attendance.jamPulang) {
          status = 'hadir';
          keterangan = 'Kehadiran Penuh';
        }

        return {
          no: index + 1,
          name: userDetail?.name || 'Nama Tidak Ditemukan',
          nip: userDetail?.nip || '-',
          checkInTime,
          checkOutTime,
          status,
          keterangan,
        };
      });

      setActivities(finalActivities.sort((a, b) => a.name.localeCompare(b.name)));
      setIsLoading(false);
    }, (err) => {
      console.error("Error listening to attendance records:", err);
      // Capture the specific permission error to display a helpful message to the user.
      if (err.code === 'permission-denied') {
          setError("Izin ditolak. Periksa Aturan Keamanan (Security Rules) Firestore Anda.");
      } else {
          setError("Terjadi kesalahan saat mengambil data.");
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  const BadgeStatus = ({ status }: { status: Activity['status'] }) => {
    const statusMap = {
      hadir: { variant: 'default', text: 'Hadir' },
      proses: { variant: 'outline', text: 'Proses' },
    } as const;

    const { variant, text } = statusMap[status];
    return <Badge variant={variant}>{text}</Badge>;
  };

  const EmptyState = () => {
    const getNextSessionTime = () => {
        if (!config || !config.checkInStartTime || !config.checkOutStartTime) return "Jadwal tidak diatur.";
        const now = new Date();
        const checkinStart = new Date(now.toDateString() + ' ' + config.checkInStartTime);
        if (now < checkinStart) {
            return `Sesi masuk akan dimulai pukul ${config.checkInStartTime}.`;
        }
        const checkoutStart = new Date(now.toDateString() + ' ' + config.checkOutStartTime);
        if (now < checkoutStart) {
            return `Sesi pulang akan dimulai pukul ${config.checkOutStartTime}.`;
        }
        return "Semua sesi hari ini telah berakhir.";
    };

    if (isLoading) {
        return <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Memuat data kehadiran...</span></div>;
    }
    
    // If an error (like permission denied) occurred, show it with high priority.
    if (error) {
        return <div className="flex flex-col items-center justify-center h-48 text-destructive"><AlertCircle className="h-8 w-8 mb-3" /><span>{error}</span></div>;
    }

    // If no data and no error, show status based on the attendance window.
    switch (status) {
      case 'CLOSED':
      case 'SESSION_INACTIVE':
        return <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><TimerOff className="h-8 w-8 mb-3" /><span>Sesi Absensi Ditutup</span><span className="text-xs mt-1 text-center">{getNextSessionTime()}</span></div>;
      case 'CHECK_IN_OPEN':
      case 'CHECK_OUT_OPEN':
        return <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><WifiOff className="h-8 w-8 mb-3" /><span>Menunggu aktivitas...</span><span className="text-xs mt-1">Belum ada absensi yang tercatat pada sesi ini.</span></div>;
      default:
        return <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Memeriksa jadwal...</span></div>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivitas Kehadiran Hari Ini</CardTitle>
        <CardDescription>Daftar absensi pada tanggal {format(new Date(), 'd MMMM yyyy', { locale: localeId })}</CardDescription>
      </CardHeader>
      <CardContent>
        {(!isLoading && activities.length > 0) ? (
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
                  <TableCell>{activity.no}</TableCell>
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
