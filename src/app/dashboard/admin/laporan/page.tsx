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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronLeft, ChevronRight, Search, Download, MoreVertical, ChevronDown } from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { collection, query, getDocs, doc, where, collectionGroup, orderBy } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, eachDayOfInterval, startOfDay, isWithinInterval, setHours, setMinutes, isSameDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { exportToExcel, exportToPdf, exportDetailedReportToExcel, exportDetailedReportToPdf } from '@/lib/export';


async function generateDetailedReportData(firestore: any, userId: string, currentMonth: Date, schoolConfig: any, monthlyConfig: any) {
    if (!firestore || !userId || !currentMonth || !schoolConfig || monthlyConfig === undefined) return [];

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const today = startOfDay(new Date());

    const attendanceQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), orderBy('checkInTime', 'desc'));
    const leaveQuery = query(collection(firestore, 'users', userId, 'leaveRequests'), orderBy('startDate', 'desc'));

    const [attendanceSnapshot, leaveSnapshot] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);
    const attendanceHistory = attendanceSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    const leaveHistory = leaveSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    const holidays: string[] = monthlyConfig?.holidays ?? [];

    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const report = allDaysInMonth.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isWorkingDay = !offDays.includes(day.getDay()) && !holidays.includes(dayStr);

        const leaveRecord = leaveHistory.find(l => 
            l.status === 'approved' && isWithinInterval(day, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) })
        );

        if (leaveRecord) {
            return {
                id: `${leaveRecord.id}-${dayStr}`,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: leaveRecord.type,
                description: leaveRecord.reason,
            };
        }

        const attendanceRecord = attendanceHistory.find(a => a.checkInTime && format(a.checkInTime.toDate(), 'yyyy-MM-dd') === dayStr);

        if (attendanceRecord) {
            const checkInTime = attendanceRecord.checkInTime.toDate();
            const checkOutTime = attendanceRecord.checkOutTime?.toDate();
            let status = 'Hadir';
            let description = 'Absen Terekam';

            if (schoolConfig.useTimeValidation && schoolConfig.checkInEndTime) {
                const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                const checkInDeadline = setMinutes(setHours(startOfDay(checkInTime), endH), endM);
                if (isBefore(checkInTime, checkInDeadline) === false) {
                    status = 'Terlambat';
                    description = 'Terlambat';
                }
            }
            
            if (!checkOutTime && isBefore(day, today)) {
                status = 'Alpa';
                description = 'Tidak Absen Pulang';
            } else if (!checkOutTime) {
                description = 'Belum Absen Pulang';
            }

            return {
                id: attendanceRecord.id,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: format(checkInTime, 'HH:mm:ss'),
                checkOut: checkOutTime ? format(checkOutTime, 'HH:mm:ss') : '-',
                status,
                description,
            };
        }
        
        if (isWorkingDay && isBefore(day, today)) {
             return {
                id: dayStr,
                date: day,
                dateString: format(day, 'eee, dd/MM/yy', { locale: id }),
                checkIn: '-',
                checkOut: '-',
                status: 'Alpa',
                description: 'Tidak Ada Keterangan',
            };
        }

        return null;
    });

    return report.filter(Boolean).sort((a, b) => (b.date.getTime()) - (a.date.getTime()));
}

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
            if (!firestore || !user || !users || !schoolConfig || monthlyConfig === undefined) {
                if (!isUsersLoading && !isConfigLoading && !isMonthlyConfigLoading) setIsLoading(false);
                return;
            }
            
            setIsLoading(true);

            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(currentMonth);

            const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('checkInTime', '>=', monthStart), where('checkInTime', '<=', monthEnd));
            const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));
            
            const [attendanceSnapshot, leaveSnapshot] = await Promise.all([ getDocs(attendanceQuery), getDocs(leaveQuery) ]);

            const allAttendance = attendanceSnapshot.docs.map(d => ({...d.data(), id: d.id, checkInTime: d.data().checkInTime.toDate() }));
            const allLeave = leaveSnapshot.docs.map(d => ({ ...d.data(), id: d.id, startDate: d.data().startDate.toDate(), endDate: d.data().endDate.toDate() }));

            const offDays: number[] = schoolConfig?.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig?.holidays ?? [];
            const today = startOfDay(new Date());

            const workingDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(day => !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd')));
            const pastWorkingDaysInMonth = workingDaysInMonth.filter(day => isBefore(day, today) || isSameDay(day, today));
            const totalWorkingDays = workingDaysInMonth.length;
            const totalPastWorkingDays = pastWorkingDaysInMonth.length;

            const attendanceByUser = allAttendance.reduce((acc: any, record: any) => { (acc[record.userId] = acc[record.userId] || []).push(record); return acc; }, {});
            const leaveByUser = allLeave.reduce((acc: any, record: any) => { (acc[record.userId] = acc[record.userId] || []).push(record); return acc; }, {});

            const userSummary = users.map((u: any) => {
                const userAttendance = attendanceByUser[u.id] || [];
                const userLeave = leaveByUser[u.id] || [];
                const hadirCount = userAttendance.length;
                
                let terlambatCount = 0;
                if (schoolConfig?.useTimeValidation && schoolConfig?.checkInEndTime) {
                    const [endH, endM] = schoolConfig.checkInEndTime.split(':').map(Number);
                    terlambatCount = userAttendance.filter((att: any) => {
                        if (!att.checkInTime) return false;
                        const checkInDeadline = setMinutes(setHours(new Date(att.checkInTime), endH), endM);
                        return isBefore(checkInDeadline, att.checkInTime);
                    }).length;
                }

                let izinCount = 0;
                let sakitCount = 0;
                userLeave.forEach((leave: any) => {
                    eachDayOfInterval({ start: leave.startDate, end: leave.endDate }).forEach(day => {
                        if (isWithinInterval(day, { start: monthStart, end: monthEnd }) && workingDaysInMonth.some(wd => isSameDay(wd, day))) {
                            if (leave.type === 'Izin') izinCount++;
                            else if (leave.type === 'Sakit') sakitCount++;
                        }
                    });
                });

                const alpaCount = Math.max(0, totalPastWorkingDays - hadirCount - izinCount - sakitCount);
                const presentasi = totalWorkingDays > 0 ? Math.round((hadirCount / totalWorkingDays) * 100) : 0;

                return { ...u, hadir: hadirCount, izin: izinCount, sakit: sakitCount, alpa: alpaCount, terlambat: terlambatCount, presentasi: `${presentasi}%` };
            });

            const groupedByRole = userSummary.reduce((acc: any, user: any) => {
                const role = user.role || 'lainnya';
                (acc[role] = acc[role] || []).push(user);
                return acc;
            }, {});
            
            if(groupedByRole.guru) groupedByRole.guru.sort((a:any,b:any) => (a.sequenceNumber || 999) - (b.sequenceNumber || 999));
            if(groupedByRole.pegawai) groupedByRole.pegawai.sort((a:any,b:any) => (a.sequenceNumber || 999) - (b.sequenceNumber || 999));
            if(groupedByRole.kepala_sekolah) groupedByRole.kepala_sekolah.sort((a:any,b:any) => (a.sequenceNumber || 999) - (b.sequenceNumber || 999));

            setSummary(groupedByRole);
            setIsLoading(false);
        };

        fetchAllData();

    }, [firestore, user, users, schoolConfig, monthlyConfig, currentMonth, isUsersLoading, isConfigLoading, isMonthlyConfigLoading]);

    return { summary, isLoading, schoolConfig, monthlyConfig };
}

