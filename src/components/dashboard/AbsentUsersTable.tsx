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
import { isWithinInterval, startOfDay, endOfDay, format } from 'date-fns';
import { Loader2, UserCheck, AlertCircle, CalendarOff, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AbsentUser {
  no: number;
  name: string;
  nip: string;
  position: string;
  status: string;
}

interface UserData {
  id: string;
  name: string;
  nip: string;
  role: string;
  position: string;
  status: string;
  sequenceNumber: number | null;
}

const AbsentUsersTable = () => {
  const [absentUsers, setAbsentUsers] = useState<AbsentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHoliday, setIsHoliday] = useState(false);
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
            setAbsentUsers([]);
            setIsLoading(false);
            return;
        }

        const usersQuery = query(
            collection(firestore, 'users'), 
            where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']),
            where('status', '==', 'Aktif')
        );
        const usersSnap = await getDocs(usersQuery);
        const allStaff: UserData[] = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));

        const attendanceQuery = query(
          collectionGroup(firestore, 'attendanceRecords'), 
          where('date', '==', format(today, 'yyyy-MM-dd'))
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const presentUserIds = new Set<string>();
        attendanceSnap.forEach(doc => {
          const userId = doc.data().userId || doc.ref.parent.parent?.id;
          if (userId) presentUserIds.add(userId);
        });

        const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'));
        const leaveSnap = await getDocs(leaveQuery);
        const onLeaveOrPendingUserIds = new Map<string, {
            status: 'approved' | 'pending' | 'rejected'; 
            type: string;
        }>();

        leaveSnap.forEach(doc => {
          const leave = doc.data();
          const startDate = leave.startDate?.toDate();
          const endDate = leave.endDate?.toDate();

          if (startDate && endDate && isWithinInterval(today, { start: startOfDay(startDate), end: endOfDay(endDate) })) {
            const userId = leave.userId || doc.ref.parent.parent?.id;
            if (userId) {
                if (!onLeaveOrPendingUserIds.has(userId) || leave.status === 'approved') {
                    onLeaveOrPendingUserIds.set(userId, { status: leave.status, type: leave.type });
                }
            }
          }
        });

        const usersToDisplay = allStaff
          .filter(user => !presentUserIds.has(user.id))
          .sort((a, b) => (a.sequenceNumber ?? 999) - (b.sequenceNumber ?? 999)) 
          .map((user, index) => {
            const leaveInfo = onLeaveOrPendingUserIds.get(user.id);
            let status = 'Alpa';

            if(leaveInfo) {
                if(leaveInfo.status === 'approved') {
                    status = leaveInfo.type || 'Izin';
                } else if (leaveInfo.status === 'pending') {
                    status = 'Menunggu';
                }
            }
            
            return {
                no: index + 1,
                name: user.name,
                nip: user.nip || '-',
                position: user.position || 'Staf',
                status: status,
            };
          });

        setAbsentUsers(usersToDisplay);

      } catch (e: any) {
        console.error("Error finding absent users:", e);
        setError("Gagal memuat daftar staf tidak hadir.");
      } finally {
        setIsLoading(false);
      }
    };

    findAbsentUsers();

  }, [firestore]);

  const EmptyState = () => {
      if(isLoading) return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mb-3" /><span>Mencari data kehadiran...</span></div>;
      if(error) return <div className="flex flex-col items-center justify-center h-40 text-destructive text-center px-4"><AlertCircle className="h-8 w-8 mb-3" /><span>{error}</span></div>
      if(isHoliday) return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><CalendarOff className="h-8 w-8 mb-3 opacity-50" /><span>Hari libur, sistem non-aktif.</span></div>;
      return <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><UserCheck className="h-8 w-8 mb-3 text-green-500" /><span>Semua staf telah hadir hari ini.</span></div>;
  }

  const getStatusStyle = (status: string) => {
      const s = status.toLowerCase();
      // Alpa: Merah Solid (Sesuai Gambar)
      if (s === 'alpa') return 'bg-red-800 text-white border-none rounded-full px-5 py-1.5 h-auto shadow-sm';
      // Sakit: Oranye Solid (Sesuai Permintaan)
      if (s === 'sakit') return 'bg-orange-600 text-white border-none rounded-full px-5 py-1.5 h-auto shadow-sm';
      // Izin: Biru Solid
      if (s === 'izin' || s.includes('izin pribadi')) return 'bg-blue-800 text-white border-none rounded-full px-5 py-1.5 h-auto shadow-sm';
      // Dinas / Pulang Cepat: Ungu Solid
      if (s.includes('dinas') || s.includes('pulang cepat')) return 'bg-purple-800 text-white border-none rounded-full px-5 py-1.5 h-auto shadow-sm';
      // Menunggu: Abu-abu Solid
      if (s === 'menunggu') return 'bg-slate-700 text-white border-none rounded-full px-5 py-1.5 h-auto shadow-sm';
      
      return 'bg-primary text-white border-none rounded-full px-5 py-1.5 h-auto shadow-sm';
  }

  return (
    <div className="w-full space-y-4">
      <Card className="bg-card border border-muted-foreground/10 rounded-xl overflow-hidden shadow-none">
        <CardHeader className="p-6 border-b border-muted-foreground/5">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="space-y-1">
              <CardTitle className="font-bold text-base tracking-tight text-destructive">
                Daftar Ketidakhadiran
              </CardTitle>
              <p className="text-sm font-medium text-muted-foreground">
                Staf tanpa absen & izin
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!isHoliday && absentUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                  <TableHeader className="bg-destructive/5">
                  <TableRow className="border-none">
                      <TableHead className="w-[60px] text-center font-bold text-[10px] tracking-widest text-destructive uppercase">No</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-widest text-destructive uppercase">Nama & Posisi</TableHead>
                      <TableHead className="text-center font-bold text-[10px] tracking-widest text-destructive uppercase">Status</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                  {absentUsers.map((user, index) => (
                      <TableRow key={index} className="border-muted-foreground/5 hover:bg-muted/30 transition-colors">
                      <TableCell className="text-center font-bold text-xs text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                          <div className="font-bold text-sm text-foreground">{user.name}</div>
                          <div className="text-[10px] text-muted-foreground font-bold tracking-tight">{user.position}</div>
                      </TableCell>
                      <TableCell className="text-center">
                          <Badge variant="outline" className={cn("text-[10px] font-bold", getStatusStyle(user.status))}>
                              {user.status}
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

export default AbsentUsersTable;