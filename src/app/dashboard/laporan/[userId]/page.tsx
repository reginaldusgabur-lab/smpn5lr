'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc, writeBatch, collection, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { format, isValid, parseISO, startOfDay, endOfDay, addMinutes, isBefore, isSameMonth, startOfMonth, endOfMonth, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchUserMonthlyReportData, calculateAttendanceStats, type MonthlyReportData } from '@/lib/attendance';
import { Download, ChevronLeft, ChevronRight, AlertCircle, ArrowLeft, Loader2, MoreVertical, TrendingUp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { invalidateCache } from '@/lib/cache';
import { cn } from '@/lib/utils';

const safeFormat = (dateInput: any, formatString: string): string => {
    if (!dateInput) return '-';
    let date: Date;
    if (typeof dateInput === 'string') date = parseISO(dateInput);
    else if (dateInput.toDate) date = dateInput.toDate();
    else date = new Date(dateInput);
    return isValid(date) ? format(date, formatString, { locale: id }) : '-';
};

export default function UserReportDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user: currentUser } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const userId = params.userId as string;
    const isMounted = useRef(true);

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
    const [stats, setStats] = useState<{ persentase: string } | null>(null);
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMutating, setIsMutating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData } = useDoc(currentUser, schoolConfigRef);

    const fetchData = useCallback(async () => {
        if (!firestore || !userId || !schoolConfigData || !currentUser || !isMounted.current) return;
        setIsLoading(true);
        setError(null);
        try {
            const userRef = doc(firestore, 'users', userId);
            const [userSnap, reportData, reportStats] = await Promise.all([
                getDoc(userRef),
                fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfigData),
                calculateAttendanceStats(firestore, userId, { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
            ]);

            if (!userSnap.exists()) throw new Error('Pengguna tidak ditemukan.');
            if (isMounted.current) {
                setUserData(userSnap.data());
                setMonthlyReportData(reportData);
                setStats(reportStats);
            }
        } catch (err: any) {
            if (isMounted.current) setError(err.message || 'Gagal memuat data laporan.');
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    }, [firestore, userId, currentMonth, schoolConfigData, currentUser]);

    useEffect(() => {
        isMounted.current = true;
        fetchData();
        return () => { isMounted.current = false; };
    }, [fetchData]);

    const handleStatusChange = async (dateStr: string, newStatus: string, reason: string) => {
        if (!currentUser || !firestore || isMutating || !schoolConfigData) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(dateStr);
            const batch = writeBatch(firestore);
            const todayStr = format(targetDate, 'yyyy-MM-dd');
            
            if (['Dinas Pagi', 'Dinas Siang', 'Pulang Cepat'].includes(newStatus)) {
                const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
                const q = query(attendanceRef, where('date', '==', todayStr));
                const snap = await getDocs(q);
                
                const inEnd = schoolConfigData.checkInEndTime || '07:30';
                const [h, m] = inEnd.split(':').map(Number);
                const limitIn = setMinutes(setHours(startOfDay(targetDate), h), m);
                
                let dataToSave: any = {
                    userId, date: todayStr,
                    manualEntry: true, reasonForUpdate: reason,
                    updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
                    checkOutTime: null 
                };

                const existingItem = monthlyReportData.find(d => d.date === dateStr);

                if (newStatus === 'Dinas Pagi') {
                    dataToSave.checkInTime = null;
                } else {
                    if (existingItem?.checkInTime) {
                        dataToSave.checkInTime = Timestamp.fromDate(parseISO(existingItem.checkInTime));
                    } else {
                        dataToSave.checkInTime = Timestamp.fromDate(new Date(limitIn.getTime() - Math.floor(Math.random() * 5 * 60 * 1000)));
                    }
                }

                if (!snap.empty) batch.update(snap.docs[0].ref, dataToSave);
                else batch.set(doc(attendanceRef), dataToSave);
            } else {
                const leaveRef = collection(firestore, 'users', userId, 'leaveRequests');
                batch.set(doc(leaveRef), {
                    userId, type: newStatus.includes('Izin') ? 'Izin' : newStatus, status: 'approved',
                    reason, startDate: Timestamp.fromDate(startOfDay(targetDate)),
                    endDate: Timestamp.fromDate(endOfDay(targetDate)), createdAt: serverTimestamp(),
                    approvedBy: currentUser.uid, approvedAt: serverTimestamp()
                });
            }

            await batch.commit();
            invalidateCache();
            toast({ title: 'Berhasil', description: `Status diperbarui menjadi ${reason}.` });
            fetchData();
        } catch (err) { toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan sistem.' }); }
        finally { setIsMutating(false); }
    };

    const handleSetHadir = async (item: MonthlyReportData) => {
        if (!currentUser || !firestore || !schoolConfigData || isMutating) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(item.date);
            const batch = writeBatch(firestore);
            
            const inEnd = schoolConfigData.checkInEndTime || '07:30';
            const outStart = schoolConfigData.checkOutStartTime || '14:00';

            const [inH, inM] = inEnd.split(':').map(Number);
            const limitIn = setMinutes(setHours(startOfDay(targetDate), inH), inM);
            const [outH, outM] = outStart.split(':').map(Number);
            const limitOut = setMinutes(setHours(startOfDay(targetDate), outH), outM);

            const data: any = {
                userId, date: format(targetDate, 'yyyy-MM-dd'),
                manualEntry: true, reasonForUpdate: 'Kehadiran penuh',
                updatedBy: currentUser.uid, updatedAt: serverTimestamp()
            };

            if (item.checkInTime) {
                data.checkInTime = Timestamp.fromDate(parseISO(item.checkInTime));
            } else {
                data.checkInTime = Timestamp.fromDate(new Date(limitIn.getTime() - Math.floor(Math.random() * 5 * 60 * 1000)));
            }

            // PATEN: Waktu acak 5 menit SETELAH jam mulai pulang
            const realOut = new Date(limitOut.getTime() + Math.floor(Math.random() * 5 * 60 * 1000));
            data.checkOutTime = Timestamp.fromDate(realOut);

            const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
            const q = query(attendanceRef, where('date', '==', format(targetDate, 'yyyy-MM-dd')));
            const snap = await getDocs(q);

            if (!snap.empty) batch.update(snap.docs[0].ref, data);
            else batch.set(doc(attendanceRef), data);

            await batch.commit();
            invalidateCache();
            toast({ title: 'Berhasil', description: 'Kehadiran berhasil dilengkapi.' });
            fetchData();
        } catch (err) { toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal memperbarui data.' }); }
        finally { setIsMutating(false); }
    };

    const handleSetLate = async (item: MonthlyReportData) => {
        if (!currentUser || !firestore || !schoolConfigData || isMutating) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(item.date);
            const inEnd = schoolConfigData.checkInEndTime || '07:30';
            const outStart = schoolConfigData.checkOutStartTime || '14:00';
            
            const [inH, inM] = inEnd.split(':').map(Number);
            const limitIn = setMinutes(setHours(startOfDay(targetDate), inH), inM);
            const [outH, outM] = outStart.split(':').map(Number);
            const limitOut = setMinutes(setHours(startOfDay(targetDate), outH), outM);

            // PATEN: Waktu acak 5 menit SETELAH jam selesai masuk
            const realIn = new Date(limitIn.getTime() + Math.floor(Math.random() * 5 * 60 * 1000));
            // PATEN: Waktu acak 5 menit SETELAH jam mulai pulang
            const realOut = new Date(limitOut.getTime() + Math.floor(Math.random() * 5 * 60 * 1000));

            const data = {
                userId, date: format(targetDate, 'yyyy-MM-dd'),
                checkInTime: Timestamp.fromDate(realIn),
                checkOutTime: Timestamp.fromDate(realOut),
                manualEntry: true, reasonForUpdate: 'Terlambat',
                updatedBy: currentUser.uid, updatedAt: serverTimestamp()
            };

            const q = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('date', '==', format(targetDate, 'yyyy-MM-dd')));
            const snap = await getDocs(q);
            if (!snap.empty) await writeBatch(firestore).update(snap.docs[0].ref, data).commit();
            else await writeBatch(firestore).set(doc(collection(firestore, 'users', userId, 'attendanceRecords')), data).commit();

            invalidateCache();
            toast({ title: 'Berhasil', description: 'Ditandai sebagai terlambat.' });
            fetchData();
        } catch (err) { toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal memperbarui data.' }); }
        finally { setIsMutating(false); }
    };

    const handleDownloadPdf = () => {
        if (!userData || monthlyReportData.length === 0) return;
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
        let currentY = 58;
        doc.text(`LAPORAN KEHADIRAN INDIVIDU BULAN ${format(currentMonth, 'MMMM yyyy', { locale: id }).toUpperCase()}`, centerX, currentY, { align: 'center' });
        currentY += 15;

        doc.setFontSize(10).setFont('times', 'normal');
        doc.text(`Nama : ${userData.name}`, margin, currentY); currentY += 6;
        doc.text(`NIP : ${userData.nip || '-'}`, margin, currentY); currentY += 6;
        
        const displayRole = (userData.role || 'user').replace('_', ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        doc.text(`Jabatan/Status : ${displayRole} / ${userData.position || '-'}`, margin, currentY);
        currentY += 10;

        const tableRows = monthlyReportData.map((item, index) => [
            index + 1,
            safeFormat(item.date, 'eeee, dd MMM yyyy'),
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
            styles: { font: 'times', fontSize: 9, cellPadding: 3, valign: 'middle' },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, halign: 'center', fontStyle: 'bold' },
            columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center', cellWidth: 22 }, 3: { halign: 'center', cellWidth: 22 }, 4: { halign: 'center', cellWidth: 25 } }
        });

        doc.save(`Laporan_Individu_${userData.name.replace(/\s+/g, '_')}_${format(currentMonth, 'MMMM_yyyy', { locale: id })}.pdf`);
    };

    const isAdmin = currentUser?.role === 'admin';
    const canGoPrev = currentMonth > new Date(2026, 0, 1);
    const canGoNext = !isSameMonth(currentMonth, new Date());

    return (
        <div className="flex-1 pt-2 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="px-4 md:px-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
                        <h1 className="text-2xl font-normal tracking-tight">Detail Laporan Kehadiran</h1>
                    </div>
                </div>

                <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl bg-card">
                    <CardContent className="p-0">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center gap-4 py-2">
                                <div className="flex items-center bg-muted/40 rounded-2xl border border-muted-foreground/5 p-1">
                                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))} disabled={isLoading || !canGoPrev}><ChevronLeft className="h-5 w-5 text-primary" /></Button>
                                    <div className="flex items-center gap-3 px-4">
                                        {stats && <span className="text-sm font-bold text-primary border-r border-muted-foreground/20 pr-3">{stats.persentase}</span>}
                                        <span className="font-bold text-xl text-primary capitalize whitespace-nowrap min-w-[120px] text-center">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} disabled={isLoading || !canGoNext}><ChevronRight className="h-5 w-5 text-primary" /></Button>
                                </div>
                            </div>
                            <div className="flex justify-center sm:justify-end">
                                <Button onClick={handleDownloadPdf} disabled={monthlyReportData.length === 0 || isLoading || isMutating} className="w-full sm:w-auto font-normal bg-primary hover:bg-primary/90 h-11 rounded-xl text-xs uppercase tracking-wider">
                                    {isLoading || isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}UNDUH PDF
                                </Button>
                            </div>
                        </div>

                        <div className="border-t border-muted-foreground/10 overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="border-none">
                                        <TableHead className="w-[60px] text-center font-bold text-[10px] uppercase tracking-widest">No</TableHead>
                                        <TableHead className="w-[200px] font-bold text-[10px] uppercase tracking-widest">Tanggal</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest">Masuk</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest">Pulang</TableHead>
                                        <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest">Status</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest">Keterangan</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        [...Array(8)].map((_, i) => (
                                            <TableRow key={i} className="border-muted-foreground/5">
                                                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                                <TableCell><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : monthlyReportData.length > 0 ? (
                                        monthlyReportData.map((item, index) => {
                                            const isAlpa = item.status === 'Alpa';
                                            const hasIn = !!item.checkInTime;
                                            const hasOut = !!item.checkOutTime;

                                            return (
                                                <TableRow key={item.id} className={cn("border-muted-foreground/5 hover:bg-muted/20 transition-colors", isAlpa && "bg-destructive/5")}>
                                                    <TableCell className='text-center font-bold text-muted-foreground text-sm'>{index + 1}</TableCell>
                                                    <TableCell className="whitespace-nowrap font-bold text-sm">{safeFormat(item.date, 'eeee, dd MMM yyyy')}</TableCell>
                                                    <TableCell className='text-center font-mono text-xs font-bold'>{safeFormat(item.checkInTime, 'HH:mm:ss')}</TableCell>
                                                    <TableCell className='text-center font-mono text-xs font-bold'>{safeFormat(item.checkOutTime, 'HH:mm:ss')}</TableCell>
                                                    <TableCell className="text-center">
                                                        {isAdmin && (isAlpa || !hasOut) ? (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="outline" size="sm" className={cn("font-bold text-[9px] h-7 rounded-lg shadow-none", isAlpa ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200')}>
                                                                        {isAlpa ? 'Alpa' : 'Hadir'} <MoreVertical className="h-3 w-3 ml-1" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-xl border-none p-2">
                                                                    <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2 opacity-50">{hasIn ? 'Koreksi Pulang' : 'Koreksi Hadir'}</DropdownMenuLabel>
                                                                    <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleSetHadir(item)}>{hasIn ? 'Lengkapi absen pulang' : 'Jadikan Hadir'}</DropdownMenuItem>
                                                                    {!hasIn && <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleSetLate(item)}>Set Terlambat</DropdownMenuItem>}
                                                                    <DropdownMenuSeparator className='my-1.5 opacity-50' />
                                                                    <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2 opacity-50">Ubah Status</DropdownMenuLabel>
                                                                    {!hasIn && (
                                                                        <>
                                                                            <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleStatusChange(item.date, 'Sakit', 'Sakit')}>Sakit</DropdownMenuItem>
                                                                            <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleStatusChange(item.date, 'Izin Pribadi', 'Izin Pribadi')}>Izin</DropdownMenuItem>
                                                                            <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleStatusChange(item.date, 'Dinas Pagi', 'Dinas Pagi')}>Dinas Pagi</DropdownMenuItem>
                                                                        </>
                                                                    )}
                                                                    <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleStatusChange(item.date, 'Dinas Siang', 'Dinas Siang')}>Dinas Siang</DropdownMenuItem>
                                                                    <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleStatusChange(item.date, 'Pulang Cepat', 'Pulang Cepat')}>Pulang Cepat</DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        ) : (
                                                            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold", item.status === 'Hadir' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                                                                {item.status}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-[11px] text-muted-foreground font-bold italic">{item.description || '-'}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : <TableRow><TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-bold">Tidak ada data untuk periode ini.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function subMonths(date: Date, amount: number) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - amount);
    return d;
}

function addMonths(date: Date, amount: number) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + amount);
    return d;
}
