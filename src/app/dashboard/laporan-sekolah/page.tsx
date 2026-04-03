'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, AlertCircle, FileText, FileSpreadsheet, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import * as XLSX from 'xlsx';
import { jsPDF } from "jspdf";
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
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', message: string} | null>(null);

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
        if (user?.role !== 'admin' || !filteredReports.length || !schoolConfigData) return;

        const getConfig = (key: string, fallback: string) => schoolConfigData?.[key] || fallback;
        const principalUser = reportData.find(user => user.role === 'kepala_sekolah');
        const principalNip = principalUser ? principalUser.nip : getConfig('nipKepalaSekolah', '[NIP tidak ditemukan]');
        const principalName = getConfig('headmasterName', '[Nama Kepala Sekolah]');
        const reportCity = getConfig('reportCity', 'Kota');
        const numberOfColumns = 9;

        let data = [];
        data.push([getConfig('governmentAgency', 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase()]);
        data.push([getConfig('educationAgency', 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA').toUpperCase()]);
        data.push([getConfig('schoolName', 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase()]);
        data.push([`Alamat: ${getConfig('address', 'Alamat Sekolah Belum Diatur')}`]);
        data.push([]);
        data.push(['LAPORAN KEHADIRAN BULANAN']);
        data.push([`Periode: ${monthName}`]);
        data.push([]);

        const tableHeader = ['No', 'Nama', 'NIP', 'Status Kepegawaian', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persentase'];
        data.push(tableHeader);

        filteredReports.forEach(item => {
            data.push([
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
        });

        data.push([]);
        data.push([]);

        const emptyCells = Array(numberOfColumns - 3).fill('');
        data.push([...emptyCells, `${reportCity}, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`]);
        data.push([...emptyCells, 'Mengetahui,']);
        data.push([...emptyCells, 'Kepala Sekolah']);
        data.push([], [], []);
        data.push([...emptyCells, principalName]);
        data.push([...emptyCells, `NIP: ${principalNip}`]);

        const worksheet = XLSX.utils.aoa_to_sheet(data, { cellStyles: true });

        worksheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: numberOfColumns - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: numberOfColumns - 1 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: numberOfColumns - 1 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: numberOfColumns - 1 } },
            { s: { r: 5, c: 0 }, e: { r: 5, c: numberOfColumns - 1 } },
            { s: { r: 6, c: 0 }, e: { r: 6, c: numberOfColumns - 1 } },
        ];
        
        const headerStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } };
        const tableHeaderStyle = { font: { bold: true }, alignment: { horizontal: 'center' } };
        const centerAlign = { alignment: { horizontal: 'center' } };

        for (let C = 0; C < numberOfColumns; C++) {
            if (worksheet[XLSX.utils.encode_cell({r:0,c:C})]) worksheet[XLSX.utils.encode_cell({r:0,c:C})].s = headerStyle;
            if (worksheet[XLSX.utils.encode_cell({r:1,c:C})]) worksheet[XLSX.utils.encode_cell({r:1,c:C})].s = headerStyle;
            if (worksheet[XLSX.utils.encode_cell({r:2,c:C})]) worksheet[XLSX.utils.encode_cell({r:2,c:C})].s = {...headerStyle, font: { bold: true, sz: 14 } };
            if (worksheet[XLSX.utils.encode_cell({r:3,c:C})]) worksheet[XLSX.utils.encode_cell({r:3,c:C})].s = { alignment: { horizontal: 'center' } };
            if (worksheet[XLSX.utils.encode_cell({r:5,c:C})]) worksheet[XLSX.utils.encode_cell({r:5,c:C})].s = headerStyle;
            if (worksheet[XLSX.utils.encode_cell({r:6,c:C})]) worksheet[XLSX.utils.encode_cell({r:6,c:C})].s = headerStyle;
            const tableHeaderCell = XLSX.utils.encode_cell({r:8, c:C});
            if (worksheet[tableHeaderCell]) worksheet[tableHeaderCell].s = tableHeaderStyle;

             for (let R = 9; R < 9 + filteredReports.length; R++) {
                if(C === 0 || C > 3) { 
                    const cell = XLSX.utils.encode_cell({r:R, c:C});
                     if (worksheet[cell]) worksheet[cell].s = centerAlign;
                }
            }
        }
        
        worksheet['!cols'] = [
            { wch: 5 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 12 },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Laporan ${monthName}`);
        XLSX.writeFile(workbook, `Laporan Resmi Kehadiran - ${monthName}.xlsx`);
    };

    const handleDownloadPdf = async () => {
        if (user?.role !== 'admin' || !filteredReports.length || !schoolConfigData) return;
        
        const doc = new jsPDF();
        let finalY = 15;
        const pageWidth = doc.internal.pageSize.getWidth();
        const centerX = pageWidth / 2;
        const margin = 14;

        const getConfig = (key: string, fallback: string) => schoolConfigData?.[key] || fallback;

        doc.setFont('times', 'bold').setFontSize(14);
        doc.text(getConfig('governmentAgency', 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase(), centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.text(getConfig('educationAgency', 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA').toUpperCase(), centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.setFontSize(14).text(getConfig('schoolName', 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase(), centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.setFont('times', 'normal').setFontSize(10).text(`Alamat: ${getConfig('address', 'Alamat Sekolah Belum Diatur')}`, centerX, finalY, { align: 'center' });
        finalY += 4;
        const lineY = finalY; 
        finalY += 8;

        doc.setFontSize(12).setFont('times', 'bold').text(`LAPORAN KEHADIRAN BULANAN`, centerX, finalY, { align: 'center' });
        finalY += 6;
        doc.setFont('times', 'normal').text(`Periode: ${monthName}`, centerX, finalY, { align: 'center' });
        finalY += 10;

        const tableData = filteredReports.map(item => [item.no, item.name, item.nip, item.position, item.totalHadir, item.totalIzin, item.totalSakit, item.totalAlpa, item.persentase]);

        let tableWidth = 0, tableStartX = 0;

        autoTable(doc, {
            startY: finalY,
            head: [['No', 'Nama', 'NIP', 'Status', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 9, font: 'times' },
            headStyles: { fillColor: [45, 115, 174], textColor: 255, fontStyle: 'bold' },
            didDrawPage: (data) => {
                if (data.pageNumber === 1) { tableWidth = data.table.width; tableStartX = data.table.pageStartX; }
                const pageHeight = doc.internal.pageSize.getHeight();
                doc.setFont('times', 'normal').setFontSize(8).setTextColor(100);
                const footerY = pageHeight - 10;
                doc.setLineWidth(0.5).line(margin, footerY - 5, pageWidth - margin, footerY - 5);
                doc.text('Dokumen ini adalah laporan absensi resmi yang dihasilkan secara otomatis oleh aplikasi E-SPENLI.', margin, footerY);
                doc.text(`Halaman ${data.pageNumber} dari ${(doc as any).internal.getNumberOfPages()}`, pageWidth - margin, footerY, { align: 'right' });
            }
        });
        
        doc.setPage(1);
        doc.setLineWidth(0.7).setDrawColor(150, 150, 150);
        if (tableWidth > 0 && typeof tableStartX === 'number') doc.line(tableStartX, lineY, tableStartX + tableWidth, lineY);
        else doc.line(margin, lineY, pageWidth - margin, lineY);
        doc.setDrawColor(0, 0, 0);

        let lastY = (doc as any).lastAutoTable.finalY;
        const pageHeight = doc.internal.pageSize.getHeight();
        const totalPages = (doc as any).internal.getNumberOfPages();
        if (lastY + 50 > pageHeight - 20) { doc.addPage(); lastY = 20; } else { lastY += 15; }

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
        lastY += 25;
        doc.setFont('times', 'bold').text(principalName, signatureBlockX, lastY);
        lastY += 5;
        doc.setFont('times', 'normal').text(`NIP: ${principalNip}`, signatureBlockX, lastY);

        doc.save(`Laporan Kehadiran Resmi - ${monthName}.pdf`);
    };
    
    const handleSyncToSheet = async () => {
        setIsSyncing(true);
        setSyncMessage(null);
        try {
            const response = await fetch('/api/sync-to-sheet', { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Gagal melakukan sinkronisasi.');
            setSyncMessage({ type: 'success', message: 'Sinkronisasi ke Google Sheets berhasil! Data sedang diproses di latar belakang.' });
        } catch (err: any) {
            console.error("Sync to sheet error:", err);
            setSyncMessage({ type: 'error', message: `Error: ${err.message}` });
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSyncMessage(null), 7000);
        }
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
                                    <Button><Download className="mr-2 h-4 w-4" />Opsi Lanjutan</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleDownloadExcel}><FileSpreadsheet className="mr-2 h-4 w-4"/>Unduh Excel</DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadPdf}><FileText className="mr-2 h-4 w-4"/>Unduh PDF</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleSyncToSheet} disabled={isSyncing}>
                                        {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4"/>}
                                        Sinkronkan & Cadangkan
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    {syncMessage && (
                        <Alert className="mb-4" variant={syncMessage.type === 'error' ? 'destructive' : 'default'}>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{syncMessage.type === 'error' ? 'Sinkronisasi Gagal' : 'Proses Sinkronisasi Dimulai'}</AlertTitle>
                            <AlertDescription>{syncMessage.message}</AlertDescription>
                        </Alert>
                    )}

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
