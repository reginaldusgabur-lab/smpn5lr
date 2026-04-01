'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, AlertCircle, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import * as XLSX from 'xlsx';
import { jsPDF, GState } from "jspdf";
import autoTable from 'jspdf-autotable';
import { calculateAttendanceStats } from '@/lib/attendance';

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
    sequenceNumber: number | null;
}

export default function SchoolReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [reportData, setReportData] = useState<ReportRowData[]>([]);
    const [isReportLoading, setIsReportLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, loading: isConfigLoading } = useDoc(user, schoolConfigRef);

    useEffect(() => {
        if (!user || isUserLoading || !firestore) return;

        const fetchAndCalculateReportData = async () => {
            setIsReportLoading(true);
            setError(null);

            try {
                const monthStart = startOfMonth(currentMonth);
                const monthEnd = endOfMonth(currentMonth);
                const dateRange = { start: monthStart, end: monthEnd };

                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
                const usersSnapshot = await getDocs(usersQuery);

                if (usersSnapshot.empty) {
                    setReportData([]);
                    setIsReportLoading(false);
                    return;
                }
                
                const reportPromises = usersSnapshot.docs.map(async (userDoc) => {
                    const userData = userDoc.data();
                    const userId = userDoc.id;

                    const stats = await calculateAttendanceStats(firestore, userId, dateRange);

                    return {
                        uid: userId,
                        name: userData.name || 'Nama Tidak Ada',
                        nip: userData.nip || '-', 
                        position: userData.position || '-',
                        role: userData.role || 'tidak diketahui',
                        sequenceNumber: userData.sequenceNumber || null,
                        ...stats,
                    };
                });

                const results = await Promise.all(reportPromises);
                
                results.sort((a, b) => {
                    const seqA = a.sequenceNumber;
                    const seqB = b.sequenceNumber;

                    const hasSeqA = seqA !== null && seqA !== undefined;
                    const hasSeqB = seqB !== null && seqB !== undefined;

                    if (hasSeqA && !hasSeqB) return -1;
                    if (!hasSeqA && hasSeqB) return 1;
                    if (!hasSeqA && !hasSeqB) {
                        return a.name.localeCompare(b.name);
                    }
                    
                    if (seqA! < seqB!) return -1;
                    if (seqA! > seqB!) return 1;

                    return a.name.localeCompare(b.name);
                });

                const finalReportData = results.map((report, index) => ({ ...report, no: index + 1 }));
                
                setReportData(finalReportData);

            } catch (err: any) {
                console.error("Error fetching full report data:", err);
                setError("Gagal mengambil data laporan. Pastikan aturan keamanan Firestore Anda memperbolehkan akses ini.");
            } finally {
                setIsReportLoading(false);
            }
        };

        fetchAndCalculateReportData();
    }, [user, isUserLoading, firestore, currentMonth]);

    const changeMonth = (amount: number) => {
        const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 1);
        setCurrentMonth(newMonth);
    };
    
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

    const handleDownloadExcel = () => {
        if (user?.role !== 'admin' || !filteredReports.length) return;
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

    const handleDownloadPdf = async () => {
        if (user?.role !== 'admin' || !filteredReports.length || !schoolConfigData) return;
        
        const doc = new jsPDF();
        let finalY = 15;
        const pageWidth = doc.internal.pageSize.getWidth();
        const centerX = pageWidth / 2;
        const margin = 14;

        const getConfig = (key: string, fallback: string) => schoolConfigData?.[key] || fallback;

        // 1. Add Header (Kop Surat)
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        
        const headerText1 = getConfig('governmentAgency', 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase();
        doc.text(headerText1, centerX, finalY, { align: 'center' });
        finalY += 6;

        const headerText2 = getConfig('educationAgency', 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA').toUpperCase();
        doc.text(headerText2, centerX, finalY, { align: 'center' });
        finalY += 6;
        
        const headerText3 = getConfig('schoolName', 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase();
        doc.setFontSize(14);
        doc.text(headerText3, centerX, finalY, { align: 'center' });
        finalY += 6;
        
        doc.setFont('times', 'normal');
        doc.setFontSize(10);
        const address = getConfig('address', 'Alamat Sekolah Belum Diatur');
        doc.text(`Alamat: ${address}`, centerX, finalY, { align: 'center' });
        finalY += 4;
        
        const lineY = finalY; // Store Y position for the line
        finalY += 8;

        // 2. Add Title
        doc.setFontSize(12);
        doc.setFont('times', 'bold');
        doc.text(`LAPORAN KEHADIRAN BULANAN`, centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.setFont('times', 'normal');
        doc.text(`Periode: ${monthName}`, centerX, finalY, { align: 'center' });
        finalY += 10;

        // 3. Add Table
        const tableData = filteredReports.map(item => [
            item.no,
            item.name,
            item.nip,
            item.position,
            item.totalHadir,
            item.totalIzin,
            item.totalSakit,
            item.totalAlpa,
            item.persentase,
        ]);

        let tableWidth = 0;
        let tableStartX = 0;

        autoTable(doc, {
            startY: finalY,
            head: [['No', 'Nama', 'NIP', 'Status', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 9, font: 'times' },
            headStyles: { fillColor: [45, 115, 174], textColor: 255, fontStyle: 'bold' }, // #2d73ae
            didDrawPage: (data) => {
                if (data.pageNumber === 1) {
                    tableWidth = data.table.width;
                    tableStartX = data.table.pageStartX;
                }

                const pageHeight = doc.internal.pageSize.getHeight();
                const pageNumber = data.pageNumber;
                const pageCount = (doc as any).internal.getNumberOfPages();

                // Watermark
                doc.saveGraphicsState();
                doc.setGState(new (doc as any).GState({ opacity: 0.08 })); // Lower opacity
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(80);
                doc.setTextColor(150);
                doc.text('E-SPENLI', centerX, pageHeight / 2, { angle: -45, align: 'center' });
                doc.restoreGraphicsState();

                // Footer
                doc.setFont('times', 'normal');
                doc.setFontSize(8).setTextColor(100);
                const footerY = pageHeight - 10;
                doc.setLineWidth(0.5);
                doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
                doc.text('Dokumen ini adalah laporan absensi resmi yang dihasilkan secara otomatis oleh aplikasi E-SPENLI.', margin, footerY);
                doc.text(`Halaman ${pageNumber} dari ${pageCount}`, pageWidth - margin, footerY, { align: 'right' });
            }
        });
        
        // Draw the header line on the first page after autoTable has finished
        doc.setPage(1);
        doc.setLineWidth(0.7); // Set line width
        doc.setDrawColor(150, 150, 150); // Set line to a soft gray color

        if (tableWidth > 0 && typeof tableStartX === 'number') {
             doc.line(tableStartX, lineY, tableStartX + tableWidth, lineY);
        } else {
            // Fallback if table dimensions are not available for some reason
            doc.line(margin, lineY, pageWidth - margin, lineY);
        }
        doc.setDrawColor(0, 0, 0); // Reset draw color to black

        // 5. Add Signature block
        let lastY = (doc as any).lastAutoTable.finalY;
        const pageHeight = doc.internal.pageSize.getHeight();
        const totalPages = (doc as any).internal.getNumberOfPages();

        if (lastY + 50 > pageHeight - 20) {
            doc.addPage();
            lastY = 20;
        } else {
            lastY += 15;
        }

        const signatureBlockX = pageWidth - 80;
        const reportCity = getConfig('reportCity', 'Kota');
        const principalName = getConfig('headmasterName', '[Nama Kepala Sekolah]');
        
        const principalUser = reportData.find(user => user.role === 'kepala_sekolah');
        const principalNip = principalUser ? principalUser.nip : getConfig('nipKepalaSekolah', '[NIP tidak ditemukan]');

        doc.setPage(totalPages);
        doc.setFontSize(10).setFont('times', 'normal');
        doc.text(`${reportCity}, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureBlockX, lastY);
        lastY += 6;
        doc.text('Mengetahui,', signatureBlockX, lastY);
        lastY += 6;
        doc.text('Kepala Sekolah', signatureBlockX, lastY);
        lastY += 25; // Space for signature
        doc.setFont('times', 'bold');
        doc.text(principalName, signatureBlockX, lastY);
        doc.setFont('times', 'normal');
        lastY += 5;
        doc.text(`NIP: ${principalNip}`, signatureBlockX, lastY);

        doc.save(`Laporan Kehadiran Resmi - ${monthName}.pdf`);
    };

    const filteredReports = useMemo(() => {
        return reportData
            .filter(report => roleFilter === 'all' || report.role === roleFilter)
            .filter(report => report.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [reportData, roleFilter, searchTerm]);
    
    const isLoading = isReportLoading || isConfigLoading;

    if (isUserLoading) {
        return <div className="p-6">Memuat data pengguna...</div>;
    }

    if (!user) {
        return null;
    }

    if (!['admin', 'kepala_sekolah'].includes(user.role)) {
      return (
           <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Akses Ditolak</AlertTitle>
                <AlertDescription>Anda tidak memiliki izin untuk mengakses halaman ini.</AlertDescription>
              </Alert>
          </div>
      );
    }


    return (
        <div className="flex-1 min-w-0 p-2 pt-0 pb-24 md:p-6 md:pt-8">
            <Card>
                <CardHeader>
                    <CardTitle>Laporan Ringkasan Kehadiran</CardTitle>
                    <CardDescription>Ringkasan kehadiran bulanan untuk seluruh personil sekolah.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="w-36 text-center font-semibold">{monthName}</span>
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
                                <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={isLoading || filteredReports.length === 0}><Download className="mr-2 h-4 w-4" />Unduh Laporan</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleDownloadExcel}><FileSpreadsheet className="mr-2 h-4 w-4"/>Unduh Excel</DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadPdf}><FileText className="mr-2 h-4 w-4"/>Unduh PDF</DropdownMenuItem>
                                </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="overflow-x-auto border rounded-md">
                        {isLoading ? (
                            <div className="p-4 space-y-3">
                            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
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
                                    {filteredReports.length > 0 ? (
                                        filteredReports.map((item) => (
                                            <TableRow key={item.uid}>
                                                <TableCell>{item.no}</TableCell>
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
                                            <TableCell colSpan={9} className="h-24 text-center">{isReportLoading ? 'Memuat data...' : 'Tidak ada data untuk ditampilkan pada periode ini.'}</TableCell>
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
