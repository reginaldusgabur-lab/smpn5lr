
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc, writeBatch, collection, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { format, isValid, parseISO, startOfDay, endOfDay, addMinutes, isSameDay, setHours, setMinutes, isBefore, isSameMonth, startOfMonth, endOfMonth } from 'date-fns';
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
    if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
    } else if (dateInput.toDate) {
        date = dateInput.toDate();
    } else {
        date = new Date(dateInput);
    }
    return isValid(date) ? format(date, formatString, { locale: id }) : '-';
};

const getRandomTime = (baseDate: Date, startTimeStr: string, endTimeStr: string): Date => {
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const startDate = new Date(baseDate.getTime());
    startDate.setHours(startH, startM, 0, 0);
    const endDate = new Date(baseDate.getTime());
    endDate.setHours(endH, endM, 0, 0);
    
    if (endDate.getTime() <= startDate.getTime()) {
        endDate.setDate(endDate.getDate() + 1);
    }
    
    const randomTimestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
    const res = new Date(randomTimestamp);
    res.setSeconds(Math.floor(Math.random() * 60));
    return res;
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
            console.error("Fetch Data Error:", err);
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

    const changeMonth = (amount: number) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
    };

    const handleStatusChange = async (dateStr: string, newStatus: string, reason: string) => {
        if (!currentUser || !firestore || isMutating || !schoolConfigData) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(dateStr);
            const batch = writeBatch(firestore);
            const now = new Date();
            const isPast = isBefore(startOfDay(targetDate), startOfDay(now));
            
            if (newStatus === 'Dinas Pagi' || newStatus === 'Dinas Siang' || newStatus === 'Pulang Cepat') {
                const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
                const q = query(attendanceRef, where('date', '==', format(targetDate, 'yyyy-MM-dd')));
                const snap = await getDocs(q);
                
                const inStart = schoolConfigData.checkInStartTime || '07:00';
                const inEnd = schoolConfigData.checkInEndTime || '07:30';
                const outStart = schoolConfigData.checkOutStartTime || '14:00';
                const outEnd = schoolConfigData.checkOutEndTime || '16:00';
                
                let realInTime: Date | null = null;
                let realOutTime: Date | null = null;

                if (newStatus === 'Dinas Pagi') {
                    realInTime = null;
                    realOutTime = getRandomTime(targetDate, outStart, outEnd);
                } else if (newStatus === 'Dinas Siang') {
                    realInTime = getRandomTime(targetDate, inStart, inEnd);
                    realOutTime = null;
                } else if (newStatus === 'Pulang Cepat') {
                    realInTime = getRandomTime(targetDate, inStart, inEnd);
                    realOutTime = null;
                }

                const dataToSave = {
                    userId, date: format(targetDate, 'yyyy-MM-dd'),
                    checkInTime: realInTime ? Timestamp.fromDate(realInTime) : null, 
                    checkOutTime: realOutTime ? Timestamp.fromDate(realOutTime) : null,
                    manualEntry: true, reasonForUpdate: reason,
                    updatedBy: currentUser.uid, updatedAt: serverTimestamp()
                };

                if (!snap.empty) {
                    batch.update(snap.docs[0].ref, dataToSave);
                } else {
                    batch.set(doc(attendanceRef), dataToSave);
                }
            } else {
                const leaveRef = collection(firestore, 'users', userId, 'leaveRequests');
                const newLeaveDoc = doc(leaveRef);
                batch.set(newLeaveDoc, {
                    userId, type: newStatus === 'Izin Pribadi' ? 'Izin' : newStatus, status: 'approved',
                    reason: reason, startDate: Timestamp.fromDate(startOfDay(targetDate)),
                    endDate: Timestamp.fromDate(endOfDay(targetDate)), createdAt: serverTimestamp(),
                    approvedBy: currentUser.uid, approvedAt: serverTimestamp(), createdBy: currentUser.uid,
                });
            }

            await batch.commit();
            invalidateCache();
            toast({ title: 'Berhasil', description: `Status diperbarui menjadi ${reason}.` });
            fetchData();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan sistem.' });
        } finally {
            setIsMutating(false);
        }
    };

    const handleSetLate = async (dateStr: string) => {
        if (!currentUser || !firestore || !schoolConfigData || isMutating) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(dateStr);
            const now = new Date();
            const isPast = isBefore(startOfDay(targetDate), startOfDay(now));

            const inEnd = schoolConfigData.checkInEndTime || '08:00';
            const [endH, endM] = inEnd.split(':').map(Number);
            const baseLateTime = new Date(targetDate);
            baseLateTime.setHours(endH, endM, 0);
            const realInTime = addMinutes(baseLateTime, Math.floor(Math.random() * 15) + 1);

            const outStart = schoolConfigData.checkOutStartTime || '14:00';
            const outEnd = schoolConfigData.checkOutEndTime || '15:00';
            const realOutTime = isPast ? getRandomTime(targetDate, outStart, outEnd) : null;

            const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
            const q = query(attendanceRef, where('date', '==', format(targetDate, 'yyyy-MM-dd')));
            const snap = await getDocs(q);

            const data = {
                userId, date: format(targetDate, 'yyyy-MM-dd'),
                checkInTime: Timestamp.fromDate(realInTime),
                checkOutTime: realOutTime ? Timestamp.fromDate(realOutTime) : null,
                manualEntry: true, reasonForUpdate: 'Terlambat',
                updatedBy: currentUser.uid, updatedAt: serverTimestamp()
            };

            if (!snap.empty) {
                await writeBatch(firestore).update(snap.docs[0].ref, data).commit();
            } else {
                await writeBatch(firestore).set(doc(attendanceRef), data).commit();
            }

            invalidateCache();
            toast({ title: 'Berhasil', description: 'Ditandai sebagai terlambat.' });
            fetchData();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal memperbarui data.' });
        } finally {
            setIsMutating(false);
        }
    };

    const handleSetHadir = async (dateStr: string) => {
        if (!currentUser || !firestore || !schoolConfigData || isMutating) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(dateStr);
            const now = new Date();
            const isPast = isBefore(startOfDay(targetDate), startOfDay(now));

            const inStart = schoolConfigData.checkInStartTime || '07:00';
            const inEnd = schoolConfigData.checkInEndTime || '07:30';
            const checkInTime = getRandomTime(targetDate, inStart, inEnd);

            const outStart = schoolConfigData.checkOutStartTime || '14:00';
            const outEnd = schoolConfigData.checkOutEndTime || '16:00';
            
            const [outH, outM] = outStart.split(':').map(Number);
            const checkoutStartTimeToday = setMinutes(setHours(startOfDay(targetDate), outH), outM);
            const shouldFillCheckout = isPast || now >= checkoutStartTimeToday;
            
            const checkOutTime = shouldFillCheckout ? getRandomTime(targetDate, outStart, outEnd) : null;

            const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
            const q = query(attendanceRef, where('date', '==', format(targetDate, 'yyyy-MM-dd')));
            const snap = await getDocs(q);

            const batch = writeBatch(firestore);
            const dataToSave = {
                userId: userId, date: format(targetDate, 'yyyy-MM-dd'),
                checkInTime: Timestamp.fromDate(checkInTime), 
                checkOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : null,
                manualEntry: true,
                reasonForUpdate: 'Kehadiran penuh',
                updatedBy: currentUser.uid,
                updatedAt: serverTimestamp()
            };

            if (!snap.empty) {
                batch.update(snap.docs[0].ref, dataToSave);
            } else {
                batch.set(doc(attendanceRef), dataToSave);
            }

            await batch.commit();
            invalidateCache();
            toast({ title: 'Berhasil', description: 'Ditandai sebagai hadir.' });
            fetchData();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan.' });
        } finally {
            setIsMutating(false);
        }
    };

    const handleDownloadPdf = () => {
        if (!userData || monthlyReportData.length === 0) return;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const centerX = pageWidth / 2;
        const margin = 14;
        const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });
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
        doc.text(`LAPORAN KEHADIRAN INDIVIDU BULAN ${monthName.toUpperCase()}`, centerX, currentY, { align: 'center' });
        currentY += 15;

        doc.setFontSize(10).setFont('times', 'normal');
        doc.text(`Nama`, margin, currentY);
        doc.text(`: ${userData.name}`, margin + 40, currentY);
        currentY += 6;
        doc.text(`NIP`, margin, currentY);
        doc.text(`: ${userData.nip || '-'}`, margin + 40, currentY);
        currentY += 6;
        doc.text(`Jabatan / Status`, margin, currentY);
        
        const displayRole = userData.role.replace('_', ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        doc.text(`: ${displayRole} / ${userData.position || '-'}`, margin + 40, currentY);
        currentY += 10;

        const tableRows = monthlyReportData.map((item, index) => [
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

        let signY = (doc as any).lastAutoTable.finalY + 15;
        if (signY > pageHeight - 65) { doc.addPage(); signY = 20; }

        const signatureX = pageWidth - 80;
        doc.setFontSize(10).setFont('times', 'normal');
        doc.text(`${config.reportCity || 'Mando'}, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureX, signY);
        doc.text('Mengetahui,', signatureX, signY + 6);
        doc.text('Kepala Sekolah', signatureX, signY + 12);
        doc.setFont('times', 'bold');
        doc.text(config.headmasterName || 'Lodovikus Jangkar, S.Pd.Gr', signatureX, signY + 38);
        doc.setFont('times', 'normal');
        doc.text(`NIP. ${config.headmasterNip || '198507272011011020'}`, signatureX, signY + 44);

        doc.save(`Laporan_Individu_${userData.name.replace(/\s+/g, '_')}_${monthName.replace(' ', '_')}.pdf`);
    };

    const isAdmin = currentUser?.role === 'admin';

    const canGoNext = useMemo(() => !isSameMonth(currentMonth, new Date()), [currentMonth]);
    const canGoPrev = useMemo(() => {
        const minDate = new Date(2026, 0, 1);
        return currentMonth > minDate;
    }, [currentMonth]);

    return (
        <div className="flex-1 pt-2 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="px-4 md:px-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 shadow-none" onClick={() => router.back()}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-2xl font-black tracking-tight">Detail Laporan Kehadiran</h1>
                    </div>
                    <div className="h-6 flex items-center">
                        {!userData ? <Skeleton className="h-4 w-64 ml-8 sm:ml-0" /> : <p className="text-muted-foreground ml-8 sm:ml-0 font-bold text-xs">Laporan harian untuk {userData.name}.</p>}
                    </div>
                </div>

                <Card className="overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl">
                    <CardContent className="p-0">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center gap-4 py-2">
                                <div className="flex items-center bg-muted/40 rounded-2xl border border-muted-foreground/5 p-1 shrink-0">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-10 w-10 rounded-xl hover:bg-background/50 shadow-none shrink-0" 
                                        onClick={() => changeMonth(-1)} 
                                        disabled={isLoading || !canGoPrev}
                                    >
                                        <ChevronLeft className="h-5 w-5 text-primary" />
                                    </Button>
                                    
                                    <div className="flex items-center gap-3 px-4">
                                        {stats && (
                                            <div className="flex items-center gap-1.5 pr-3 border-r border-muted-foreground/20">
                                                <TrendingUp className="h-4 w-4 text-primary" />
                                                <span className="text-sm font-black text-primary">{stats.persentase}</span>
                                            </div>
                                        )}
                                        <span className="font-black text-xl text-primary tracking-tight text-center capitalize whitespace-nowrap min-w-[120px]">
                                            {format(currentMonth, 'MMMM yyyy', { locale: id })}
                                        </span>
                                    </div>

                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-10 w-10 rounded-xl hover:bg-background/50 shadow-none shrink-0" 
                                        onClick={() => changeMonth(1)} 
                                        disabled={isLoading || !canGoNext}
                                    >
                                        <ChevronRight className="h-5 w-5 text-primary" />
                                    </Button>
                                </div>
                            </div>
                            <div className="flex justify-center sm:justify-end">
                                <Button onClick={handleDownloadPdf} disabled={monthlyReportData.length === 0 || isLoading || isMutating} className="w-full sm:w-auto font-black bg-primary hover:bg-primary/90 shadow-none h-11 rounded-xl text-xs uppercase tracking-wider">
                                    {isLoading || isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Unduh PDF
                                </Button>
                            </div>
                        </div>

                        <div className="border-t border-muted-foreground/10">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="border-none">
                                            <TableHead className="w-[60px] text-center font-bold text-xs uppercase tracking-widest">No</TableHead>
                                            <TableHead className="w-[200px] font-bold text-xs uppercase tracking-widest">Tanggal</TableHead>
                                            <TableHead className="text-center font-bold text-xs uppercase tracking-widest">Masuk</TableHead>
                                            <TableHead className="text-center font-bold text-xs uppercase tracking-widest">Pulang</TableHead>
                                            <TableHead className="text-center font-bold text-xs uppercase tracking-widest">Status</TableHead>
                                            <TableHead className="font-bold text-xs uppercase tracking-widest">Keterangan</TableHead>
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
                                        ) : error ? (
                                            <TableRow><TableCell colSpan={6} className="h-48 text-center text-destructive font-bold"><AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>{error}</p></TableCell></TableRow>
                                        ) : monthlyReportData.length > 0 ? (
                                            monthlyReportData.map((item, index) => (
                                                <TableRow key={item.id} className={cn("border-muted-foreground/5 hover:bg-muted/20 transition-colors", item.status === 'Alpa' && "bg-destructive/5")}>
                                                    <TableCell className='text-center font-bold text-muted-foreground text-sm'>{index + 1}</TableCell>
                                                    <TableCell className="whitespace-nowrap font-bold text-sm">{safeFormat(item.date, 'eeee, dd MMM yyyy')}</TableCell>
                                                    <TableCell className='text-center font-mono text-xs font-bold'>{safeFormat(item.checkInTime, 'HH:mm:ss')}</TableCell>
                                                    <TableCell className='text-center font-mono text-xs font-bold'>{safeFormat(item.checkOutTime, 'HH:mm:ss')}</TableCell>
                                                    <TableCell className="text-center">
                                                        {isAdmin && (item.status === 'Alpa' || item.description === 'Tidak absen pulang' || item.description === 'Belum absen pulang') ? (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="outline" size="sm" className={cn("font-bold text-[9px] h-7 rounded-lg shadow-none", item.status === 'Alpa' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200')}>
                                                                        {item.status === 'Alpa' ? 'Alpa' : 'Hadir'} <MoreVertical className="h-3 w-3 ml-1" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl border-none p-2">
                                                                    <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleSetHadir(item.date)}>Jadikan Hadir</DropdownMenuItem>
                                                                    <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleSetLate(item.date)}>Set Terlambat</DropdownMenuItem>
                                                                    <DropdownMenuSeparator className='my-1 opacity-50' />
                                                                    <DropdownMenuItem className="text-xs font-bold rounded-lg" onClick={() => handleStatusChange(item.date, 'Sakit', 'Sakit')}>Sakit</DropdownMenuItem>
                                                                    <DropdownMenuItem className="text-xs font-bold rounded-lg" onClick={() => handleStatusChange(item.date, 'Izin Pribadi', 'Izin Pribadi')}>Izin Pribadi</DropdownMenuItem>
                                                                    <DropdownMenuItem className="text-xs font-bold rounded-lg" onClick={() => handleStatusChange(item.date, 'Dinas Pagi', 'Dinas Pagi')}>Dinas Pagi</DropdownMenuItem>
                                                                    <DropdownMenuItem className="text-xs font-bold rounded-lg" onClick={() => handleStatusChange(item.date, 'Dinas Siang', 'Dinas Siang')}>Dinas Siang</DropdownMenuItem>
                                                                    <DropdownMenuItem className="text-xs font-bold rounded-lg" onClick={() => handleStatusChange(item.date, 'Pulang Cepat', 'Pulang Cepat')}>Pulang Cepat</DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        ) : (
                                                            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold", 
                                                                item.status === 'Hadir' ? 'bg-green-100 text-green-700' : 
                                                                item.status === 'Alpa' ? 'bg-red-100 text-red-700' : 
                                                                'bg-blue-100 text-blue-700' 
                                                            )}>
                                                                {item.status}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-[11px] text-muted-foreground font-bold italic">{item.description || '-'}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : <TableRow><TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-bold">Tidak ada data untuk periode ini.</TableCell></TableRow>}
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

