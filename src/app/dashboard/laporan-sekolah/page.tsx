
'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { format, isSameMonth, startOfMonth, endOfMonth, addMonths, subMonths, startOfDay, isBefore, isSameDay, eachDayOfInterval, setHours, setMinutes } from 'date-fns';
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

            const attendanceQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('checkInTime', '>=', start), where('checkInTime', '<=', end));
            const attendanceFallbackQuery = query(collectionGroup(firestore, 'attendanceRecords'), where('date', '>=', format(start, 'yyyy-MM-dd')), where('date', '<=', format(end, 'yyyy-MM-dd')));
            const leaveQuery = query(collectionGroup(firestore, 'leaveRequests'), where('status', '==', 'approved'));

            const [attendanceSnap, attendanceFallbackSnap, leaveSnap] = await Promise.all([
                getDocs(attendanceQuery), getDocs(attendanceFallbackQuery), getDocs(leaveQuery)
            ]);

            const attendanceByUserId: Record<string, any[]> = {};
            [...attendanceSnap.docs, ...attendanceFallbackSnap.docs].forEach(d => {
                const data = d.data();
                const uid = data.userId || d.ref.parent.parent?.id;
                if (uid) {
                    const existing = attendanceByUserId[uid] || [];
                    const dStr = data.date || (data.checkInTime ? format(data.checkInTime.toDate(), 'yyyy-MM-dd') : null);
                    if (dStr && !existing.some(e => (e.date || format(e.checkInTime.toDate(), 'yyyy-MM-dd')) === dStr)) attendanceByUserId[uid] = [...existing, data];
                }
            });

            const leaveByUserId: Record<string, any[]> = {};
            leaveSnap.docs.forEach(d => {
                const data = d.data();
                const uid = data.userId || d.ref.parent.parent?.id;
                if (uid) (leaveByUserId[uid] = leaveByUserId[uid] || []).push(data);
            });

            const offDays: number[] = (schoolConfigData as any)?.offDays ?? [0, 6];
            const holidays: string[] = monthlyConfig.holidays ?? [];
            const workingDays = eachDayOfInterval({ start, end }).filter(day => !offDays.includes(day.getDay()) && !holidays.includes(format(day, 'yyyy-MM-dd')));
            const workingDaysSet = new Set(workingDays.map(d => format(d, 'yyyy-MM-dd')));
            const today = startOfDay(new Date());
            const pastWorkingDays = workingDays.filter(day => isBefore(day, today) || isSameDay(day, today));

            const results = allUsers.map(u => {
                let points = 0;
                let hadirCount = 0;
                let izinCount = 0;
                let sakitCount = 0;
                const processedDates = new Set<string>();

                (attendanceByUserId[u.id] || []).forEach(att => {
                    const attDateStr = att.date || (att.checkInTime ? format(att.checkInTime.toDate(), 'yyyy-MM-dd') : null);
                    if (attDateStr && workingDaysSet.has(attDateStr) && !processedDates.has(attDateStr)) {
                        let p = 0;
                        const desc = (att.reasonForUpdate || '').toLowerCase();
                        if (desc.includes('dinas') || desc.includes('pulang cepat')) p = 1.0;
                        else if (att.checkInTime && att.checkOutTime) {
                            let isLate = false;
                            const checkInDate = att.checkInTime.toDate();
                            if (schoolConfigData.useTimeValidation && schoolConfigData.checkInEndTime) {
                                const [h, m] = schoolConfigData.checkInEndTime.split(':').map(Number);
                                const deadline = setMinutes(setHours(startOfDay(checkInDate), h), m);
                                if (checkInDate > deadline) isLate = true;
                            }
                            p = isLate ? 0.95 : 1.0;
                        } else p = 0.5;
                        points += p; hadirCount++; processedDates.add(attDateStr);
                    }
                });

                (leaveByUserId[u.id] || []).forEach(leave => {
                    eachDayOfInterval({ start: leave.startDate.toDate(), end: leave.endDate.toDate() }).forEach(day => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        if (workingDaysSet.has(dayStr) && !processedDates.has(dayStr)) {
                            let p = 0;
                            if (leave.type === 'Sakit') { p = 0.9; sakitCount++; }
                            else if (leave.type === 'Izin' || leave.type === 'Izin Pribadi') { p = 0.7; izinCount++; }
                            else { p = 1.0; hadirCount++; }
                            points += p; processedDates.add(dayStr);
                        }
                    });
                });

                const totalAlpa = pastWorkingDays.filter(day => !processedDates.has(format(day, 'yyyy-MM-dd'))).length;
                const persentase = Math.min((points / (workingDays.length || 1)) * 100, 100).toFixed(1) + '%';

                return {
                    uid: u.id, name: (u as any).name || '', nip: (u as any).nip || '-',
                    position: (u as any).position || '-', role: (u as any).role || '',
                    sequenceNumber: (u as any).sequenceNumber || null,
                    totalHadir: hadirCount, totalIzin: izinCount, totalSakit: sakitCount, totalAlpa, persentase
                };
            });

            results.sort((a, b) => (a.sequenceNumber ?? 999) - (b.sequenceNumber ?? 999));
            if (isMounted.current) {
                setReportData(results.map((r, i) => ({ ...r, no: i + 1 })));
                setIsReportLoading(false);
            }
        } catch (err) { 
            if (isMounted.current) { setIsReportLoading(false); setError("Gagal memuat data."); }
        }
    }, [firestore, user?.uid, currentMonth, schoolConfigData]);

    useEffect(() => {
        isMounted.current = true;
        if (!isUserLoading && user?.uid && schoolConfigData) loadData();
        return () => { isMounted.current = false; };
    }, [loadData, user?.uid, isUserLoading, schoolConfigData]);

    const filteredReports = useMemo(() => reportData.filter(r => (roleFilter === 'all' || r.role === roleFilter) && r.name.toLowerCase().includes(searchTerm.toLowerCase())), [reportData, roleFilter, searchTerm]);

    const handleDownloadPdf = async () => {
        if (!filteredReports.length || isExporting) return;
        setIsExporting(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const centerX = pageWidth / 2;
            const margin = 14;
            const config = schoolConfigData || ({} as any);

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text((config.governmentAgency || 'PEMERINTAH KABUPATEN MANGGARAI').toUpperCase(), centerX, 20, { align: 'center' });
            doc.text((config.educationAgency || 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA').toUpperCase(), centerX, 27, { align: 'center' });
            doc.setFontSize(12);
            doc.text((config.schoolName || 'SMP NEGERI 5 LANGKE REMBONG').toUpperCase(), centerX, 34, { align: 'center' });
            doc.setFont('times', 'normal').setFontSize(9);
            doc.text(`Alamat: ${config.address || 'Alamat Sekolah'}`, centerX, 39, { align: 'center' });
            doc.setLineWidth(0.8).line(margin, 43, pageWidth - margin, 43);
            doc.setLineWidth(0.2).line(margin, 43.8, pageWidth - margin, 43.8);

            doc.setFont('times', 'bold').setFontSize(14);
            doc.text(`Laporan Kehadiran Bulan ${format(currentMonth, 'MMMM yyyy', { locale: id })}`, centerX, 58, { align: 'center' });

            const tableRows = filteredReports.map((item, index) => [
                index + 1, item.name, item.nip, item.position, Math.ceil(item.totalHadir), item.totalIzin, item.totalSakit, item.totalAlpa, item.persentase
            ]);

            autoTable(doc, {
                startY: 70,
                head: [['No', 'Nama', 'NIP', 'Status', 'H', 'I', 'S', 'A', '%']],
                body: tableRows,
                theme: 'grid',
                styles: { font: 'times', fontSize: 9 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, halign: 'center' }
            });

            doc.save(`Laporan_Sekolah_${format(currentMonth, 'MMMM_yyyy', { locale: id })}.pdf`);
        } finally { setIsExporting(false); }
    };

    return (
        <div className="flex-1 pt-2 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="px-4 md:px-0">
                    <h1 className="text-2xl font-normal tracking-tight">Laporan sekolah</h1>
                </div>

                <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl bg-card">
                    <CardHeader className="p-4 border-b border-muted-foreground/10 text-primary">
                        <CardTitle className="font-bold text-xs uppercase">Rekapitulasi kehadiran</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 min-h-[500px]">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center gap-4">
                                <div className="flex items-center bg-muted/40 rounded-xl border border-muted-foreground/5 p-1">
                                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))} disabled={isReportLoading || currentMonth < minDate}><ChevronLeft className="h-5 w-5 text-primary" /></Button>
                                    <span className="w-40 text-center font-bold text-xl text-primary">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isReportLoading || isSameMonth(currentMonth, new Date())}><ChevronRight className="h-5 w-5 text-primary" /></Button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
                                <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full">
                                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                                        <SelectTrigger className="w-full sm:w-[160px] h-11 rounded-xl bg-muted/30 font-bold text-xs"><SelectValue placeholder="Peran" /></SelectTrigger>
                                        <SelectContent className="rounded-xl border-none"><SelectItem value="all">Semua peran</SelectItem><SelectItem value="guru">Guru</SelectItem><SelectItem value="pegawai">Pegawai</SelectItem><SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem></SelectContent>
                                    </Select>
                                    <div className="flex-1 relative w-full"><Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" /><Input placeholder="Cari personil..." className="pl-11 h-11 rounded-xl bg-muted/30 font-bold text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                                </div>
                                <Button className="w-full sm:w-auto h-11 rounded-xl font-normal bg-primary text-xs uppercase" disabled={isReportLoading || !filteredReports.length || isExporting} onClick={handleDownloadPdf}>{isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}UNDUH PDF</Button>
                            </div>
                        </div>

                        <div className="border-t border-muted-foreground/5 overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="border-none">
                                        <TableHead className="w-[60px] text-center font-bold text-[10px] uppercase">No</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase">Nama & NIP</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase">H</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase">I</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase">S</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase">A</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase">%</TableHead>
                                        <TableHead className="w-[80px] text-center font-bold text-[10px] uppercase">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isReportLoading ? [...Array(6)].map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell></TableRow>) : filteredReports.length > 0 ? filteredReports.map((item) => (
                                        <TableRow key={item.uid} className="hover:bg-primary/5">
                                            <TableCell className="text-center font-bold text-muted-foreground text-xs">{item.no}</TableCell>
                                            <TableCell><div className="flex flex-col"><span className="font-bold text-sm">{item.name}</span><span className="text-[10px] font-bold text-muted-foreground">{item.nip}</span></div></TableCell>
                                            <TableCell className="text-center font-bold text-green-600/80">{Math.ceil(item.totalHadir)}</TableCell>
                                            <TableCell className="text-center font-bold text-blue-500/80">{item.totalIzin}</TableCell>
                                            <TableCell className="text-center font-bold text-orange-500/80">{item.totalSakit}</TableCell>
                                            <TableCell className="text-center font-bold text-destructive/80">{item.totalAlpa}</TableCell>
                                            <TableCell className="text-center"><span className="px-3 py-1 rounded-xl bg-primary/10 text-primary font-bold text-xs">{item.persentase}</span></TableCell>
                                            <TableCell className="text-center"><Link href={`/dashboard/laporan/${item.uid}?month=${format(currentMonth, 'yyyy-MM')}`}><Button variant="ghost" size="icon" className="rounded-full"><Eye className="h-5 w-5 text-primary" /></Button></Link></TableCell>
                                        </TableRow>
                                    )) : <TableRow><TableCell colSpan={8} className="h-48 text-center font-bold opacity-50 uppercase text-xs">Data tidak ditemukan</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
const minDate = new Date(2026, 0, 1);
