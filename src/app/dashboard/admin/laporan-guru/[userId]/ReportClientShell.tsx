'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, startOfMonth, parseISO, isValid, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, CheckCircle2, XCircle, FileWarning, CalendarClock } from 'lucide-react';

// --- Type Definitions for TypeScript ---
interface ReportDetail {
  id: string;
  date: string; // ISO string from server
  checkInTime: string | null; // ISO string from server
  checkOutTime: string | null; // ISO string from server
  status: string;
  description: string;
}

interface UserData {
  name?: string;
  // Add other user properties if needed
}

interface ClientShellProps {
  userId: string;
  initialUserData: UserData;
  initialReportData: ReportDetail[];
  initialMonth: string; // ISO string from server
  initialSchoolConfig: any; // Use 'any' for now if structure is complex or varies
}

// This component handles all user interaction on the client-side.
export default function ReportClientShell({ 
    userId, 
    initialUserData,
    initialReportData,
    initialMonth,
}: ClientShellProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [userData] = useState<UserData>(initialUserData);
    const [reportDetails] = useState<ReportDetail[]>(initialReportData || []);

    // Ensure currentMonth is a valid Date object, defaulting to now if initial is invalid
    const parsedInitialMonth = parseISO(initialMonth);
    const [currentMonth, setCurrentMonth] = useState(isValid(parsedInitialMonth) ? parsedInitialMonth : new Date());

    // Calculation logic for summary and chart
    const summaryStats = useMemo(() => {
        const hadir = reportDetails.filter((d: ReportDetail) => d.status === 'Hadir' || d.status === 'Terlambat').length;
        const sakit = reportDetails.filter((d: ReportDetail) => d.status === 'Sakit').length;
        const izin = reportDetails.filter((d: ReportDetail) => d.status === 'Izin' || d.status === 'Dinas').length;
        const alpa = reportDetails.filter((d: ReportDetail) => d.status === 'Alpa').length;
        return { hadir, sakit, izin, alpa };
    }, [reportDetails]);

    const chartData = [
        { name: 'Hadir', Jumlah: summaryStats.hadir, fill: '#22c55e' },
        { name: 'Sakit', Jumlah: summaryStats.sakit, fill: '#f97316' },
        { name: 'Izin', Jumlah: summaryStats.izin, fill: '#3b82f6' },
        { name: 'Alpa', Jumlah: summaryStats.alpa, fill: '#ef4444' },
    ];

    const handleMonthChange = (amount: number) => {
        const newMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 15);
        const newMonthString = format(newMonthDate, 'yyyy-MM');
        const params = new URLSearchParams(searchParams.toString());
        params.set('month', newMonthString);
        router.push(`${pathname}?${params.toString()}`);
    };
    
    const safeFormat = (date: string | Date | null, formatString: string): string => {
        if (!date) return '-';
        const dateObj = typeof date === 'string' ? parseISO(date) : date;
        return isValid(dateObj) ? format(dateObj, formatString, { locale: id }) : '-';
    }

    const handleDownloadPdf = () => {
        if (!userData) return;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text('Laporan Kehadiran Bulanan', 14, 20);

        doc.setFontSize(10);
        doc.text(`Nama: ${userData.name || '-'}`, 14, 30);
        doc.text(`Bulan: ${format(currentMonth, 'MMMM yyyy', { locale: id })}`, 14, 35);

        const tableBody = reportDetails.map((item: ReportDetail, index: number) => [
            index + 1,
            safeFormat(item.date, 'EEEE, dd MMMM yyyy'),
            safeFormat(item.checkInTime, 'HH:mm:ss'),
            safeFormat(item.checkOutTime, 'HH:mm:ss'),
            item.status,
            item.description,
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [34, 197, 94] },
        });
        
        doc.save(`Laporan Kehadiran - ${userData.name} - ${format(currentMonth, 'MMMM yyyy')}.pdf`);
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Ringkasan Laporan Bulan {format(currentMonth, 'MMMM yyyy', { locale: id })}</CardTitle>
                    <CardDescription>Grafik ringkasan kehadiran untuk {userData?.name || 'Pengguna'}.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Bar dataKey="Jumlah" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Card className="flex flex-col justify-center items-center text-center">
                                <CardHeader><CardTitle className="text-3xl">{summaryStats.hadir}</CardTitle></CardHeader>
                                <CardContent><p className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="text-green-500"/> Hadir</p></CardContent>
                            </Card>
                             <Card className="flex flex-col justify-center items-center text-center">
                                <CardHeader><CardTitle className="text-3xl">{summaryStats.alpa}</CardTitle></CardHeader>
                                <CardContent><p className="text-sm text-muted-foreground flex items-center gap-2"><XCircle className="text-red-500"/> Alpa</p></CardContent>
                            </Card>
                             <Card className="flex flex-col justify-center items-center text-center">
                                <CardHeader><CardTitle className="text-3xl">{summaryStats.izin}</CardTitle></CardHeader>
                                <CardContent><p className="text-sm text-muted-foreground flex items-center gap-2"><FileWarning className="text-blue-500"/> Izin</p></CardContent>
                            </Card>
                             <Card className="flex flex-col justify-center items-center text-center">
                                <CardHeader><CardTitle className="text-3xl">{summaryStats.sakit}</CardTitle></CardHeader>
                                <CardContent><p className="text-sm text-muted-foreground flex items-center gap-2"><CalendarClock className="text-orange-500"/> Sakit</p></CardContent>
                            </Card>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Detail Laporan Harian</CardTitle>
                    <CardDescription>Rincian data kehadiran harian yang terekam oleh sistem.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => handleMonthChange(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="w-36 text-center font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)} disabled={currentMonth >= endOfMonth(new Date())}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                        <Button onClick={handleDownloadPdf} disabled={!userData}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh Laporan PDF
                        </Button>
                    </div>
                    <div className="overflow-x-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[5%]">No</TableHead>
                                    <TableHead className="w-[20%]">Tanggal</TableHead>
                                    <TableHead className="w-[15%]">Jam Masuk</TableHead>
                                    <TableHead className="w-[15%]">Jam Pulang</TableHead>
                                    <TableHead className="w-[15%]">Status</TableHead>
                                    <TableHead>Keterangan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportDetails.length > 0 ? (
                                    reportDetails.map((item: ReportDetail, index: number) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{safeFormat(item.date, 'EEEE, dd MMMM yyyy')}</TableCell>
                                            <TableCell>{safeFormat(item.checkInTime, 'HH:mm:ss')}</TableCell>
                                            <TableCell>{safeFormat(item.checkOutTime, 'HH:mm:ss')}</TableCell>
                                            <TableCell>{item.status}</TableCell>
                                            <TableCell>{item.description}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            Tidak ada data kehadiran untuk ditampilkan pada periode ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}