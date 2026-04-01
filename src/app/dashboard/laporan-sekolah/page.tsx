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
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { calculateAttendanceStats } from '@/lib/attendance';

// Helper to convert image URL to Base64
const toBase64 = async (url: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

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

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData } = useDoc(user, schoolConfigRef);

    useEffect(() => {
        if (!user || isUserLoading || !firestore) return;

        const fetchAndCalculateReportData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const monthStart = startOfMonth(currentMonth);
                const monthEnd = endOfMonth(currentMonth);
                const dateRange = { start: monthStart, end: monthEnd };

                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']));
                const usersSnapshot = await getDocs(usersQuery);

                if (usersSnapshot.empty) {
                    setReportData([]);
                    setIsLoading(false);
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
                        ...stats,
                    };
                });

                const results = await Promise.all(reportPromises);

                const finalReportData = results.map((report, index) => ({ ...report, no: index + 1 }));
                
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
    
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

    const handleDownloadExcel = () => {
        if (user?.role !== 'admin') return;
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
        if (user?.role !== 'admin' || !filteredReports.length) return;
        
        const doc = new jsPDF();
        let finalY = 0;

        // 1. Add Header (Kop Surat)
        if (schoolConfigData?.letterheadUrl) {
            try {
                const base64Image = await toBase64(schoolConfigData.letterheadUrl);
                doc.addImage(base64Image as string, 'PNG', 10, 8, 190, 40);
                finalY = 55; // Initial Y position after header
            } catch (error) {
                console.error("Error adding letterhead image:", error);
                finalY = 15; // Fallback Y position
            }
        } else {
            doc.setFontSize(16).setFont(undefined, 'bold');
            doc.text('Laporan Kehadiran Bulanan', 105, 15, { align: 'center' });
            finalY = 25;
        }

        // 2. Add Title
        doc.setFontSize(12).setFont(undefined, 'normal');
        doc.text(`Periode: ${monthName}`, 105, finalY, { align: 'center' });
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

        autoTable(doc, {
            startY: finalY,
            head: [['No', 'Nama', 'NIP', 'Status', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [34, 197, 94] }, // Green-500
            didDrawPage: (data) => {
                // 4. Add Watermark and Footer to each page
                const totalPages = doc.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);

                    // Watermark
                    doc.saveGraphicsState(); // Save the current graphics state
                    doc.setGState((doc as any).GState({opacity: 0.1})); // This is a known way for jspdf, might need casting
                    doc.setFontSize(40).setTextColor(150);
                    doc.text('E-SPENLI OFFICIAL', doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() / 2, {
                        angle: -45,
                        align: 'center'
                    });
                    doc.restoreGraphicsState(); // Restore the graphics state

                    // Footer
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.setLineWidth(0.5);
                    doc.line(14, pageHeight - 15, 196, pageHeight - 15);
                    doc.setFontSize(8).setTextColor(100);
                    doc.text(`Dokumen ini merupakan laporan absensi resmi yang dihasilkan oleh sistem E-SPENLI.`, 14, pageHeight - 10);
                    doc.text(`Halaman ${i} dari ${totalPages}`, 196, pageHeight - 10, { align: 'right' });
                }
            }
        });

        // 5. Add Signature block
        finalY = (doc as any).lastAutoTable.finalY + 15;
        const pageWidth = doc.internal.pageSize.getWidth();

        if (schoolConfigData?.principalName) {
            const signatureBlockX = pageWidth - 70;
            doc.setFontSize(10).setTextColor(0);
            doc.text('Mengetahui,', signatureBlockX, finalY);
            doc.text('Kepala Sekolah', signatureBlockX, finalY + 5);

            if (schoolConfigData.signatureUrl) {
                 try {
                    const base64Image = await toBase64(schoolConfigData.signatureUrl);
                    doc.addImage(base64Image as string, 'PNG', signatureBlockX, finalY + 7, 40, 20);
                } catch (error) {
                    console.error("Error adding signature image:", error);
                }
            }
            
            doc.setFont(undefined, 'bold');
            doc.text(schoolConfigData.principalName, signatureBlockX, finalY + 32);
            doc.setFont(undefined, 'normal');
            doc.text(`NIP: ${schoolConfigData.principalNip || '-'}`, signatureBlockX, finalY + 37);
        }

        doc.save(`Laporan Kehadiran Resmi - ${monthName}.pdf`);
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
                    <CardDescription>Ringkasan kehadiran bulanan untuk guru dan pegawai.</CardDescription>
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
