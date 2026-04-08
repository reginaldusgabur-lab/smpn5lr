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
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Loader2, UserCheck, AlertCircle } from 'lucide-react';

interface AbsentUser {
  no: number;
  name: string;
  nip: string;
}

interface UserData {
  id: string;
  name: string;
  nip: string;
  role: string;
  skNumber: number;
}

const AbsentUsersTable = () => {
  const [absentUsers, setAbsentUsers] = useState<AbsentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) {
      setIsLoading(false);
      return;
    }

    const findAbsentUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const today = new Date();
        const todayStart = startOfDay(today);
        const todayEnd = endOfDay(today);

        // --- PERBAIKAN LOGIKA DI SINI ---
        // 1. Ambil HANYA pengguna yang diwajibkan absen (guru, pegawai, kepala sekolah)
        const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
        const usersSnap = await getDocs(usersQuery);
        const allUsers: UserData[] = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));

        // 2. Ambil ID pengguna yang hadir hari ini
        const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('checkInTime', '>=', todayStart), where('checkInTime', '<=', todayEnd));
        const attendanceSnap = await getDocs(attendanceQuery);
        const attendedUserIds = new Set<string>();
        attendanceSnap.forEach(doc => {
          const userId = doc.ref.parent.parent?.id;
          if (userId) attendedUserIds.add(userId);
        });

        // 3. Ambil ID pengguna yang memiliki izin/sakit disetujui hari ini
        const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));
        const leaveSnap = await getDocs(leaveQuery);
        const onLeaveUserIds = new Set<string>();
        leaveSnap.forEach(doc => {
          const leave = doc.data();
          if (leave.startDate && leave.endDate && isWithinInterval(today, { start: leave.startDate.toDate(), end: leave.endDate.toDate() })) {
            const userId = doc.ref.parent.parent?.id;
            if (userId) onLeaveUserIds.add(userId);
          }
        });

        // 4. Filter untuk menemukan pengguna yang alpa
        const usersWhoAreAbsent = allUsers.filter(user => 
          !attendedUserIds.has(user.id) && !onLeaveUserIds.has(user.id)
        );

        // 5. Urutkan berdasarkan nomor SK dan format untuk tabel
        const formattedAbsentUsers = usersWhoAreAbsent
          .sort((a, b) => (a.skNumber || 999) - (b.skNumber || 999))
          .map((user, index) => ({
            no: index + 1,
            name: user.name,
            nip: user.nip || '-',
          }));

        setAbsentUsers(formattedAbsentUsers);

      } catch (e) {
        console.error("Error finding absent users:", e);
        setError("Gagal memuat daftar pengguna yang alpa.");
      } finally {
        setIsLoading(false);
      }
    };

    findAbsentUsers();

  }, [firestore]);

  const EmptyState = () => {
      if(isLoading) return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Mencari data...</span></div>;
      if(error) return <div className="flex flex-col items-center justify-center h-40 text-destructive"><AlertCircle className="h-8 w-8 mb-3" /><span>{error}</span></div>
      return <div className="flex flex-col items-center justify-center h-40 text-primary"><UserCheck className="h-8 w-8 mb-3" /><span>Lengkap</span><span className="text-xs mt-1">Semua guru dan pegawai hadir atau memiliki keterangan.</span></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar Pengguna Alpa Hari Ini</CardTitle>
        <CardDescription>Pengguna yang tidak melakukan absensi masuk dan tidak memiliki izin/sakit.</CardDescription>
      </CardHeader>
      <CardContent>
        {absentUsers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>Nama</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {absentUsers.map((user) => (
                <TableRow key={user.no}>
                  <TableCell className="font-medium">{user.no}</TableCell>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">NIP: {user.nip}</div>
                  </TableCell>
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

export default AbsentUsersTable;
