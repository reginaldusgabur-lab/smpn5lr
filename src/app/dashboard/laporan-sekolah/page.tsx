'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, startOfDay, isBefore, isSameDay, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ChevronLeft, ChevronRight, Search, Download, Filter, Eye } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    const isMounted = useRef(true);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData } = useDoc(user, schoolConfigRef);

    const loadData = useCallback(async () => {
        if (!firestore || !user?.uid || !isMounted.current || !schoolConfigData) return;
        
        setIsReportLoading(true);
        setError(null);
        
        try {
            const start = startOfMonth(currentMonth);
            const end = endOfMonth(currentMonth);
            const monthId = format(currentMonth, 'yyyy-MM');

            const monthlyConfigRef = doc(firestore, 'monthlyConfigs', monthId);
            const usersQuery = query(
                collection(firestore, 'users'), 
                where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']),
                where('status', '==', 'Aktif')
            );
            
            const [monthlySnap, usersSnap] = await Promise.all([
                getDoc(monthlyConfigRef),
                getDocs(usersQuery)
            ]);

            const monthlyConfig = monthlySnap.exists() ? monthlySnap.data() : {};
            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const attendanceQuery = query(
                collectionGroup(firestore, 'attendanceRecords'),
                where('checkInTime', '>=', start),
                where('checkInTime', '<=', end)
            );
            
            const attendanceFallbackQuery = query(
                collectionGroup(firestore, 'attendanceRecords'),
                where('date', '>=', format(start, 'yyyy-MM-dd')),
                where('date', '<=', format(end, 'yyyy-MM-dd'))
            );

            const [attendanceSnap, attendanceFallbackSnap] = await Promise.all([
                getDocs(attendanceQuery),
                getDocs(attendanceFallbackQuery)
            ]);

            const attendanceByUserId: Record<string, any[]> = {};
            [...attendanceSnap.docs, ...attendanceFallbackSnap.docs].forEach(d => {
                const data = d.data();
                const uid = data.userId || d.ref.parent.parent?.id;
                if (uid) {
                    const existing = attendanceByUserId[uid] || [];
                    const dStr = data.date || (data.checkInTime ? format(data.checkInTime.toDate(), 'yyyy-MM-dd') : null);
                    if (dStr && !existing.some(e => (e.date || format(e.checkInTime.toDate(), 'yyyy-MM-dd')) === dStr)) {
                        attendanceByUserId[uid] = [...existing, data];
                    }
                }
            });

            const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));
            const leaveSnap = await getDocs(leaveQuery);
            const leaveByUserId: Record<string, any[]> = {};
            leaveSnap.docs.forEach(d => {
                const data = d.data();
                const uid = data.userId || d.ref.parent.parent?.id;
                if (uid) (leaveByUserId[uid] = leaveByUserId[uid] || []).push(data);
            });

            const offDays: number[] = (schoolConfigData as any)?.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig.holidays ?? [];
            const workingDays = eachDayOfInterval({ start, end }).filter(day => 
                !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd'))
            );
            const workingDaysSet = new Set(workingDays.map(d => format(d, 'yyyy-MM-dd')));
            const today = startOfDay(new Date());
            const pastWorkingDays = workingDays.filter(day => isBefore(day, today) || isSameDay(day, today));

            const results = allUsers.map(u => {
                const uAtt = attendanceByUserId[u.id] || [];
                const uLeave = leaveByUserId[u.id] || [];

                let points = 0;
                let hadirCount = 0;
                let izinCount = 0;
                let sakitCount = 0;
                const processedDates = new Set<string>();

                uAtt.forEach(att => {
                    const attDateStr = att.date || (att.checkInTime ? format(att.checkInTime.toDate(), 'yyyy-MM-dd') : null);
                    if (attDateStr && workingDaysSet.has(attDateStr) && !processedDates.has(attDateStr)) {
                        let p = 0;
                        const desc = (att.reasonForUpdate || '').toLowerCase();
                        if (desc.includes('dinas')) {
                            p = 1.0;
                            hadirCount++;
                        } else if (desc.includes('pulang cepat')) {
                            p = 0.95; 
                            hadirCount++;
                        } else if (att.checkInTime && att.checkOutTime) {
                            let isLate = false;
                            const checkInDate = att.checkInTime.toDate();
                            if (schoolConfigData.useTimeValidation && schoolConfigData.checkInEndTime) {
                                const [h, m] = schoolConfigData.checkInEndTime.split(':').map(Number);
                                const deadline = new Date(checkInDate);
                                deadline.setHours(h, m, 0, 0);
                                if (checkInDate > deadline) isLate = true;
                            }
                            p = isLate ? 0.95 : 1.0;
                            hadirCount++;
                        } else if (att.checkInTime || att.checkOutTime) {
                            p = 0.5;
                            hadirCount++;
                        }
                        points += p;
                        processedDates.add(attDateStr);
                    }
                });

                uLeave.forEach(leave => {
                    eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        if (workingDaysSet.has(dayStr) && !processedDates.has(dayStr)) {
                            let p = 0;
                            if (leave.type === 'Sakit') {
                                p = 0.9;
                                sakitCount++;
                            } else if (leave.type === 'Izin' || leave.type === 'Izin Pribadi') {
                                p = 0.7;
                                izinCount++;
                            } else if (leave.type === 'Dinas' || leave.type === 'Dinas Pagi' || leave.type === 'Dinas Siang') {
                                p = 1.0;
                                hadirCount++;
                            } else if (leave.type === 'Pulang Cepat') {
                                p = 0.95;
                                hadirCount++;
                            }
                            points += p;
                            processedDates.add(dayStr);
                        }
                    });
                });
                
                const alpaCount = pastWorkingDays.filter(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    return !processedDates.has(dayStr);
                }).length;

                const denominator = workingDays.length || 1;
                const persentase = Math.min((points / denominator) * 100, 100).toFixed(1) + '%';

                return {
                    uid: u.id,
                    name: (u as any).name || '',
                    nip: (u as any).nip || '-',
                    position: (u as any).position || '-',
                    role: (u as any).role || '',
                    sequenceNumber: (u as any).sequenceNumber || null,
                    totalHadir: hadirCount,
                    totalIzin: izinCount,
                    totalSakit: sakitCount,
                    totalAlpa: alpaCount,
                    persentase
                };
            });

            results.sort((a, b) => (a.sequenceNumber ?? 999) - (b.sequenceNumber ?? 999));

            if (isMounted.current) {
                setReportData(results.map((r, i) => ({ ...r, no: i + 1 })));
                setIsReportLoading(false);
            }
        } catch (err) { 
            if (isMounted.current) {
                console.error("Load bulk report error:", err);
                setError("Gagal memuat data laporan.");
                setIsReportLoading(false);
            }
        }
    }, [firestore, user?.uid, currentMonth, schoolConfigData]);

    useEffect(() => {
        isMounted.current = true;
        if (!isUserLoading && user?.uid && schoolConfigData) {
            loadData();
        }
        return () => { isMounted.current = false; };
    }, [loadData, user?.uid, isUserLoading, schoolConfigData]);

    const filteredReports = useMemo(() => reportData.filter(r => (roleFilter === 'all' || r.role === roleFilter) && r.name.toLowerCase().includes(searchTerm.toLowerCase())), [reportData, roleFilter, searchTerm]);
    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

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
            doc.text((config.governmentAgency || 'Pemerintah Kabupaten Manggarai').toUpperCase(), centerX, finalY, { align: 'center' });
            finalY += 7;
            doc.text((config.educationAgency || 'Dinas Pendidikan, Kepemudaan dan Olahraga').toUpperCase(), centerX, finalY, { align: 'center' });
            finalY += 7;
            doc.setFontSize(12);
            doc.text((config.schoolName || 'SMP Negeri 5 Langke Rembong').toUpperCase(), centerX, finalY, { align: 'center' });
            finalY += 5;
            doc.setFont('times', 'normal').setFontSize(9);
            doc.text(`Alamat: ${config.address || 'Alamat Sekolah'}`, centerX, finalY, { align: 'center' });
            finalY += 4;
            doc.setLineWidth(0.8).line(margin, finalY, pageWidth - margin, finalY);
            doc.setLineWidth(0.2).line(margin, finalY + 0.8, pageWidth - margin, finalY + 0.8);
            finalY += 15;

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text(`Laporan Kehadiran Bulan ${monthName}`, centerX, finalY, { align: 'center' });
            if (config.academicYear) {
                finalY += 7;
                doc.text(`Tahun Ajaran ${config.academicYear}`, centerX, finalY, { align: 'center' });
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
                head: [['No', 'Nama', 'NIP', 'Status', 'H', 'I', 'S', 'A', '%']],
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

            doc.save(`Laporan_Sekolah_${format(currentMonth, 'MMMM_yyyy', { locale: id })}.pdf`);
            toast({ title: "Berhasil", description: "Laporan PDF berhasil diunduh." });
        } catch (err) {
            toast({ variant: "destructive", title: "Gagal", description: "Terjadi kesalahan saat membuat PDF." });
        } finally {
            setIsExporting(false);
        }
    };

    const minDate = new Date(2026, 0, 1);
    const canGoPrev = currentMonth > minDate;

    return (
        <div className="flex-1 pt-2 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="px-4 md:px-0">
                    <h1 className="text-2xl font-normal tracking-tight text-foreground">Laporan sekolah</h1>
                    <p className="text-muted-foreground mt-0.5 text-xs font-bold">Ringkasan kehadiran bulanan untuk seluruh personil aktif.</p>
                </div>

                <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl bg-card">
                    <CardHeader className="p-4 border-b border-muted-foreground/10 text-primary">
                        <CardTitle className="font-bold text-xs tracking-tight uppercase">Rekapitulasi kehadiran</CardTitle>
                        <CardDescription className="text-muted-foreground font-bold text-[10px]">Data kehadiran akumulatif seluruh personil bulan {monthName}.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 min-h-[500px]">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center gap-4">
                                <div className="flex items-center bg-muted/40 rounded-xl border border-muted-foreground/5 p-1 shrink-0">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-10 w-10 rounded-lg hover:bg-background/50 shadow-none shrink-0" 
                                        onClick={() => setCurrentMonth(prev => {
                                            const n = subMonths(prev, 1);
                                            return n < minDate ? prev : n;
                                        })} 
                                        disabled={isReportLoading || !canGoPrev}
                                    >
                                        <ChevronLeft className="h-5 w-5 text-primary" />
                                    </Button>
                                    <span className="w-40 text-center font-bold text-xl text-primary tracking-tight capitalize whitespace-nowrap">{monthName}</span>
                                    <Button variant="ghost" size="icon" className="rounded-lg shrink-0 h-10 w-10 shadow-none hover:bg-background/50" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isReportLoading || isSameMonth(currentMonth, new Date())}>
                                        <ChevronRight className="h-5 w-5 text-primary" />
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                                <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full">
                                    <div className="w-full sm:w-[160px] relative group">
                                        <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary z-10 pointer-events-none" />
                                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                                            <SelectTrigger className="pl-10 h-11 rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all shadow-none font-bold text-xs">
                                                <SelectValue placeholder="Peran" />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl border-none shadow-2xl">
                                                <SelectItem value="all" className='rounded-lg text-xs'>Semua peran</SelectItem>
                                                <SelectItem value="guru" className='rounded-lg text-xs'>Guru</SelectItem>
                                                <SelectItem value="pegawai" className='rounded-lg text-xs'>Pegawai</SelectItem>
                                                <SelectItem value="kepala_sekolah" className='rounded-lg text-xs'>Kepala Sekolah</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex-1 relative w-full">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary z-10" />
                                        <Input 
                                            placeholder="Cari personil..." 
                                            className="pl-11 h-11 rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all font-bold text-xs shadow-none" 
                                            value={searchTerm} 
                                            onChange={e => setSearchTerm(e.target.value)} 
                                        />
                                    </div>
                                </div>
                                <Button 
                                    className="w-full sm:w-auto h-11 rounded-xl font-normal shadow-none active:scale-95 transition-all px-6 bg-primary hover:bg-primary/90 text-xs uppercase tracking-wider" 
                                    disabled={isReportLoading || !filteredReports.length || isExporting}
                                    onClick={handleDownloadPdf}
                                >
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}UNDUH PDF
                                </Button>
                            </div>
                        </div>

                        <div className="border-t border-muted-foreground/5">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="border-none">
                                            <TableHead className="w-[60px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">No</TableHead>
                                            <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Nama & NIP</TableHead>
                                            <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">H</TableHead>
                                            <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">I</TableHead>
                                            <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">S</TableHead>
                                            <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">A</TableHead>
                                            <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">%</TableHead>
                                            <TableHead className="w-[80px] text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(isReportLoading || isUserLoading) ? (
                                            [...Array(8)].map((_, i) => (
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
                                        ) : error ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground font-bold">
                                                    {error}
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredReports.length > 0 ? filteredReports.map((item) => (
                                            <TableRow key={item.uid} className="hover:bg-primary/5 transition-colors border-muted-foreground/5">
                                                <TableCell className="text-center font-bold text-muted-foreground/60">{item.no}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm text-foreground">{item.name}</span>
                                                        <span className="text-[10px] font-bold text-muted-foreground">{item.nip}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-green-600/80">{Math.ceil(item.totalHadir)}</TableCell>
                                                <TableCell className="text-center font-bold text-blue-500/80">{item.totalIzin}</TableCell>
                                                <TableCell className="text-center font-bold text-orange-500/80">{item.totalSakit}</TableCell>
                                                <TableCell className="text-center font-bold text-destructive/80">{item.totalAlpa}</TableCell>
                                                <TableCell className="text-center">
                                                    <span className="inline-flex items-center px-3 py-1 rounded-xl bg-primary/10 text-primary font-bold text-xs">
                                                        {item.persentase}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Link href={`/dashboard/laporan/${item.uid}?month=${format(currentMonth, 'yyyy-MM')}`}>
                                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-primary/10 active:scale-90 transition-all shadow-none">
                                                            <Eye className="h-5 w-5 text-primary" />
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground font-bold">
                                                    Tidak ada data personil ditemukan.
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
