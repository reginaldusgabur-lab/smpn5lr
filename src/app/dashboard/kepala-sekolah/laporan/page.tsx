'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs, collectionGroup } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

// Re-using the same stable data-fetching logic from the admin page.
function useAttendanceSummary(currentMonth: Date) {
    const { user } = useUser();
    const firestore = useFirestore();

    const [summary, setSummary] = useState<{ [key: string]: any[] }>({});
    const [isLoading, setIsLoading] = useState(true);

    const usersQuery = useMemoFirebase(() => query(collection(firestore, 'users')), [firestore]);
    const { data: users, isLoading: isUsersLoading } = useCollection(user, usersQuery);

    const schoolConfigRef = useMemoFirebase(() => doc(firestore, 'schoolConfig', 'default'), [firestore]);
    const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

    const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
    const monthlyConfigRef = useMemoFirebase(() => doc(firestore, 'monthlyConfigs', monthlyConfigId), [firestore, monthlyConfigId]);
    const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);

    useEffect(() => {
        const fetchAllData = async () => {
            if (!firestore || !user || !users || schoolConfig === undefined || monthlyConfig === undefined) {
                return;
            }
            
            setIsLoading(true);

            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);

            const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('checkInTime', '>=', monthStart), where('checkInTime', '<=', monthEnd));
            const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));
            
            const [attendanceSnapshot, leaveSnapshot] = await Promise.all([
                getDocs(attendanceQuery),
                getDocs(leaveQuery)
            ]);

            const allAttendance = attendanceSnapshot.docs.map(d => ({...d.data(), id: d.id }));
            const allLeave = leaveSnapshot.docs.map(d => ({ ...d.data(), id: d.id, startDate: d.data().startDate.toDate(), endDate: d.data().endDate.toDate() }));

            const offDays: number[] = schoolConfig.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig?.holidays ?? [];
            const today = startOfDay(new Date());

            const workingDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
                .filter(day => !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd')));
            
            const pastWorkingDaysInMonth = workingDaysInMonth.filter(day => isBefore(day, today));
            const totalWorkingDays = workingDaysInMonth.length;
            const totalPastWorkingDays = pastWorkingDaysInMonth.length;

            const attendanceByUser = allAttendance.reduce((acc: any, record: any) => {
                (acc[record.userId] = acc[record.userId] || []).push(record);
                return acc;
            }, {});

            const leaveByUser = allLeave.reduce((acc: any, record: any) => {
                (acc[record.userId] = acc[record.userId] || []).push(record);
                return acc;
            }, {});

            const userSummary = users.map((u: any) => {
                const userAttendance = attendanceByUser[u.id] || [];
                const userLeave = leaveByUser[u.id] || [];

                const hadirCount = userAttendance.filter((att: any) => att.checkInTime && att.checkOutTime).length;
                
                let terlambatCount = 0;
                if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    terlambatCount = userAttendance.filter((att: any) => {
                        if (!att.checkInTime) return false;
                        const checkInTime = att.checkInTime.toDate();
                        const checkInDeadline = setMinutes(setHours(new Date(checkInTime), endH, endM), 0);
                        return isBefore(checkInDeadline, checkInTime);
                    }).length;
                }

                let izinCount = 0;
                let sakitCount = 0;
                userLeave.forEach((leave: any) => {
                    eachDayOfInterval({ start: leave.startDate, end: leave.endDate }).forEach(day => {
                        if (isWithinInterval(day, { start: monthStart, end: monthEnd }) && workingDaysInMonth.some(wd => format(wd, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))) {
                            if (leave.type === 'Izin') izinCount++;
                            else if (leave.type === 'Sakit') sakitCount++;
                        }
                    });
                });

                const alpaCount = Math.max(0, totalPastWorkingDays - hadirCount - izinCount - sakitCount);
                const presentasi = totalWorkingDays > 0 ? Math.round((hadirCount / totalWorkingDays) * 100) : 0;

                return {
                    ...u,
                    hadir: hadirCount,
                    izin: izinCount,
                    sakit: sakitCount,
                    alpa: alpaCount,
                    terlambat: terlambatCount,
                    presentasi: `${presentasi}%`
                };
            });

            const groupedByRole = userSummary.reduce((acc: any, user: any) => {
                const role = user.role || 'lainnya';
                (acc[role] = acc[role] || []).push(user);
                return acc;
            }, {});
            
            if(groupedByRole.guru) groupedByRole.guru.sort((a:any,b:any) => (a.sequenceNumber || 999) - (b.sequenceNumber || 999));
            if(groupedByRole.kepala_sekolah) groupedByRole.kepala_sekolah.sort((a:any,b:any) => (a.sequenceNumber || 999) - (b.sequenceNumber || 999));

            setSummary(groupedByRole);
            setIsLoading(false);
        };

        fetchAllData();

    }, [firestore, user, users, schoolConfig, monthlyConfig, currentMonth]);

    return { summary, isLoading };
}

