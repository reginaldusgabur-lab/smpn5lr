'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import * as XLSX from 'xlsx';

// Interface data untuk setiap baris dalam laporan
interface ReportRowData {
    no: number;
    uid: string;
    name: string;
    nip: string;
    position: string;
    role: string;
    totalHadir: number;
    totalIzin: number;
    totalSakit: number;
    totalAlpa: number;
    persentase: string;
}

export default function SchoolReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [reportData, setReportData] = useState<ReportRowData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    useEffect(() => {
        if (!user || isUserLoading || !firestore) return;

        const fetchAndCalculateReportData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const monthStart = startOfMonth(currentMonth);
                const monthEnd = endOfMonth(currentMonth);

                const workingDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
                    .filter(day => getDay(day) > 0 && getDay(day) < 6).length;

                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
                const usersSnapshot = await getDocs(usersQuery);

                if (usersSnapshot.empty) {
                    setReportData([]);
                    setIsLoading(false);
                    return;
                }

                let reports: Omit<ReportRowData, 'no' | 'totalAlpa' | 'persentase'>[] = [];

                const promises = usersSnapshot.docs.map(async (userDoc) => {
                    const userData = userDoc.data();
                    const userId = userDoc.id;

                    const attendanceQuery = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('checkInTime', '>=', monthStart), where('checkInTime', '<=', monthEnd));
                    const leaveQuery = query(collection(firestore, 'users', userId, 'leaveRequests'), where('status', '==', 'approved'));
                    
                    const [attendanceSnapshot, leaveSnapshot] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

                    const totalHadir = attendanceSnapshot.docs.filter(doc => {
                        const dayOfWeek = getDay(doc.data().checkInTime.toDate());
                        return dayOfWeek > 0 && dayOfWeek < 6;
                    }).length;

                    let totalIzin = 0;
                    let totalSakit = 0;
                    leaveSnapshot.forEach(doc => {
                        const leave = doc.data();
                        eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                             if (day >= monthStart && day <= monthEnd && getDay(day) > 0 && getDay(day) < 6) {
                                if (leave.type === 'Izin') totalIzin++;
                                else if (leave.type === 'Sakit') totalSakit++;
                            }
                        });
                    });
                    
                    reports.push({
                        uid: userId,
                        name: userData.name || 'Nama Tidak Ada',
                        nip: userData.nip || '-', 
                        position: userData.position || '-',
                        role: userData.role || 'tidak diketahui',
                        totalHadir,
                        totalIzin,
                        totalSakit,
                    });
                });

                await Promise.all(promises);
                
                const finalReportData = reports.map((report, index) => {
                    const totalAbsence = report.totalHadir + report.totalIzin + report.totalSakit;
                    const totalAlpa = Math.max(0, workingDaysInMonth - totalAbsence);
                    const persentase = workingDaysInMonth > 0 ? Math.round((report.totalHadir / workingDaysInMonth) * 100) : 0;

                    return {
                        ...report,
                        no: index + 1,
                        totalAlpa,
                        persentase: `${persentase}%`,
                    };
                });

                setReportData(finalReportData);
            } catch (err: any) {
                console.error("Error fetching full report data:", err);
                setError("Gagal mengambil data laporan. Pastikan aturan keamanan Firestore Anda memperbolehkan akses ini.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAndCalculateReportData();
    }, [user, isUserLoading, firestore, currentMonth]);

    const changeMonth = (amount: number) => {
        const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 1);
        setCurrentMonth(newMonth);
    };

    const handleDownload = () => {
        if (user?.role !== 'admin') return;
        const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });
        const dataToExport = filteredReports.map(item => ({
            'No.': item.no,
            'Nama': item.name,
            'NIP': item.nip,
            'Status Kepegawaian': item.position,
            'Peran': item.role.charAt(0).toUpperCase() + item.role.slice(1).replace('_',' '),
            'Hadir': item.totalHadir,
            'Izin': item.totalIzin,
            'Sakit': item.totalSakit,
            'Alpa': item.totalAlpa,
            'Persentase Kehadiran': item.persentase,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Laporan ${monthName}`);
        XLSX.writeFile(workbook, `Laporan Kehadiran Bulanan - ${monthName}.xlsx`);
    };

    const filteredReports = useMemo(() => {
        return reportData
            .filter(report => roleFilter === 'all' || report.role === roleFilter)
            .filter(report => report.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [reportData, roleFilter, searchTerm]);
    
    if (!isUserLoading && !user) {
        return null;
    }
    if (!isUserLoading && user && !['admin', 'kepala_sekolah'].includes(user.role)) {
      return (
           <div className="p-4">
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Akses Ditolak</AlertTitle><AlertDescription>Anda tidak memiliki izin untuk mengakses halaman ini.</AlertDescription></Alert>
          </div>
      );
    }

    return (
        <div className="flex-1 min-w-0 p-2 pt-0 pb-24 md:p-6 md:pt-8">
            <Card>
                <CardHeader>
                    <CardTitle>Laporan Ringkasan Kehadiran</CardTitle>
                    <CardDescription>Ringkasan kehadiran bulanan untuk guru dan pegawai.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="w-36 text-center font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={currentMonth >= startOfMonth(new Date())}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Filter berdasarkan peran" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Peran</SelectItem>
                                    <SelectItem value="guru">Guru</SelectItem>
                                    <SelectItem value="pegawai">Pegawai</SelectItem>
                                    <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input type="search" placeholder="Cari berdasarkan nama..." className="w-full sm:w-[250px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            {user?.role === 'admin' && (
                                <Button onClick={handleDownload} disabled={isLoading || filteredReports.length === 0}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Unduh Excel
                                </Button>
                            )}
                        </div>
                    </div>

                    {error && <Alert variant="destructive" className="mb-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

                    <div className="overflow-x-auto border rounded-md">
                        {isLoading && !error ? (
                            <div className="p-4 space-y-3">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">No</TableHead>
                                        <TableHead>Nama</TableHead>
                                        <TableHead>NIP</TableHead>
                                        <TableHead>Status Kepegawaian</TableHead>
                                        <TableHead className="text-center">Hadir</TableHead>
                                        <TableHead className="text-center">Izin</TableHead>
                                        <TableHead className="text-center">Sakit</TableHead>
                                        <TableHead className="text-center">Alpa</TableHead>
                                        <TableHead className="text-center">Persentase</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!isLoading && filteredReports.length > 0 ? (
                                        filteredReports.map((item, index) => (
                                            <TableRow key={item.uid}>
                                                <TableCell>{index + 1}</TableCell>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell>{item.nip}</TableCell>
                                                <TableCell>{item.position}</TableCell> 
                                                <TableCell className="text-center">{item.totalHadir}</TableCell>
                                                <TableCell className="text-center">{item.totalIzin}</TableCell>
                                                <TableCell className="text-center">{item.totalSakit}</TableCell>
                                                <TableCell className="text-center">{item.totalAlpa}</TableCell>
                                                <TableCell className="text-center font-semibold">{item.persentase}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-24 text-center">{isLoading ? 'Memuat data...' : 'Tidak ada data untuk ditampilkan pada periode ini.'}</TableCell>
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