const AdminReportTable = ({ data, isLoading, currentMonth, firestore, schoolConfig, monthlyConfig }: { data: any[], isLoading: boolean, currentMonth: Date, firestore: any, schoolConfig: any, monthlyConfig: any }) => {
    const router = useRouter();
    const [isDownloading, setIsDownloading] = useState<string | null>(null);
    const cols = 12;

    const navigateToDetailPage = (userId: string) => {
        const monthStr = format(currentMonth, 'yyyy-MM');
        router.push(`/dashboard/admin/laporan/${userId}?month=${monthStr}`);
    };

    const handleDownload = async (user: any, type: 'excel' | 'pdf') => {
        const downloadId = `${user.id}-${type}`;
        setIsDownloading(downloadId);
        try {
            const detailedData = await generateDetailedReportData(firestore, user.id, currentMonth, schoolConfig, monthlyConfig);
            if (type === 'excel') {
                exportDetailedReportToExcel(detailedData, user, currentMonth);
            } else {
                exportDetailedReportToPdf(detailedData, user, currentMonth, schoolConfig);
            }
        } catch (error) {
            console.error("Failed to download report:", error);
            alert("Gagal mengunduh laporan. Silakan coba lagi.");
        } finally {
            setIsDownloading(null);
        }
    };
    
    if (isLoading) {
        return (
             <div className="rounded-md border">
                <Table>
                    <TableHeader><TableRow>{[...Array(cols)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}</TableRow></TableHeader>
                    <TableBody>{[...Array(10)].map((_, i) => (<TableRow key={i}>{[...Array(cols)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>))}</TableBody>
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
                        <TableHead className="text-center">Unduh</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
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
                                <TableCell className="text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" disabled={isDownloading === `${user.id}-excel` || isDownloading === `${user.id}-pdf`}>
                                                {isDownloading === `${user.id}-excel` || isDownloading === `${user.id}-pdf` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center">
                                            <DropdownMenuItem onClick={() => handleDownload(user, 'excel')} disabled={!schoolConfig}>
                                                Unduh Excel
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDownload(user, 'pdf')} disabled={!schoolConfig}>
                                                Unduh PDF
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigateToDetailPage(user.id)}>Lihat Detail</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigateToDetailPage(user.id)}>Edit Kehadiran</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow><TableCell colSpan={cols} className="h-24 text-center">Tidak ada data untuk ditampilkan.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

function AdminReportView() {
  const [activeTab, setActiveTab] = useState('guru');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const { summary, isLoading, schoolConfig, monthlyConfig } = useAttendanceSummary(currentMonth);
  const firestore = useFirestore();

  const filteredData = useMemo(() => {
    const dataForTab = summary[activeTab] || [];
    if (!searchQuery) return dataForTab;
    return dataForTab.filter((user: any) => user.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [summary, activeTab, searchQuery]);
  
  const handleExportExcel = () => {
    exportToExcel(summary, currentMonth, activeTab);
  };

  const handleExportPdf = () => {
    exportToPdf(summary, currentMonth, activeTab, schoolConfig);
  };
  
  const noData = !summary[activeTab] || summary[activeTab].length === 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
                <CardTitle>Laporan Kehadiran Admin</CardTitle>
                <CardDescription>Menampilkan rekapitulasi data kehadiran untuk seluruh pengguna.</CardDescription>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                     <Button variant="outline" className="w-full sm:w-auto">
                        <Download className="mr-2 h-4 w-4" />
                        Unduh Laporan
                        <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportExcel} disabled={isLoading || noData}>
                        Unduh Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPdf} disabled={isLoading || noData || !schoolConfig}>
                        Unduh PDF
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
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
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="font-semibold text-center w-32 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} disabled={isSameMonth(currentMonth, new Date())}><ChevronRight className="h-4 w-4" /></Button>
                    <div className="relative w-full md:w-auto">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Cari nama..." className="pl-8 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                </div>
            </div>
            <TabsContent value="guru"><AdminReportTable data={filteredData} isLoading={isLoading} currentMonth={currentMonth} firestore={firestore} schoolConfig={schoolConfig} monthlyConfig={monthlyConfig} /></TabsContent>
            <TabsContent value="pegawai"><AdminReportTable data={filteredData} isLoading={isLoading} currentMonth={currentMonth} firestore={firestore} schoolConfig={schoolConfig} monthlyConfig={monthlyConfig} /></TabsContent>
            <TabsContent value="kepala_sekolah"><AdminReportTable data={filteredData} isLoading={isLoading} currentMonth={currentMonth} firestore={firestore} schoolConfig={schoolConfig} monthlyConfig={monthlyConfig} /></TabsContent>
            <TabsContent value="siswa"><AdminReportTable data={filteredData} isLoading={isLoading} currentMonth={currentMonth} firestore={firestore} schoolConfig={schoolConfig} monthlyConfig={monthlyConfig} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function AdminReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

    const isLoadingPage = isUserLoading || isUserDataLoading;
    const isAdmin = !isLoadingPage && userData?.role === 'admin';

    useEffect(() => {
        if (!isLoadingPage) {
            if (!user) { router.replace('/'); }
            else if (!isAdmin) { router.replace('/dashboard'); }
        }
    }, [isLoadingPage, isAdmin, user, router]);

    if (isLoadingPage || !isAdmin) {
        return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }
    
    return <AdminReportView />;
}
