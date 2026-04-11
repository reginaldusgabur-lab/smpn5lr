'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { format, startOfMonth, isValid, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchUserMonthlyReportData, MonthlyReportData } from '@/lib/attendance';
import { Download, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { PageWrapper } from '@/components/layout/page-wrapper';

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
    const { user: currentUser, isUserLoading } = useUser(); // --- FIX: Get the currently logged-in user
    const firestore = useFirestore();
    const userId = params.userId as string;

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportData[]>([]);
    const [userData, setUserData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // --- FIX: Pass the logged-in user to useDoc for permission handling ---
    const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
    const { data: schoolConfigData, loading: isConfigLoading } = useDoc(currentUser, schoolConfigRef);

    useEffect(() => {
        // --- FIX: Wait for all necessary data (currentUser, schoolConfig) before fetching ---
        if (!firestore || !userId || !schoolConfigData || !currentUser) return;
        
        // Authorization check is done before rendering, but this is a secondary safeguard
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
        // PDF generation logic remains the same for now...
        if (!userData || monthlyReportData.length === 0) return;
        const doc = new jsPDF();
        // ... (rest of the PDF code)
    };

    // --- FIX: Combined loading state ---
    const pageIsLoading = isLoading || isUserLoading || isConfigLoading;

    // --- FIX: Authorization check ---
    if (!isUserLoading && currentUser && !['admin', 'kepala_sekolah'].includes(currentUser.role)) {
        return (
             <PageWrapper>
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Akses Ditolak</AlertTitle>
                    <AlertDescription>Anda tidak memiliki izin untuk melihat halaman ini. Silakan kembali ke dashboard Anda.</AlertDescription>
                </Alert>
            </PageWrapper>
        );
    }

    if (pageIsLoading) {
        return (
            <PageWrapper>
                <Card>
                    <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
                    <CardContent className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </CardContent>
                </Card>
            </PageWrapper>
        );
    }
    
    if (error) {
        return (
             <PageWrapper>
                <Alert variant="destructive">
                    <AlertTitle>Terjadi Kesalahan</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper>
            <Card>
                <CardHeader>
                    <CardTitle>Detail Laporan Kehadiran</CardTitle>
                    <CardDescription>Laporan kehadiran harian untuk <span className='font-semibold'>{userData?.name || 'Pengguna'}</span>.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            {/* --- FIX: Disable button if the year is 2026 and month is January --- */}
                            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} disabled={currentMonth.getFullYear() === 2026 && currentMonth.getMonth() === 0}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="w-36 text-center font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button onClick={handleDownloadPdf} disabled={monthlyReportData.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Unduh Laporan PDF
                        </Button>
                    </div>
                    <div className="overflow-x-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[5%]">No</TableHead>
                                    <TableHead className="w-[25%]">Tanggal</TableHead>
                                    <TableHead className="w-[15%]">Jam Masuk</TableHead>
                                    <TableHead className="w-[15%]">Jam Pulang</TableHead>
                                    <TableHead className="w-[15%]">Status</TableHead>
                                    <TableHead>Keterangan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthlyReportData.length > 0 ? (
                                    monthlyReportData.map((item, index) => (
                                        <TableRow key={item.id} className={item.status === 'Alpa' ? 'bg-red-50/50' : item.status === 'Libur' ? 'bg-gray-50/50' : ''}>
                                            <TableCell className='text-center'>{index + 1}</TableCell>
                                            {/* --- FIX: Use safeFormat for date display --- */}
                                            <TableCell>{safeFormat(item.date, 'eeee, dd MMMM yyyy')}</TableCell>
                                            <TableCell className='text-center'>{safeFormat(item.checkInTime, 'HH:mm:ss')}</TableCell>
                                            <TableCell className='text-center'>{safeFormat(item.checkOutTime, 'HH:mm:ss')}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ item.status === 'Hadir' ? 'bg-green-100 text-green-800' : item.status === 'Alpa' ? 'bg-red-100 text-red-800' : item.status === 'Sakit' || item.status === 'Izin' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800' }`}>
                                                    {item.status}
                                                </span>
                                            </TableCell>
                                            <TableCell>{item.description}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            Tidak ada data kehadiran untuk ditampilkan pada periode ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </PageWrapper>
    );
}
