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
  Card,  CardContent,  CardHeader,  CardTitle,  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, collectionGroup, documentId } from 'firebase/firestore';
import { startOfDay, endOfDay, format, isWithinInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

interface Activity {
  no: number;
  name: string;
  nip: string;
  checkInTime: string;
  checkOutTime: string;
  status: 'hadir' | 'izin' | 'sakit' | 'proses';
  keterangan: string;
}

interface UserData {
    [key: string]: {
        name: string;
        nip: string;
    }
}

const TodaysActivityTable = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const firestore = useFirestore();
  const { user } = useUser();

  useEffect(() => {
    if (!firestore || !user) return;

    const fetchTodaysActivityWithCollectionGroup = async () => {
      setIsLoading(true);
      try {
        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());

        // 1. Get all attendance & leave records for today using collectionGroup
        const attendanceQuery = query(
          collectionGroup(firestore, 'attendanceRecords'),
          where('checkInTime', '>=', todayStart),
          where('checkInTime', '<=', todayEnd)
        );

        const leaveQuery = query(
          collectionGroup(firestore, 'leaveRequests'),
          where('status', '==', 'approved'),
          // This logic finds leaves that overlap with today
        );

        const [attendanceSnap, leaveSnap] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(leaveQuery)
        ]);

        const activityData: { [userId: string]: { attendance?: any, leave?: any } } = {};
        const userIds = new Set<string>();

        // Process attendance records
        attendanceSnap.forEach(doc => {
          const userId = doc.ref.parent.parent?.id;
          if (userId) {
            if (!activityData[userId]) activityData[userId] = {};
            activityData[userId].attendance = doc.data();
            userIds.add(userId);
          }
        });

        // Process leave records
        leaveSnap.forEach(doc => {
          const leaveData = doc.data();
          // check if today is within the leave range
          if (isWithinInterval(todayStart, { start: leaveData.startDate.toDate(), end: leaveData.endDate.toDate() })) {
              const userId = doc.ref.parent.parent?.id;
              if (userId) {
                if (!activityData[userId]) activityData[userId] = {};
                activityData[userId].leave = leaveData;
                userIds.add(userId);
              }
          }
        });

        if (userIds.size === 0) {
          setActivities([]);
          setIsLoading(false);
          return;
        }

        // 2. Get user details for the users found
        const usersQuery = query(
            collection(firestore, 'users'),
            where(documentId(), 'in', Array.from(userIds))
        );
        const userSnap = await getDocs(usersQuery);
        const usersData: UserData = {};
        userSnap.forEach(doc => {
            const data = doc.data();
            usersData[doc.id] = { name: data.name, nip: data.nip || '-' };
        });

        // 3. Combine data to create final activity list
        const finalActivities: Activity[] = Object.keys(activityData).map((userId, index) => {
            const userDetail = usersData[userId];
            const { attendance, leave } = activityData[userId];
            
            let status: Activity['status'] = 'proses';
            let keterangan = '-';
            let checkInTime = '--:--';
            let checkOutTime = '--:--';

            if (leave) {
                status = leave.type === 'Izin' ? 'izin' : 'sakit';
                keterangan = `Izin/Sakit (${leave.type})`;
            } else if (attendance) {
                checkInTime = format(attendance.checkInTime.toDate(), 'HH:mm');
                if (attendance.checkOutTime) {
                    status = 'hadir';
                    checkOutTime = format(attendance.checkOutTime.toDate(), 'HH:mm');
                    keterangan = 'Kehadiran Penuh';
                } else {
                    status = 'proses';
                    keterangan = 'Belum Absen Pulang';
                }
            }

            return {
                no: index + 1,
                name: userDetail?.name || 'Nama Tidak Ditemukan',
                nip: userDetail?.nip || '-',
                checkInTime,
                checkOutTime,
                status,
                keterangan
            };
        });

        setActivities(finalActivities);

      } catch (error) {
        console.error("Error fetching activity with collection group:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodaysActivityWithCollectionGroup();
  }, [firestore, user]);

  const BadgeStatus = ({ status }: { status: Activity['status'] }) => {
    const statusMap = {
      hadir: { variant: 'default', text: 'Hadir' },
      izin: { variant: 'secondary', text: 'Izin' },
      sakit: { variant: 'secondary', text: 'Sakit' },
      proses: { variant: 'outline', text: 'Proses' },
    };
    const { variant, text } = statusMap[status] || { variant: 'default', text: 'N/A' };
    
    // @ts-ignore
    return <Badge variant={variant}>{text}</Badge>;
  };

  return (
    <Card>
        <CardHeader>
            <CardTitle>Riwayat Kehadiran Hari Ini</CardTitle>
            <CardDescription>Daftar aktivitas absensi seluruh guru dan pegawai pada tanggal {format(new Date(), 'd MMMM yyyy', { locale: localeId })}.</CardDescription>
        </CardHeader>
        <CardContent>
             {isLoading ? (
                <div className="flex justify-center items-center h-48">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead className="w-[50px]">No</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Jam Masuk/Pulang</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Keterangan</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {activities.length > 0 ? (
                            activities.map((activity) => (
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
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    Belum ada aktivitas kehadiran hari ini.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}
        </CardContent>
    </Card>
  );
};

export default TodaysActivityTable;
