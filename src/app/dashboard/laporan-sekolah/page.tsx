'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  doc, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { 
  startOfMonth, 
  endOfMonth, 
  format, 
  addMonths, 
  subMonths, 
  eachDayOfInterval, 
  isWithinInterval,
  getDaysInMonth
} from 'date-fns';
import { id as indonesianLocale } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  FileDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import * as XLSX from 'xlsx';

const ReportTableSkeleton = () => (
    <div className="border rounded-md">
        <Table>
            <TableHeader>
                <TableRow>
                    {[...Array(5)].map((_, i) => (
                        <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {[...Array(10)].map((_, i) => (
                    <TableRow key={i}>
                        {[...Array(5)].map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);

export default function AdminLaporanPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('guru');
  const [isDownloading, setIsDownloading] = useState(false);

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user, firestore]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);
  const isAllowed = !isUserDataLoading && (userData?.role === 'admin' || userData?.role === 'kepala_sekolah');

  useEffect(() => {
    if (!isUserLoading && !isUserDataLoading) {
      if (!user) router.replace('/');
      else if (!isAllowed) router.replace('/dashboard');
    }
  }, [user, isUserLoading, isUserDataLoading, isAllowed, router]);

  const usersQuery = useMemoFirebase(() => {
      if (!firestore || !isAllowed) return null;
      const q = query(
          collection(firestore, 'users'), 
          where('role', '==', selectedRole)
      );
      if (selectedRole === 'guru' || selectedRole === 'kepala_sekolah' || selectedRole === 'pegawai') {
        return query(q, orderBy('sequenceNumber', 'asc'))
      }
      return query(q, orderBy('name', 'asc'))
  }, [firestore, isAllowed, selectedRole]);
  
  const { data: usersData, isLoading: isUsersLoading } = useCollection(user, usersQuery);

  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfigData } = useDoc(user, schoolConfigRef);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
  const { data: monthlyConfigData } = useDoc(user, monthlyConfigRef);

  const [reportData, setReportData] = useState<any[]>([]);
  const [isReportLoading, setIsReportLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !usersData) {
      if (usersData === null) setIsReportLoading(true)
      else if (usersData?.length === 0) {
        setReportData([]);
        setIsReportLoading(false)
      }
      return;
    };

    const fetchReports = async () => {
      setIsReportLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const offDays: number[] = schoolConfigData?.offDays ?? [0, 6];
      const holidays: string[] = monthlyConfigData?.holidays ?? [];
      const effectiveWorkDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).filter(
        day => !holidays.includes(format(day, 'yyyy-MM-dd')) && !offDays.includes(day.getDay())
      );

      const processedData = await Promise.all(usersData.map(async (u) => {
        const attendanceQuery = query(
          collection(firestore, 'users', u.id, 'attendanceRecords'),
          where('checkInTime', '>=', monthStart),
          where('checkInTime', '<=', monthEnd)
        );
        const leaveQuery = query(
          collection(firestore, 'users', u.id, 'leaveRequests'),
          where('status', '==', 'approved'),
          where('startDate', '<=', monthEnd)
        );

        const [attendanceSnap, leaveSnap] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

        const userAttendance = attendanceSnap.docs.map(d => ({ ...d.data(), checkInTime: d.data().checkInTime.toDate() }));
        const userLeaves = leaveSnap.docs.map(d => ({ ...d.data(), startDate: d.data().startDate.toDate(), endDate: d.data().endDate.toDate() })).filter(l => l.endDate >= monthStart);

        const dailyStatuses: { [key: string]: string } = {};
        let totalHadir = 0, totalSakit = 0, totalIzin = 0, totalAlpa = 0;

        effectiveWorkDays.forEach(day => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const attendanceRecord = userAttendance.find(att => format(att.checkInTime, 'yyyy-MM-dd') === dayKey);
          const leaveRecord = userLeaves.find(l => isWithinInterval(day, { start: l.startDate, end: l.endDate }));

          if (attendanceRecord) {
              dailyStatuses[dayKey] = attendanceRecord.isLate ? 'T' : 'H';
              totalHadir++;
          } else if (leaveRecord) {
              if (leaveRecord.type === 'Sakit') {
                  dailyStatuses[dayKey] = 'S';
                  totalSakit++;
              } else {
                  dailyStatuses[dayKey] = 'I';
                  totalIzin++;
              }
          } else {
              dailyStatuses[dayKey] = 'A';
              totalAlpa++;
          }
        });

        // Fill in off days
        eachDayOfInterval({start: monthStart, end: monthEnd}).forEach(day => {
          const dayKey = format(day, 'yyyy-MM-dd');
          if (dailyStatuses[dayKey]) return;

          if(holidays.includes(dayKey) || offDays.includes(day.getDay())){
            dailyStatuses[dayKey] = 'L';
          }
        })

        return { ...u, dailyStatuses, totalHadir, totalIzin, totalSakit, totalAlpa };
      }));

      setReportData(processedData);
      setIsReportLoading(false);
    };

    fetchReports().catch(err => {
      console.error("Failed to fetch reports:", err);
      toast({variant: 'destructive', title: 'Gagal Memuat Laporan', description: 'Terjadi kesalahan saat mengambil data.'})
      setIsReportLoading(false);
    });
  }, [currentMonth, usersData, firestore, schoolConfigData, monthlyConfigData, toast]);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const filteredData = useMemo(() => {
    if (!searchQuery) return reportData;
    return reportData.filter(user => 
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, reportData]);
  
  const handleDownload = async () => {
    if (filteredData.length === 0) {
        toast({ variant: "destructive", title: "Gagal Mengunduh", description: "Tidak ada data untuk diunduh." });
        return;
    }
    setIsDownloading(true);
    
    try {
        const header = [
            'No. Urut',
            'Nama',
            'NIP',
            ...daysInMonth.map(d => format(d, 'd')),
            'H', 'S', 'I', 'A'
        ];

        const body = filteredData.map(user => [
            user.sequenceNumber ?? '-',
            user.name,
            user.nip || (user.role === 'siswa' ? user.nisn : '-'),
            ...daysInMonth.map(d => user.dailyStatuses[format(d, 'yyyy-MM-dd')] || '-'),
            user.totalHadir,
            user.totalSakit,
            user.totalIzin,
            user.totalAlpa
        ]);

        const worksheetData = [header, ...body];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        const colWidths = [
            { wch: 8 }, // No
            { wch: 35 }, // Nama
            { wch: 20 }, // NIP
            ...daysInMonth.map(() => ({ wch: 4 })), // Daily status
            { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 } // Totals
        ];
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        const sheetName = `${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}_${format(currentMonth, 'MMMM_yyyy', { locale: indonesianLocale })}`;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        XLSX.writeFile(workbook, `Laporan_${sheetName}.xlsx`);
        
        toast({ title: "Unduhan Dimulai", description: "File laporan sedang disiapkan." });
    } catch (error) {
        console.error("Excel download failed:", error);
        toast({ variant: "destructive", title: "Gagal Mengunduh", description: "Terjadi kesalahan saat membuat file Excel." });
    } finally {
        setIsDownloading(false);
    }
  };

  const isLoading = isUserLoading || isUserDataLoading || isReportLoading;

  if (!user || !isAllowed) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  return (
    <div className="flex-1 space-y-4 p-2 pt-0 md:p-8 -mt-8">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
                <CardTitle>Laporan Kehadiran Bulanan</CardTitle>
                <CardDescription>Tinjau dan kelola laporan kehadiran guru, pegawai, dan siswa.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium w-36 text-center">
                    {format(currentMonth, 'MMMM yyyy', { locale: indonesianLocale })}
                </span>
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2">
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Pilih peran" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="guru">Guru</SelectItem>
                            <SelectItem value="pegawai">Pegawai</SelectItem>
                            <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                            <SelectItem value="siswa">Siswa</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Cari nama..."
                            className="w-full rounded-lg bg-background pl-8"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <Button onClick={handleDownload} disabled={isDownloading || isLoading}>
                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                    Unduh Laporan
                </Button>
            </div>
            <div className="mt-4 border rounded-md overflow-x-auto">
                {isLoading ? (
                    <ReportTableSkeleton />
                ) : (
                    <Table className="min-w-[1200px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 bg-background z-10 w-[50px] whitespace-nowrap">{(selectedRole === 'guru' || selectedRole === 'kepala_sekolah' || selectedRole === 'pegawai') ? 'No. Urut' : 'No.'}</TableHead>
                                <TableHead className="sticky left-[50px] bg-background z-10 w-[250px] whitespace-nowrap">Nama</TableHead>
                                <TableHead className="sticky left-[300px] bg-background z-10 w-[180px] whitespace-nowrap">{(selectedRole === 'siswa') ? 'NISN' : 'NIP'}</TableHead>
                                {daysInMonth.map((day) => (
                                    <TableHead key={day.toString()} className="text-center w-[40px]">{format(day, 'd')}</TableHead>
                                ))}
                                <TableHead className="text-center font-bold w-[50px] bg-teal-500/10">H</TableHead>
                                <TableHead className="text-center font-bold w-[50px] bg-yellow-500/10">S</TableHead>
                                <TableHead className="text-center font-bold w-[50px] bg-orange-500/10">I</TableHead>
                                <TableHead className="text-center font-bold w-[50px] bg-slate-500/10">A</TableHead>
                                <TableHead className="text-center w-[80px]">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filteredData.length > 0 ? (
                            filteredData.map((d, index) => (
                                <TableRow key={d.id}>
                                    <TableCell className="sticky left-0 bg-background z-10 text-center">{(selectedRole === 'guru' || selectedRole === 'kepala_sekolah' || selectedRole === 'pegawai') ? d.sequenceNumber : (index + 1)}</TableCell>
                                    <TableCell className="sticky left-[50px] bg-background z-10 font-medium whitespace-nowrap">{d.name}</TableCell>
                                    <TableCell className="sticky left-[300px] bg-background z-10">{d.nip || d.nisn || '-'}</TableCell>
                                    {daysInMonth.map(day => (
                                        <TableCell key={day.toString()} className="text-center">{d.dailyStatuses[format(day, 'yyyy-MM-dd')] || '-'}</TableCell>
                                    ))}
                                    <TableCell className="text-center font-bold bg-teal-500/10">{d.totalHadir}</TableCell>
                                    <TableCell className="text-center font-bold bg-yellow-500/10">{d.totalSakit}</TableCell>
                                    <TableCell className="text-center font-bold bg-orange-500/10">{d.totalIzin}</TableCell>
                                    <TableCell className="text-center font-bold bg-slate-500/10">{d.totalAlpa}</TableCell>
                                    <TableCell className="text-center">
                                        <Button variant="outline" size="sm" asChild>
                                          <Link href={`/dashboard/laporan-sekolah/${d.id}?month=${format(currentMonth, 'yyyy-MM')}`}>
                                              Detail
                                          </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={daysInMonth.length + 8} className="h-24 text-center">
                                    Tidak ada data untuk ditampilkan pada bulan dan peran ini.
                                </TableCell>
                            </TableRow>
                        )}
                        </TableBody>
                    </Table>
                )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
