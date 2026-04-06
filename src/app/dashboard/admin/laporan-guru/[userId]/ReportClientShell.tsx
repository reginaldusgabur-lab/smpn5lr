'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';

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

    // The state is initialized with the server-rendered data
    const [userData] = useState(initialUserData);
    const [reportData] = useState(initialReportData);
    const [schoolConfigData] = useState(initialSchoolConfig);
    
    // The date object is recreated on the client from the ISO string
    const currentMonth = new Date(initialMonth);

    // Function to handle changing the month
    const handleMonthChange = (amount: number) => {
        const newMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 15);
        const newMonthString = format(newMonthDate, 'yyyy-MM');
        
        // Create a new URLSearchParams object
        const params = new URLSearchParams(searchParams.toString());
        params.set('month', newMonthString);
        
        // Navigate to the new URL. Next.js will re-render the Server Component on the server.
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleDownloadPdf = () => {
        if (!userData) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const centerX = pageWidth / 2;
        const margin = 14;
        let finalY = 20;

        const getConfig = (key: string, fallback: string) => schoolConfigData?.[key] || fallback;

        doc.setFont('times', 'bold').setFontSize(14);
        doc.text(getConfig('governmentAgency', 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase(), centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.text(getConfig('educationAgency', 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA').toUpperCase(), centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.text(getConfig('schoolName', 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase(), centerX, finalY, { align: 'center' });
        finalY += 5;
        doc.setFont('times', 'normal').setFontSize(10).text(`Alamat: ${getConfig('address', 'Alamat Sekolah')}`, centerX, finalY, { align: 'center' });
        finalY += 4;
        doc.setLineWidth(0.5).line(margin, finalY, pageWidth - margin, finalY);
        finalY += 8;

        doc.setFont('times', 'bold').setFontSize(12).text('LAPORAN KEHADIRAN', centerX, finalY, { align: 'center' });
        finalY += 5;
        doc.setFont('times', 'normal').text(`Periode : Bulan ${format(currentMonth, 'MMMM yyyy', { locale: id })}`, centerX, finalY, { align: 'center' });
        finalY += 12;
        
        doc.text('Nama', margin, finalY);
        doc.text(`: ${userData.name}`, margin + 40, finalY);
        finalY += 6;
        doc.text('NIP', margin, finalY);
        doc.text(`: ${userData.nip || '-'}`, margin + 40, finalY);
        finalY += 6;
        doc.text('Status Kepegawaian', margin, finalY);
        doc.text(`: ${userData.position || '-'}`, margin + 40, finalY);
        finalY += 10;

        const tableData = reportData.map((item, index) => [
            index + 1,
            item.dateString,
            item.checkIn,
            item.checkOut,
            item.status,
            item.description,
        ]);

        autoTable(doc, {
            startY: finalY,
            head: [['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 9, font: 'times', cellPadding: 2 },
            headStyles: { fillColor: [45, 115, 174], textColor: 255, fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 8 },
                1: { cellWidth: 35 },
                2: { halign: 'center', cellWidth: 20 },
                3: { halign: 'center', cellWidth: 20 },
                4: { halign: 'center', cellWidth: 20 },
            }
        });
        
        doc.save(`Laporan Kehadiran - ${userData.name} - ${format(currentMonth, 'MMMM yyyy')}.pdf`);
    };

    return (
        <div className="p-4 md:p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Detail Laporan Kehadiran</CardTitle>
                    <CardDescription>Laporan kehadiran harian untuk {userData?.name || 'Pengguna'}.</CardDescription>
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
                                {reportData.length > 0 ? (
                                    reportData.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{item.dateString}</TableCell>
                                            <TableCell>{item.checkIn}</TableCell>
                                            <TableCell>{item.checkOut}</TableCell>
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