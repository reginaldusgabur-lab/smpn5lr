'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';

const statusVariant = {
    'Hadir': 'default',
    'Sakit': 'destructive',
    'Izin': 'secondary',
    'Alpa': 'destructive',
    'Terlambat': 'outline',
};

export default function UserReportDetailModal({ user, month, isOpen, onClose }) {
    const firestore = useFirestore();
    const [reportDetails, setReportDetails] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen || !firestore || !user) return;

        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Ambil konfigurasi sekolah untuk diteruskan ke fungsi fetch
                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                const schoolConfig = schoolConfigSnap.data() || {};

                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, month, schoolConfig);
                setReportDetails(reportData.reportDetails);
            } catch (err) {
                console.error("Error fetching user report details:", err);
                setError("Gagal memuat rincian laporan. Silakan coba lagi.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, firestore, user, month]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Detail Laporan Kehadiran</DialogTitle>
                    <DialogDescription>
                        Menampilkan rincian kehadiran untuk {user?.name} pada bulan {month}.
                    </DialogDescription>
                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertTitle>Terjadi Kesalahan</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </DialogHeader>
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Jam Masuk</TableHead>
                                    <TableHead className="text-center">Jam Pulang</TableHead>
                                    <TableHead>Keterangan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportDetails.length > 0 ? (
                                    reportDetails.map(day => (
                                        <TableRow key={day.id}>
                                            <TableCell className="font-medium">{day.dateString}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={statusVariant[day.status] || 'default'}>{day.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{day.checkIn || '-'}</TableCell>
                                            <TableCell className="text-center">{day.checkOut || '-'}</TableCell>
                                            <TableCell>{day.description}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            Tidak ada data untuk ditampilkan pada periode ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
