'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ChevronLeft, ChevronRight, Search, Download, Filter, Eye, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { calculateAttendanceStats, fetchUserMonthlyReportData } from '@/lib/attendance';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';
import { parseISO, isValid } from 'date-fns';

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
    const { toast } = useToast();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [reportData, setReportData] = useState<ReportRowData[]>([]);
    const [isReportLoading, setIsReportLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [exportingUserId, setExportingUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData } = useDoc(user, schoolConfigRef);

    useEffect(() => {
        if (isUserLoading || !user || !firestore) return;
        
        let isMounted = true;
        const loadData = async () => {
            setIsReportLoading(true);
            setError(null);
            try {
                const usersQuery = query(
                    collection(firestore, 'users'), 
                    where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']),
                    where('status', '==', 'Aktif')
                );
                const usersSnapshot = await getDocs(usersQuery);
                
                const reportPromises = usersSnapshot.docs.map(async (userDoc) => {
                    const stats = await calculateAttendanceStats(firestore, userDoc.id, { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
                    const userData = userDoc.data();
                    return {
                        uid: userDoc.id,
                        name: userData.name || '',
                        nip: userData.nip || '-',
                        position: userData.position || '-',
                        role: userData.role || '',
                        sequenceNumber: userData.sequenceNumber || null,
                        totalHadir: stats.totalHadir,
                        totalIzin: stats.totalIzin,
                        totalSakit: stats.totalSakit,
                        totalAlpa: stats.totalAlpa,
                        persentase: stats.persentase,
                    };
                });

                const results = await Promise.all(reportPromises);
                results.sort((a, b) => (a.sequenceNumber ?? 999) - (b.sequenceNumber ?? 999));

                if (isMounted) setReportData(results.map((r, i) => ({ ...r, no: i + 1 })));
            } catch (err) { 
                console.error("Load report error:", err);
                if (isMounted) setError("Gagal memuat data laporan."); 
            }
            finally { if (isMounted) setIsReportLoading(false); }
        };
        loadData();
        return () => { isMounted = false; };
    }, [user, isUserLoading, firestore, currentMonth]);

    const filteredReports = useMemo(() => reportData.filter(r => (roleFilter === 'all' || r.role === roleFilter) && r.name.toLowerCase().includes(searchTerm.toLowerCase())), [reportData, roleFilter, searchTerm]);
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

    const safeFormat = (dateInput: any, formatString: string): string => {
        if (!dateInput) return '-';
        const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
        return isValid(date) ? format(date, formatString, { locale: id }) : '-';
    };

    const handleDownloadPersonalPdf = async (targetUser: ReportRowData) => {
        if (isExporting || exportingUserId) return;
        setExportingUserId(targetUser.uid);
        setIsExporting(true);

        try {
            const detailData = await fetchUserMonthlyReportData(firestore, targetUser.uid, currentMonth, schoolConfigData || {});
            
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const centerX = pageWidth / 2;
            const margin = 14;
            let currentY = 20;

            const config = schoolConfigData || ({} as any);

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text((config.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase(), centerX, currentY, { align: 'center' });
            currentY += 7;
            doc.text((config.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA').toUpperCase(), centerX, currentY, { align: 'center' });
            currentY += 7;
            doc.setFontSize(12);
            doc.text((config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase(), centerX, currentY, { align: 'center' });
            currentY += 5;
            doc.setFont('times', 'normal').setFontSize(9);
            doc.text(`Alamat: ${config.address || 'Alamat Sekolah'}`, centerX, currentY, { align: 'center' });
            currentY += 4;
            doc.setLineWidth(0.8).line(margin, currentY, pageWidth - margin, currentY);
            doc.setLineWidth(0.2).line(margin, currentY + 0.8, pageWidth - margin, currentY + 0.8);
            currentY += 15;

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text(`LAPORAN KEHADIRAN INDIVIDU BULAN ${monthName.toUpperCase()}`, centerX, currentY, { align: 'center' });
            if (config.academicYear) {
                currentY += 7;
                doc.text(`TAHUN AJARAN ${config.academicYear.toUpperCase()}`, centerX, currentY, { align: 'center' });
            }
            currentY += 12;

            doc.setFontSize(10).setFont('times', 'normal');
            doc.text(`Nama`, margin, currentY);
            doc.text(`: ${targetUser.name}`, margin + 40, currentY);
            currentY += 6;
            doc.text(`NIP`, margin, currentY);
            doc.text(`: ${targetUser.nip}`, margin + 40, currentY);
            currentY += 6;
            doc.text(`Jabatan / Status`, margin, currentY);
            
            const displayRole = targetUser.role.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const jabStat = `${displayRole} / ${targetUser.position}`;
            doc.text(`: ${jabStat}`, margin + 40, currentY);
            currentY += 10;

            const tableRows = detailData.map((item, index) => [
                index + 1,
                safeFormat(item.date, 'eeee, dd MMMM yyyy'),
                safeFormat(item.checkInTime, 'HH:mm:ss'),
                safeFormat(item.checkOutTime, 'HH:mm:ss'),
                item.status,
                item.description || '-'
            ]);

            autoTable(doc, {
                startY: currentY,
                head: [['No', 'Tanggal', 'Masuk', 'Pulang', 'Status', 'Keterangan']],
                body: tableRows,
                theme: 'grid',
                styles: { font: 'times', fontSize: 9, cellPadding: 3, valign: 'middle', lineWidth: 0.1, lineColor: [150, 150, 150] },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, halign: 'center', fontStyle: 'bold', lineWidth: 0 },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 10 },
                    1: { halign: 'left', cellWidth: 45 },
                    2: { halign: 'center', cellWidth: 22 },
                    3: { halign: 'center', cellWidth: 22 },
                    4: { halign: 'center', cellWidth: 25 },
                }
            });

            let finalTableY = (doc as any).lastAutoTable.finalY;
            if (finalTableY > pageHeight - 65) {
                doc.addPage();
                finalTableY = 20;
            }

            let signY = finalTableY + 15;
            const signatureX = pageWidth - 80;
            doc.setFontSize(10).setFont('times', 'normal');
            doc.text(`${config.reportCity || 'Mando'}, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureX, signY);
            doc.text('Mengetahui,', signatureX, signY + 6);
            doc.text('Kepala Sekolah', signatureX, signY + 12);
            doc.setFont('times', 'bold');
            doc.text(config.headmasterName || 'Lodovikus Jangkar, S.Pd.Gr', signatureX, signY + 38);
            doc.setFont('times', 'normal');
            doc.text(`NIP. ${config.headmasterNip || '198507272011011020'}`, signatureX, signY + 44);

            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setLineWidth(0.2);
                doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
                doc.setFontSize(8).setFont('times', 'italic');
                doc.text('Dokumen absensi ini adalah dokumen resmi yang dibuat secara otomatis oleh aplikasi.', margin, pageHeight - 10);
                doc.setFontSize(9).setFont('times', 'normal');
                doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
            }

            doc.save(`Laporan_Personal_${targetUser.name.replace(/\s+/g, '_')}_${monthName.replace(' ', '_')}.pdf`);
            toast({ title: "Berhasil", description: "Laporan personal berhasil diunduh." });
        } catch (err) {
            console.error("Personal PDF error:", err);
            toast({ variant: "destructive", title: "Gagal", description: "Gagal memproses PDF personal." });
        } finally {
            setIsExporting(false);
            setExportingUserId(null);
        }
    };

    const handleDownloadPdf = async () => {
        if (!filteredReports.length || isExporting) return;
        setIsExporting(true);

        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const centerX = pageWidth / 2;
            const margin = 14;
            let finalY = 20;

            const config = schoolConfigData || ({} as any);

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text((config.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase(), centerX, finalY, { align: 'center' });
            finalY += 7;
            doc.text((config.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA').toUpperCase(), centerX, finalY, { align: 'center' });
            finalY += 7;
            doc.setFontSize(12);
            doc.text((config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase(), centerX, finalY, { align: 'center' });
            finalY += 5;
            doc.setFont('times', 'normal').setFontSize(9);
            doc.text(`Alamat: ${config.address || 'Alamat Sekolah'}`, centerX, finalY, { align: 'center' });
            finalY += 4;
            doc.setLineWidth(0.8).line(margin, finalY, pageWidth - margin, finalY);
            doc.setLineWidth(0.2).line(margin, finalY + 0.8, pageWidth - margin, finalY + 0.8);
            finalY += 15;

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text(`LAPORAN KEHADIRAN BULAN ${monthName.toUpperCase()}`, centerX, finalY, { align: 'center' });
            if (config.academicYear) {
                finalY += 7;
                doc.text(`TAHUN AJARAN ${config.academicYear.toUpperCase()}`, centerX, finalY, { align: 'center' });
            }
            finalY += 12;

            const tableRows = filteredReports.map((item, index) => [
                index + 1,
                item.name,
                item.nip,
                item.position,
                Math.ceil(item.totalHadir),
                item.totalIzin,
                item.totalSakit,
                item.totalAlpa,
                item.persentase
            ]);

            autoTable(doc, {
                startY: finalY,
                head: [['No', 'Nama', 'NIP', 'Status', 'H', 'I', 'S', 'A', 'Persen']],
                body: tableRows,
                theme: 'grid',
                styles: { font: 'times', fontSize: 9, cellPadding: 3, lineWidth: 0.1, lineColor: [150, 150, 150], valign: 'middle' },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, halign: 'center', fontStyle: 'bold', fontSize: 10, lineWidth: 0 },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 10 },
                    1: { halign: 'left', cellWidth: 45 },
                    2: { halign: 'left', cellWidth: 35 },
                    3: { halign: 'center', cellWidth: 20 },
                    4: { halign: 'center', cellWidth: 12 },
                    5: { halign: 'center', cellWidth: 12 },
                    6: { halign: 'center', cellWidth: 12 },
                    7: { halign: 'center', cellWidth: 12 },
                    8: { halign: 'center', cellWidth: 22 },
                }
            });

            let finalTableY = (doc as any).lastAutoTable.finalY;
            if (finalTableY > pageHeight - 65) { doc.addPage(); finalTableY = 20; }

            let currentY = finalTableY + 10;
            doc.setFontSize(9).setFont('times', 'bold');
            doc.text('Catatan:', margin, currentY);
            doc.setFont('times', 'normal');
            doc.text('H = Hadir, I = Izin, S = Sakit, A = Alpa', margin + 15, currentY);

            currentY += 15;
            const signatureX = pageWidth - 80;
            doc.setFontSize(10).setFont('times', 'normal');
            doc.text(`${config.reportCity || 'Mando'}, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureX, currentY);
            doc.text('Mengetahui,', signatureX, currentY + 6);
            doc.text('Kepala Sekolah', signatureX, currentY + 12);
            doc.setFont('times', 'bold');
            doc.text(config.headmasterName || 'Lodovikus Jangkar, S.Pd.Gr', signatureX, currentY + 38);
            doc.setFont('times', 'normal');
            doc.text(`NIP. ${config.headmasterNip || '198507272011011020'}`, signatureX, currentY + 44);

            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setLineWidth(0.2);
                doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
                doc.setFontSize(8).setFont('times', 'italic');
                doc.text('Dokumen absensi ini adalah dokumen resmi yang dibuat secara otomatis oleh aplikasi.', margin, pageHeight - 10);
                doc.setFontSize(9).setFont('times', 'normal');
                doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
            }

            doc.save(`Laporan_Sekolah_${monthName.replace(' ', '_')}.pdf`);
            toast({ title: "Berhasil", description: "Laporan PDF berhasil diunduh." });
        } catch (err) {
            console.error("Export PDF error:", err);
            toast({ variant: "destructive", title: "Gagal", description: "Terjadi kesalahan saat membuat PDF." });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex-1 pt-4 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="px-4 md:px-0">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Laporan Sekolah</h1>
                    <p className="text-muted-foreground mt-1 font-medium">Ringkasan kehadiran bulanan untuk seluruh personil aktif.</p>
                </div>

                <Card className="overflow-hidden border shadow-xl rounded-3xl bg-card border-t-4 border-t-primary">
                    <CardHeader className="bg-primary/10 p-6 border-b border-primary/5 text-primary">
                        <CardTitle className="font-black">REKAPITULASI KEHADIRAN</CardTitle>
                        <CardDescription className="text-primary/70 font-medium">Data kehadiran akumulatif seluruh personil bulan {monthName}.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 min-h-[500px]">
                        <div className="p-6 space-y-6">
                            <div className="flex flex-col items-center justify-center gap-4 py-2">
                                <div className="flex items-center gap-6">
                                    <Button variant="outline" size="icon" className="rounded-full shrink-0 h-10 w-10 border-primary/20 hover:bg-primary/5" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}><ChevronLeft className="h-5 w-5 text-primary" /></Button>
                                    <span className="w-48 text-center font-black text-2xl text-primary tracking-tight">{monthName}</span>
                                    <Button variant="outline" size="icon" className="rounded-full shrink-0 h-10 w-10 border-primary/20 hover:bg-primary/5" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isSameMonth(currentMonth, new Date())}><ChevronRight className="h-5 w-5 text-primary" /></Button>
                                </div>
                                <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent mt-2" />
                            </div>
                            
                            <div className="flex flex-wrap gap-4 items-center justify-between">
                                <div className="flex flex-wrap gap-3 flex-1 min-w-[300px]">
                                    <div className="w-full sm:w-[180px] relative group">
                                        <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary z-10 pointer-events-none transition-colors group-focus-within:text-primary" />
                                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                                            <SelectTrigger className="pl-11 h-12 rounded-2xl bg-muted/40 border-muted-foreground/10 focus:ring-primary focus:bg-background transition-all">
                                                <SelectValue placeholder="Peran" />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                                                <SelectItem value="all" className='rounded-xl'>Semua Peran</SelectItem>
                                                <SelectItem value="guru" className='rounded-xl'>Guru</SelectItem>
                                                <SelectItem value="pegawai" className='rounded-xl'>Pegawai</SelectItem>
                                                <SelectItem value="kepala_sekolah" className='rounded-xl'>Kepala Sekolah</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex-1 relative min-w-[200px] group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-primary z-10 pointer-events-none group-focus-within:scale-110 transition-transform" />
                                        <Input 
                                            placeholder="Cari personil..." 
                                            className="pl-12 h-12 rounded-2xl bg-muted/40 border-muted-foreground/10 focus:ring-primary focus:bg-background transition-all font-bold placeholder:text-muted-foreground/60" 
                                            value={searchTerm} 
                                            onChange={e => setSearchTerm(e.target.value)} 
                                        />
                                    </div>
                                </div>
                                <div className="w-full lg:w-auto">
                                    <Button 
                                        className="w-full lg:w-auto h-12 rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all px-8 bg-primary hover:bg-primary/90 text-sm" 
                                        disabled={isReportLoading || !filteredReports.length || isExporting}
                                        onClick={handleDownloadPdf}
                                    >
                                        {isExporting && !exportingUserId ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <Download className="mr-3 h-5 w-5" />}
                                        <span className="whitespace-nowrap uppercase tracking-wider">Unduh Laporan PDF</span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-muted-foreground/5 shadow-inner">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="border-none">
                                            <TableHead className="w-[60px] text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">No</TableHead>
                                            <TableHead className="font-black text-[10px] uppercase tracking-widest text-muted-foreground">Nama & NIP</TableHead>
                                            <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">H</TableHead>
                                            <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">I</TableHead>
                                            <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">S</TableHead>
                                            <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">A</TableHead>
                                            <TableHead className="text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">%</TableHead>
                                            <TableHead className="w-[80px] text-center font-black text-[10px] uppercase tracking-widest text-muted-foreground">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(isReportLoading || isUserLoading) ? (
                                            [...Array(10)].map((_, i) => (
                                                <TableRow key={i} className="border-muted-foreground/5">
                                                    <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-10 w-48 rounded-xl" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-7 w-14 mx-auto rounded-xl" /></TableCell>
                                                    <TableCell><Skeleton className="h-10 w-10 mx-auto rounded-full" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : filteredReports.length > 0 ? filteredReports.map((item) => (
                                            <TableRow key={item.uid} className="hover:bg-primary/5 transition-colors border-muted-foreground/5">
                                                <TableCell className="text-center font-black text-muted-foreground/60">{item.no}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-sm text-foreground group-hover:text-primary transition-colors">{item.name}</span>
                                                        <span className="text-[10px] font-bold text-muted-foreground">{item.nip}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-black text-green-600/80">{Math.ceil(item.totalHadir)}</TableCell>
                                                <TableCell className="text-center font-black text-blue-500/80">{item.totalIzin}</TableCell>
                                                <TableCell className="text-center font-black text-orange-500/80">{item.totalSakit}</TableCell>
                                                <TableCell className="text-center font-black text-destructive/80">{item.totalAlpa}</TableCell>
                                                <TableCell className="text-center">
                                                    <span className="inline-flex items-center px-3 py-1 rounded-xl bg-primary/10 text-primary font-black text-xs">
                                                        {item.persentase}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-primary/10 active:scale-90 transition-all">
                                                                <Eye className="h-5 w-5 text-primary" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-52 rounded-2xl p-2 shadow-2xl border-none">
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 px-4 focus:bg-primary/5 group">
                                                                <Link href={`/dashboard/laporan/${item.uid}`} className="flex items-center">
                                                                    <Search className="mr-3 h-4.5 w-4.5 text-primary group-hover:scale-110 transition-transform" />
                                                                    <span className="text-xs font-black text-foreground">Lihat Kehadiran</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator className="my-1.5 opacity-30" />
                                                            <DropdownMenuItem 
                                                                className="rounded-xl cursor-pointer py-3 px-4 focus:bg-destructive/5 group"
                                                                disabled={isExporting && exportingUserId === item.uid}
                                                                onClick={() => handleDownloadPersonalPdf(item)}
                                                            >
                                                                {exportingUserId === item.uid ? (
                                                                    <Loader2 className="mr-3 h-4.5 w-4.5 animate-spin text-destructive" />
                                                                ) : (
                                                                    <FileText className="mr-3 h-4.5 w-4.5 text-destructive group-hover:scale-110 transition-transform" />
                                                                )}
                                                                <span className="text-xs font-black text-destructive">Unduh Laporan</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground font-medium">
                                                    {error || "Tidak ada data kehadiran ditemukan."}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
