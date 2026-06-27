'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { format, startOfMonth, isValid, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchUserMonthlyReportData, type MonthlyReportData } from '@/lib/attendance';
import { Download, ChevronLeft, ChevronRight, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

// Helper to safely format dates that might be Timestamps or ISO strings
const safeFormat = (dateInput: any, formatString: string): string => {
    if (!dateInput) return '-';
    let date: Date;
    if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
    } else if (dateInput.toDate) { // Handle Firebase Timestamp
        date = dateInput.toDate();
    } else {
        date = new Date(dateInput);
    }
    return isValid(date) ? format(date, formatString, { locale: id }) : '-';
};


export default function UserReportDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user: currentUser, isUserLoading } = useUser();
    const firestore = useFirestore();
    const userId = params.userId as string;

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(currentUser, schoolConfigRef);

    useEffect(() => {
        if (!firestore || !userId || !schoolConfigData || !currentUser) return;
        
        if (!['admin', 'kepala_sekolah'].includes(currentUser.role)) return;

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const userRef = doc(firestore, 'users', userId);
                const userSnap = await getDoc(userRef);
                if (!userSnap.exists()) {
                    throw new Error('Pengguna tidak ditemukan.');
                }
                setUserData(userSnap.data());

                const reportData = await fetchUserMonthlyReportData(firestore, userId, currentMonth, schoolConfigData);
                setMonthlyReportData(reportData);

            } catch (err: any) {
                console.error("Error fetching user report detail:", err);
                setError(err.message || 'Gagal memuat data laporan pengguna.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [firestore, userId, currentMonth, schoolConfigData, currentUser]);

    const changeMonth = (amount: number) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
    };

    const handleDownloadPdf = () => {
        if (!userData || monthlyReportData.length === 0) return;
        
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const center = pageWidth / 2;
        const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

        // Header PDF
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        doc.text('LAPORAN KEHADIRAN INDIVIDU', center, 20, { align: 'center' });
        
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
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

    const pageIsLoading = isUserLoading || isConfigLoading;

    if (!isUserLoading && currentUser && !['admin', 'kepala_sekolah'].includes(currentUser.role)) {
        return (
             <div className="p-4 md:p-8">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Akses Ditolak</AlertTitle>
                    <AlertDescription>Anda tidak memiliki izin untuk melihat halaman ini.</AlertDescription>
                </Alert>
            </div>
        );
    }

    const monthName = format(currentMonth, 'MMMM yyyy', { locale: id });

    return (
        <div className="flex-1 pt-4 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* --- HEADER SECTION --- */}
                <div className="px-4 md:px-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => router.back()}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Detail Laporan Kehadiran</h1>
                    </div>
                    {pageIsLoading && !userData ? (
                         <Skeleton className="h-4 w-64 ml-8 sm:ml-0 mt-1" />
                    ) : (
                        <p className="text-muted-foreground ml-8 sm:ml-0">
                            Laporan kehadiran harian untuk <span className='font-semibold text-foreground'>{userData?.name || 'Pengguna'}</span>.
                        </p>
                    )}
                </div>

                {/* --- MAIN CARD --- */}
                <Card className="overflow-hidden border shadow-sm">
                    <CardContent className="p-0 sm:p-6">
                        
                        {/* Navigasi Bulan & Divider */}
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center gap-4 py-2">
                                <div className="flex items-center gap-4">
                                    <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} disabled={currentMonth.getFullYear() === 2026 && currentMonth.getMonth() === 0}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="w-40 text-center font-bold text-lg">{monthName}</span>
                                    <Button variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="w-full h-px bg-border mt-2" />
                            </div>

                            {/* Tombol Aksi */}
                            <div className="flex justify-center sm:justify-end">
                                <Button onClick={handleDownloadPdf} disabled={monthlyReportData.length === 0 || isLoading} className="w-full sm:w-auto font-semibold">
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Unduh Laporan PDF
                                </Button>
                            </div>
                        </div>

                        {/* Tabel Data */}
                        <div className="border-t">
                            {(pageIsLoading || isLoading) ? (
                                <div className="p-4 space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                            ) : error ? (
                                <div className="p-10 text-center text-destructive">
                                    <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                    <p>{error}</p>
                                </div>
                            ) : (
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
                                            {monthlyReportData.length > 0 ? (
                                                monthlyReportData.map((item, index) => (
                                                    <TableRow key={item.id} className={`${item.status === 'Alpa' ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/20'} transition-colors`}>
                                                        <TableCell className='text-center font-medium'>{index + 1}</TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            {safeFormat(item.date, 'eeee, dd MMM yyyy')}
                                                        </TableCell>
                                                        <TableCell className='text-center font-mono text-sm'>
                                                            {safeFormat(item.checkInTime, 'HH:mm:ss')}
                                                        </TableCell>
                                                        <TableCell className='text-center font-mono text-sm'>
                                                            {safeFormat(item.checkOutTime, 'HH:mm:ss')}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${ 
                                                                item.status === 'Hadir' ? 'bg-green-100 text-green-700' : 
                                                                item.status === 'Alpa' ? 'bg-red-100 text-red-700' : 
                                                                ['Sakit', 'Izin', 'Dinas'].includes(item.status) ? 'bg-orange-100 text-orange-700' : 
                                                                'bg-gray-100 text-gray-700' 
                                                            }`}>
                                                                {item.status}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground italic">
                                                            {item.description || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                                                        Tidak ada data kehadiran untuk ditampilkan pada periode ini.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
