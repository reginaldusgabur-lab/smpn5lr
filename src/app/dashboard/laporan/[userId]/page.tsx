
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc, writeBatch, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, isValid, parseISO, startOfDay, endOfDay, addMinutes, isSameDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchUserMonthlyReportData, type MonthlyReportData } from '@/lib/attendance';
import { Download, ChevronLeft, ChevronRight, AlertCircle, ArrowLeft, Loader2, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

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
    
    const startTs = startDate.getTime();
    const endTs = endDate.getTime();
    const randomTimestamp = startTs + Math.random() * (endTs - startTs);
    
    const res = new Date(randomTimestamp);
    res.setSeconds(Math.floor(Math.random() * 60));
    return res;
};

export default function UserReportDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user: currentUser, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const userId = params.userId as string;

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMutating, setIsMutating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(currentUser, schoolConfigRef);

    const fetchData = async () => {
        if (!firestore || !userId || !schoolConfigData || !currentUser) return;
        setIsLoading(true);
        setError(null);
        try {
            const userRef = doc(firestore, 'users', userId);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) throw new Error('Pengguna tidak ditemukan.');
            setUserData(userSnap.data());
            const reportData = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfigData);
            setMonthlyReportData(reportData);
        } catch (err: any) {
            setError(err.message || 'Gagal memuat data laporan.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [firestore, userId, currentMonth, schoolConfigData, currentUser]);

    const changeMonth = (amount: number) => {
        setIsLoading(true);
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
    };

    const handleStatusChange = async (dateStr: string, newStatus: string, reason: string) => {
        if (!currentUser || !firestore || isMutating) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(dateStr);
            const batch = writeBatch(firestore);
            
            if (newStatus === 'Pulang Cepat') {
                const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
                const newDocRef = doc(attendanceRef);
                const inStart = schoolConfigData?.checkInStartTime || '07:00';
                const inEnd = schoolConfigData?.checkInEndTime || '07:30';
                const realInTime = getRandomTime(targetDate, inStart, inEnd);

                batch.set(newDocRef, {
                    userId,
                    date: dateStr,
                    checkInTime: Timestamp.fromDate(realInTime),
                    checkOutTime: null,
                    manualEntry: true,
                    reasonForUpdate: 'Pulang Cepat',
                    updatedBy: currentUser.uid,
                    updatedAt: serverTimestamp()
                });
            } else {
                const leaveRef = collection(firestore, 'users', userId, 'leaveRequests');
                const newLeaveDoc = doc(leaveRef);
                batch.set(newLeaveDoc, {
                    userId,
                    type: newStatus === 'Izin Pribadi' ? 'Izin' : newStatus,
                    status: 'approved',
                    reason: reason,
                    startDate: Timestamp.fromDate(startOfDay(targetDate)),
                    endDate: Timestamp.fromDate(endOfDay(targetDate)),
                    createdAt: serverTimestamp(),
                    approvedBy: currentUser.uid,
                    approvedAt: serverTimestamp(),
                    createdBy: currentUser.uid,
                });
            }

            await batch.commit();
            toast({ title: 'Berhasil', description: `Status berhasil diubah menjadi ${reason}.` });
            fetchData();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan saat mengubah status.' });
        } finally {
            setIsMutating(false);
        }
    };

    const handleSetLate = async (dateStr: string) => {
        if (!currentUser || !firestore || !schoolConfigData || isMutating) return;
        setIsMutating(true);
        try {
            const targetDate = parseISO(dateStr);
            const inEnd = schoolConfigData.checkInEndTime || '08:00';
            
            const [endH, endM] = inEnd.split(':').map(Number);
            const baseLateTime = new Date(targetDate);
            baseLateTime.setHours(endH, endM, 0);
            const realInTime = addMinutes(baseLateTime, Math.floor(Math.random() * 10) + 1);

            const outStart = schoolConfigData.checkOutStartTime || '14:00';
            const outEnd = schoolConfigData.checkOutEndTime || '15:00';
            const realOutTime = isSameDay(targetDate, new Date()) ? null : getRandomTime(targetDate, outStart, outEnd);

            const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
            const newDocRef = doc(attendanceRef);
            
            await writeBatch(firestore)
                .set(newDocRef, {
                    userId,
                    date: dateStr,
                    checkInTime: Timestamp.fromDate(realInTime),
                    checkOutTime: realOutTime ? Timestamp.fromDate(realOutTime) : null,
                    manualEntry: true,
                    reasonForUpdate: 'Terlambat',
                    updatedBy: currentUser.uid,
                    updatedAt: serverTimestamp()
                })
                .commit();

            toast({ title: 'Berhasil', description: 'Kehadiran ditandai sebagai terlambat.' });
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
            const inStart = schoolConfigData.checkInStartTime || '07:00';
            const inEnd = schoolConfigData.checkInEndTime || '07:30';
            const outStart = schoolConfigData.checkOutStartTime || '14:00';
            const outEnd = schoolConfigData.checkOutEndTime || '15:00';

            const checkInTime = getRandomTime(targetDate, inStart, inEnd);
            const checkOutTime = isSameDay(targetDate, new Date()) ? null : getRandomTime(targetDate, outStart, outEnd);

            const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
            const newDocRef = doc(attendanceRef);
            
            await writeBatch(firestore)
                .set(newDocRef, {
                    userId,
                    date: dateStr,
                    checkInTime: Timestamp.fromDate(checkInTime),
                    checkOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : null,
                    manualEntry: true,
                    reasonForUpdate: 'Kehadiran Penuh',
                    updatedBy: currentUser.uid,
                    updatedAt: serverTimestamp()
                })
                .commit();

            toast({ title: 'Berhasil', description: 'Kehadiran ditandai sebagai Hadir.' });
            fetchData();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal memperbarui data.' });
        } finally {
            setIsMutating(false);
        }
    };

    const handleDownloadPdf = () => {
        if (!userData || monthlyReportData.length === 0) return;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const center = pageWidth / 2;
        const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

        doc.setFont('times', 'bold').setFontSize(14);
        doc.text('LAPORAN KEHADIRAN INDIVIDU', center, 20, { align: 'center' });
        doc.setFont('times', 'normal').setFontSize(11);
        doc.text(`Periode: ${monthName}`, center, 28, { align: 'center' });
        doc.text(`Nama: ${userData.name}`, 14, 40);
        doc.text(`NIP: ${userData.nip || '-'}`, 14, 46);
        doc.text(`Posisi: ${userData.position || '-'}`, 14, 52);

        const tableRows = monthlyReportData.map((item, index) => [
            index + 1,
            safeFormat(item.date, 'eeee, dd MMMM yyyy'),
            safeFormat(item.checkInTime, 'HH:mm:ss'),
            safeFormat(item.checkOutTime, 'HH:mm:ss'),
            item.status,
            item.description || '-'
        ]);

        autoTable(doc, {
            startY: 60,
            head: [['No', 'Tanggal', 'Masuk', 'Pulang', 'Status', 'Keterangan']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { font: 'times', fontSize: 9 }
        });
        doc.save(`Laporan_${userData.name}_${monthName}.pdf`);
    };

    const isAdmin = currentUser?.role === 'admin';

    return (
        <div className="flex-1 pt-4 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="px-4 md:px-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => router.back()}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Detail Laporan Kehadiran</h1>
                    </div>
                    <div className="h-6 flex items-center">
                        {!userData && (isUserLoading || isConfigLoading || isLoading) ? (
                            <Skeleton className="h-4 w-64 ml-8 sm:ml-0" />
                        ) : (
                            <p className="text-muted-foreground ml-8 sm:ml-0">
                                Laporan harian untuk <span className='font-semibold text-foreground'>{userData?.name || 'Pengguna'}</span>.
                            </p>
                        )}
                    </div>
                </div>

                <Card className="overflow-hidden border shadow-sm">
                    <CardContent className="p-0 sm:p-6">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center gap-4 py-2">
                                <div className="flex items-center gap-4">
                                    <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} disabled={isLoading}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="w-40 text-center font-bold text-lg">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                                    <Button variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={isLoading || (currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear())}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="w-full h-px bg-border mt-2" />
                            </div>
                            <div className="flex justify-center sm:justify-end">
                                <Button onClick={handleDownloadPdf} disabled={monthlyReportData.length === 0 || isLoading || isMutating} className="w-full sm:w-auto font-semibold">
                                    {isLoading || isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Unduh Laporan PDF
                                </Button>
                            </div>
                        </div>

                        <div className="border-t">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-[60px] text-center font-bold">No</TableHead>
                                            <TableHead className="w-[200px] font-bold">Tanggal</TableHead>
                                            <TableHead className="text-center font-bold">Jam Masuk</TableHead>
                                            <TableHead className="text-center font-bold">Jam Pulang</TableHead>
                                            <TableHead className="text-center font-bold">Status</TableHead>
                                            <TableHead className="font-bold">Keterangan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            [...Array(8)].map((_, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="text-center"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                    <TableCell className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                                    <TableCell className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                                                    <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : error ? (
                                            <TableRow><TableCell colSpan={6} className="h-48 text-center text-destructive"><AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>{error}</p></TableCell></TableRow>
                                        ) : monthlyReportData.length > 0 ? (
                                            monthlyReportData.map((item, index) => (
                                                <TableRow key={item.id} className={`${item.status === 'Alpa' ? 'bg-destructive/5' : ''}`}>
                                                    <TableCell className='text-center font-medium'>{index + 1}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{safeFormat(item.date, 'eeee, dd MMM yyyy')}</TableCell>
                                                    <TableCell className='text-center font-mono text-sm'>{safeFormat(item.checkInTime, 'HH:mm:ss')}</TableCell>
                                                    <TableCell className='text-center font-mono text-sm'>{safeFormat(item.checkOutTime, 'HH:mm:ss')}</TableCell>
                                                    <TableCell className="text-center">
                                                        {isAdmin && item.status === 'Alpa' ? (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="outline" size="sm" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-bold">
                                                                        Alpa <MoreVertical className="h-3 w-3 ml-1" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-48">
                                                                    <DropdownMenuLabel>Ubah Kehadiran</DropdownMenuLabel>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => handleSetHadir(item.date)}>Hadir (Full)</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleSetLate(item.date)}>Set Terlambat</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusChange(item.date, 'Pulang Cepat', 'Pulang Cepat')}>Pulang Cepat</DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => handleStatusChange(item.date, 'Sakit', 'Sakit')}>Sakit</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusChange(item.date, 'Izin Pribadi', 'Izin Pribadi')}>Izin Pribadi</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusChange(item.date, 'Dinas', 'Dinas Pagi')}>Dinas Pagi</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusChange(item.date, 'Dinas', 'Dinas Siang')}>Dinas Siang</DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        ) : (
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${ 
                                                                item.status === 'Hadir' ? 'bg-green-100 text-green-700' : 
                                                                item.status === 'Alpa' ? 'bg-red-100 text-red-700' : 
                                                                'bg-orange-100 text-orange-700' 
                                                            }`}>
                                                                {item.status}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground italic">{item.description || '-'}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={6} className="h-48 text-center text-muted-foreground">Tidak ada data untuk periode ini.</TableCell></TableRow>
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