// This is the read-only table for the Headmaster
const HeadmasterReportTable = ({ data, isLoading }: { data: any[], isLoading: boolean }) => {
    const cols = 10; // No Aksi column
    
    if (isLoading) {
        return (
             <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {[...Array(cols)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {[...Array(10)].map((_, i) => (
                            <TableRow key={i}>
                                {[...Array(cols)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px] text-center">No.</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>NIP</TableHead>
                        <TableHead>Status Kepegawaian</TableHead>
                        <TableHead className="text-center">Hadir</TableHead>
                        <TableHead className="text-center">Izin</TableHead>
                        <TableHead className="text-center">Sakit</TableHead>
                        <TableHead className="text-center">Alpa</TableHead>
                        <TableHead className="text-center">Terlambat</TableHead>
                        <TableHead className="text-center">Presentasi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data && data.length > 0 ? (
                        data.map((user, index) => (
                            <TableRow key={user.id}>
                                <TableCell className="text-center font-medium">{user.sequenceNumber || index + 1}</TableCell>
                                <TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell>
                                <TableCell>{user.nip || '-'}</TableCell>
                                <TableCell>{user.position || '-'}</TableCell>
                                <TableCell className="text-center font-bold">{user.hadir}</TableCell>
                                <TableCell className="text-center font-bold">{user.izin}</TableCell>
                                <TableCell className="text-center font-bold">{user.sakit}</TableCell>
                                <TableCell className="text-center font-bold text-destructive">{user.alpa}</TableCell>
                                <TableCell className="text-center font-bold">{user.terlambat}</TableCell>
                                <TableCell className="text-center font-bold">{user.presentasi}</TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={cols} className="h-24 text-center">Tidak ada data untuk ditampilkan.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

function HeadmasterReportView() {
  const [activeTab, setActiveTab] = useState('guru');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const { summary, isLoading } = useAttendanceSummary(currentMonth);

  const filteredData = useMemo(() => {
    const dataForTab = summary[activeTab] || [];
    if (!searchQuery) return dataForTab;
    return dataForTab.filter((user: any) => user.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [summary, activeTab, searchQuery]);
  
  return (
    <Card className="w-full">
      <CardHeader>
        <div>
            <CardTitle>Laporan Kehadiran Sekolah</CardTitle>
            <CardDescription>Menampilkan rekapitulasi data kehadiran untuk seluruh pengguna (Mode Lihat).</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <TabsList className="overflow-x-auto whitespace-nowrap">
                    <TabsTrigger value="guru">Data Guru</TabsTrigger>
                    <TabsTrigger value="pegawai">Data Pegawai</TabsTrigger>
                    <TabsTrigger value="kepala_sekolah">Kepala Sekolah</TabsTrigger>
                    <TabsTrigger value="siswa">Data Siswa</TabsTrigger>
                </TabsList>
                <div className="flex w-full items-center gap-2 md:w-auto">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-center w-32 capitalize">
                        {format(currentMonth, 'MMMM yyyy', { locale: id })}
                    </span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} disabled={isSameMonth(currentMonth, new Date())}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <div className="relative w-full md:w-auto">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Cari nama..." 
                            className="pl-8 w-full" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>
            <TabsContent value="guru"><HeadmasterReportTable data={filteredData} isLoading={isLoading} /></TabsContent>
            <TabsContent value="pegawai"><HeadmasterReportTable data={filteredData} isLoading={isLoading} /></TabsContent>
            <TabsContent value="kepala_sekolah"><HeadmasterReportTable data={filteredData} isLoading={isLoading} /></TabsContent>
            <TabsContent value="siswa"><HeadmasterReportTable data={filteredData} isLoading={isLoading} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Page component wrapper with security check
export default function HeadmasterReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

    const isLoadingPage = isUserLoading || isUserDataLoading;
    const canView = !isLoadingPage && (userData?.role === 'admin' || userData?.role === 'kepala_sekolah');

    useEffect(() => {
        if (!isLoadingPage && !canView) {
            router.replace('/dashboard');
        }
    }, [isLoadingPage, canView, router]);

    if (isLoadingPage || !canView) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    return <HeadmasterReportView />;
}
