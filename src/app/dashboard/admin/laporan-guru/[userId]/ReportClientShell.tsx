'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, startOfMonth, parseISO, isValid } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight, CheckCircle2, XCircle, FileWarning, CalendarClock } from 'lucide-react';

// This component handles all user interaction on the client-side.
export default function ReportClientShell({ 
    userId, 
    initialUserData,
    initialReportData,
    initialMonth,
    initialSchoolConfig
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [userData] = useState(initialUserData);
    const [schoolConfigData] = useState(initialSchoolConfig);
    
    // *** BUG FIX & DATA UNPACKING ***
    // Unpack the reportData object passed from the server
    const [reportDetails] = useState(initialReportData.reportDetails || []);
    const [reportSummary] = useState(initialReportData.summary || {});

    const currentMonth = new Date(initialMonth);

    // *** RE-IMPLEMENTED: Calculation logic for summary and chart, ensuring synchronization ***
    const summaryStats = useMemo(() => {
        const hadir = reportDetails.filter(d => d.status === 'Hadir' || d.status === 'Terlambat').length;
        const sakit = reportDetails.filter(d => d.status === 'Sakit').length;
        const izin = reportDetails.filter(d => d.status === 'Izin').length;
        // Alpa is calculated from details, which we know only includes past days
        const alpa = reportDetails.filter(d => d.status === 'Alpa').length;
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
    
    const safeFormat = (date, formatString) => {
        if (!date) return '-';
        const dateObj = typeof date === 'string' ? parseISO(date) : date;
        return isValid(dateObj) ? format(dateObj, formatString, { locale: id }) : '-';
    }

    const handleDownloadPdf = () => {
        // (PDF download logic remains largely the same, but uses corrected data sources)
        if (!userData) return;
        const doc = new jsPDF();
        // ... PDF Header ...

        const tableBody = reportDetails.map((item, index) => [
            index + 1,
            safeFormat(item.date, 'EEEE, dd MMMM yyyy'),
            safeFormat(item.checkInTime, 'HH:mm:ss'),
            safeFormat(item.checkOutTime, 'HH:mm:ss'),
            item.status,
            item.description,
        ]);

        autoTable(doc, {
            // ... autoTable options ...
            body: tableBody
        });
        
        doc.save(`Laporan Kehadiran - ${userData.name} - ${format(currentMonth, 'MMMM yyyy')}.pdf`);
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* --- RE-IMPLEMENTED SUMMARY & CHART SECTION --- */}
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
                                    <Bar dataKey="Jumlah" fill="#8884d8" />
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
                            <Button variant="outline" size="icon" onClick={() => handleMonthChange(1)} disabled={currentMonth >= startOfMonth(new Date())}><ChevronRight className="h-4 w-4" /></Button>
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
                                {/* *** BUG FIX: Use reportDetails instead of reportData *** */}
                                {reportDetails.length > 0 ? (
                                    reportDetails.map((item, index) => (
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