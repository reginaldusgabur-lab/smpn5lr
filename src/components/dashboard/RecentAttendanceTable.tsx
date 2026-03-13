'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestore, useUser } from '@/firebase';
import { collectionGroup, query, where, orderBy, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { startOfDay, endOfDay, format, isWithinInterval } from 'date-fns';

interface AttendanceRecord {
  id: string;
  userId: string;
  name: string;
  status: string;
  time: string;
}

// Custom hook to fetch and process recent attendance data
function useRecentAttendance() {
  const firestore = useFirestore();
  const { user } = useUser(); // To ensure we only run this when logged in
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // New state for errors

  useEffect(() => {
    if (!firestore || !user) return;

    setIsLoading(true);
    setError(null); // Reset error on new fetch
    const todayStart = startOfDay(new Date());

    const attendanceQuery = query(
      collectionGroup(firestore, 'attendanceRecords'),
      orderBy('checkInTime', 'desc'),
      limit(5)
    );

    const leaveQuery = query(
        collectionGroup(firestore, 'leaveRequests'),
        where('status', '==', 'approved')
    );

    const unsubscribe = onSnapshot(attendanceQuery, async (attendanceSnap) => {
      try {
        const todayDocs = attendanceSnap.docs.filter(doc => {
          const checkInTime = doc.data().checkInTime.toDate();
          return checkInTime >= todayStart;
        });

        const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
        const schoolConfigSnap = await getDoc(schoolConfigRef);
        const schoolConfig = schoolConfigSnap.data();
        const checkInDeadline = schoolConfig?.checkInTime ?? '07:00';

        const attendancePromises = todayDocs.map(async (attendanceDoc) => {
          const record = attendanceDoc.data();
          const userDocRef = doc(firestore, 'users', record.userId);
          const userDocSnap = await getDoc(userDocRef);
          const userName = userDocSnap.exists() ? userDocSnap.data().name : 'Unknown User';
          
          const checkInTime = record.checkInTime.toDate();
          const [deadlineHours, deadlineMinutes] = checkInDeadline.split(':').map(Number);
          const status = (checkInTime.getHours() > deadlineHours || (checkInTime.getHours() === deadlineHours && checkInTime.getMinutes() > deadlineMinutes)) ? 'Terlambat' : 'Hadir';

          return {
            id: attendanceDoc.id,
            userId: record.userId,
            name: userName,
            status: status,
            time: format(checkInTime, 'HH:mm:ss'),
          };
        });

        const attendanceData = await Promise.all(attendancePromises);

        const unsubscribeLeaves = onSnapshot(leaveQuery, async (leaveSnap) => {
          const today = new Date();
          const leavePromises = leaveSnap.docs
            .filter(leaveDoc => {
              const leave = leaveDoc.data();
              const startDate = leave.startDate.toDate();
              const endDate = leave.endDate.toDate();
              return isWithinInterval(today, { start: startOfDay(startDate), end: endOfDay(endDate) });
            })
            .map(async (leaveDoc) => {
              const leave = leaveDoc.data();
              const userDocRef = doc(firestore, 'users', leave.userId);
              const userDocSnap = await getDoc(userDocRef);
              const userName = userDocSnap.exists() ? userDocSnap.data().name : 'Unknown User';
              return {
                id: leaveDoc.id,
                userId: leave.userId,
                name: userName,
                status: leave.type, // "Izin" or "Sakit"
                time: '-',
              };
            });

          const leaveData = await Promise.all(leavePromises);
          
          const combinedData = [...attendanceData];
          const presentUserIds = new Set(attendanceData.map(a => a.userId));
          
          leaveData.forEach(leave => {
              if(!presentUserIds.has(leave.userId)) {
                  combinedData.push(leave)
              }
          });

          setAttendance(combinedData.slice(0, 5));
          setIsLoading(false);
        });

        return () => unsubscribeLeaves();
      } catch (e) {
        console.error("Error processing attendance data: ", e);
        setError('Gagal memproses data kehadiran.');
        setIsLoading(false);
      }
    }, (err) => {
      console.error("Error fetching recent attendance: ", err);
      if (err.code === 'failed-precondition') {
        setError('Indeks database diperlukan. Silakan buat di Firebase Console.');
      } else {
        setError('Gagal mengambil data kehadiran.');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  return { attendance, isLoading, error }; // Return error
}

export default function RecentAttendanceTable() {
  const { attendance, isLoading, error } = useRecentAttendance();

  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'Hadir':
        return 'default';
      case 'Terlambat':
        return 'destructive';
      case 'Izin':
      case 'Sakit':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const renderBody = () => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
        </TableRow>
      ));
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={3} className="text-center h-24 text-destructive">
            {error}
          </TableCell>
        </TableRow>
      );
    }

    if (attendance.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={3} className="text-center h-24">
            Belum ada data kehadiran untuk hari ini.
          </TableCell>
        </TableRow>
      );
    }

    return attendance.map((item) => (
      <TableRow key={item.id}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell>
          <Badge variant={getBadgeVariant(item.status)}>{item.status}</Badge>
        </TableCell>
        <TableCell className="text-right">{item.time}</TableCell>
      </TableRow>
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat Kehadiran Terbaru</CardTitle>
        <CardDescription>Daftar guru & pegawai yang melakukan absensi hari ini.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Jam Masuk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderBody()}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
