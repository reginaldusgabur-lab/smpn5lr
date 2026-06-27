
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { format, isValid, parseISO, startOfMonth, endOfMonth, isSameMonth, subMonths, addMonths } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, FileText, Eye, Search, Filter, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { calculateAttendanceStats } from '@/lib/attendance';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '@/hooks/use-toast';

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
                // FILTER: Hanya ambil personil AKTIF
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
                // SORT: Utamakan sequenceNumber
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

    const handleDownloadPdf = async () => {
        if (!filteredReports.length || isExporting) return;
        setIsExporting(true);

        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const centerX = pageWidth / 2;
            const margin = 14;
            let finalY = 20;

            // Header Config
            const config = schoolConfigData || {};
            const instansi = (config.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase();
            const dinas = (config.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA').toUpperCase();
            const sekolah = (config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase();
            const alamat = config.address || 'Alamat Sekolah';

            // Draw Header
            doc.setFont('times', 'bold').setFontSize(12);
            doc.text(instansi, centerX, finalY, { align: 'center' });
            finalY += 6;
            doc.text(dinas, centerX, finalY, { align: 'center' });
            finalY += 6;
            doc.setFontSize(14);
            doc.text(sekolah, centerX, finalY, { align: 'center' });
            finalY += 5;
            doc.setFont('times', 'normal').setFontSize(9);
            doc.text(`Alamat: ${alamat}`, centerX, finalY, { align: 'center' });
            finalY += 4;
            doc.setLineWidth(0.5).line(margin, finalY, pageWidth - margin, finalY);
            finalY += 10;

            // Title
            doc.setFont('times', 'bold').setFontSize(12);
            doc.text('REKAPITULASI KEHADIRAN PERSONIL', centerX, finalY, { align: 'center' });
            finalY += 6;
            doc.setFont('times', 'normal');
            doc.text(`Periode: ${monthName}`, centerX, finalY, { align: 'center' });
            finalY += 10;

            // Table Data
            const tableRows = filteredReports.map((item, index) => [
                index + 1,
                item.name,
                item.nip,
                item.position,
                Math.ceil(item.totalHadir),
                item.totalIzin + item.totalSakit,
                item.totalAlpa,
                item.persentase
            ]);

            autoTable(doc, {
                startY: finalY,
                head: [['No', 'Nama Personil', 'NIP', 'Status', 'H', 'I/S', 'A', '%']],
                body: tableRows,
                theme: 'grid',
                styles: { font: 'times', fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [45, 55, 72], textColor: 255, halign: 'center' },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { cellWidth: 45 },
                    2: { cellWidth: 30 },
                    4: { halign: 'center', cellWidth: 10 },
                    5: { halign: 'center', cellWidth: 10 },
                    6: { halign: 'center', cellWidth: 10 },
                    7: { halign: 'center', cellWidth: 15 },
                }
            });

            // Signature
            const finalTableY = (doc as any).lastAutoTable.finalY + 15;
            const signatureX = pageWidth - 70;
            const kota = config.reportCity || 'Mando';
            const tgl = format(new Date(), 'd MMMM yyyy', { locale: id });

            doc.setFontSize(10);
            doc.text(`${kota}, ${tgl}`, signatureX, finalTableY);
            doc.text('Mengetahui,', signatureX, finalTableY + 5);
            doc.text('Kepala Sekolah', signatureX, finalTableY + 10);
            
            doc.setFont('times', 'bold');
            doc.text(config.headmasterName || 'Kepala Sekolah', signatureX, finalTableY + 35);
            doc.setFont('times', 'normal');
            doc.text(`NIP. ${config.headmasterNip || '-'}`, signatureX, finalTableY + 40);

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
                    <p className="text-muted-foreground mt-1">Ringkasan kehadiran bulanan untuk seluruh personil.</p>
                </div>

                <Card className="overflow-hidden border shadow-sm">
                    <CardContent className="p-0 sm:p-6 min-h-[500px]">
                        <div className="p-4 space-y-6">
                            <div className="flex flex-col items-center justify-center gap-4 py-2">
                                <div className="flex items-center gap-6">
                                    <Button variant="outline" size="icon" className="rounded-full shrink-0" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                                    <span className="w-48 text-center font-black text-2xl text-primary">{monthName}</span>
                                    <Button variant="outline" size="icon" className="rounded-full shrink-0" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isSameMonth(currentMonth, new Date())}><ChevronRight className="h-4 w-4" /></Button>
                                </div>
                                <div className="w-full h-px bg-border/60" />
                            </div>
                            
                            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                                <div className="w-full md:w-[160px] lg:w-[200px] relative">
                                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                                        <SelectTrigger className="pl-10 h-11 rounded-xl bg-muted/30 border-muted-foreground/10"><SelectValue placeholder="Peran" /></SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            <SelectItem value="all">Semua Peran</SelectItem>
                                            <SelectItem value="guru">Guru</SelectItem>
                                            <SelectItem value="pegawai">Pegawai</SelectItem>
                                            <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                                    <Input placeholder="Cari nama personil..." className="pl-10 h-11 rounded-xl bg-muted/30 border-muted-foreground/10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                <div className="w-full md:w-auto">
                                    <Button 
                                        className="w-full md:w-auto h-11 rounded-xl font-bold shadow-md active:scale-95 transition-all px-6" 
                                        disabled={isReportLoading || !filteredReports.length || isExporting}
                                        onClick={handleDownloadPdf}
                                    >
                                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        <span className="whitespace-nowrap">Unduh Laporan</span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-muted-foreground/10">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="border-none">
                                            <TableHead className="w-[60px] text-center font-bold text-xs">No</TableHead>
                                            <TableHead className="font-bold text-xs">Nama & NIP</TableHead>
                                            <TableHead className="text-center font-bold text-xs">H</TableHead>
                                            <TableHead className="text-center font-bold text-xs">I/S</TableHead>
                                            <TableHead className="text-center font-bold text-xs">A</TableHead>
                                            <TableHead className="text-center font-bold text-xs">%</TableHead>
                                            <TableHead className="w-[80px] text-center font-bold text-xs">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(isReportLoading || isUserLoading) ? (
                                            [...Array(10)].map((_, i) => (
                                                <TableRow key={i} className="border-muted-foreground/5">
                                                    <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-10 w-48 rounded-lg" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-6 w-12 mx-auto rounded-md" /></TableCell>
                                                    <TableCell><Skeleton className="h-8 w-8 mx-auto rounded-full" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : filteredReports.length > 0 ? filteredReports.map((item) => (
                                            <TableRow key={item.uid} className="hover:bg-muted/20 transition-colors border-muted-foreground/5">
                                                <TableCell className="text-center font-bold text-muted-foreground">{item.no}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-sm text-foreground">{item.name}</span>
                                                        <span className="text-[10px] font-bold text-muted-foreground">{item.nip}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-green-600">{Math.ceil(item.totalHadir)}</TableCell>
                                                <TableCell className="text-center font-bold text-orange-500">{item.totalIzin + item.totalSakit}</TableCell>
                                                <TableCell className="text-center font-bold text-destructive">{item.totalAlpa}</TableCell>
                                                <TableCell className="text-center font-black text-primary">{item.persentase}</TableCell>
                                                <TableCell className="text-center">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted-foreground/10">
                                                                <Search className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-52 rounded-2xl p-2 shadow-2xl">
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-2.5 px-3 focus:bg-primary/5">
                                                                <Link href={`/dashboard/laporan/${item.uid}`} className="flex items-center">
                                                                    <Eye className="mr-3 h-4 w-4 text-primary" />
                                                                    <span className="text-xs font-bold">Detail Kehadiran</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator className="my-1.5 opacity-50" />
                                                            <DropdownMenuItem className="rounded-xl cursor-pointer py-2.5 px-3 focus:bg-destructive/5">
                                                                <FileText className="mr-3 h-4 w-4 text-destructive" />
                                                                <span className="text-xs font-bold text-destructive">Unduh Personal</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground font-medium">
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
