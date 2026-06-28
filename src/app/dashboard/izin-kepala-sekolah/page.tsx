'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { DataTable } from '@/components/data-table';
import { columns as createColumns } from './columns';
import { Loader2, AlertCircle, Inbox, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ApprovalTableSkeleton = () => (
    <div className="rounded-md border">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[200px]"><Skeleton className="h-4 w-24" /></TableHead>
                    <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                    <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                    <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                    <TableHead><Skeleton className="h-4 w-40" /></TableHead>
                    <TableHead className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {[...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                        <TableCell><div className="flex justify-end gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /></div></TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);

export default function IzinKepalaSekolahPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [requests, setRequests] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isUserLoading || !user || user.role !== 'kepala_sekolah' || !firestore) {
            if (!isUserLoading) setIsLoadingData(false);
            return;
        }

        const fetchPendingRequests = async () => {
            setIsLoadingData(true);
            setError(null);
            try {
                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai']));
                const usersSnapshot = await getDocs(usersQuery);

                if (usersSnapshot.empty) {
                    setRequests([]);
                    setIsLoadingData(false);
                    return;
                }

                const allPendingRequests: any[] = [];

                const promises = usersSnapshot.docs.map(async (userDoc) => {
                    const userData = userDoc.data();
                    const userId = userDoc.id;

                    const leaveRequestsQuery = query(
                        collection(firestore, 'users', userId, 'leaveRequests'),
                        where('status', '==', 'pending')
                    );

                    const leaveRequestsSnapshot = await getDocs(leaveRequestsQuery);
                    leaveRequestsSnapshot.forEach(doc => {
                        allPendingRequests.push({
                            id: doc.id,
                            path: doc.ref.path,
                            userId: userId,
                            userName: userData.name || 'Nama tidak ada',
                            ...doc.data()
                        });
                    });
                });

                await Promise.all(promises);

                allPendingRequests.sort((a, b) => {
                    const dateA = a.startDate?.toDate ? a.startDate.toDate().getTime() : 0;
                    const dateB = b.startDate?.toDate ? b.startDate.toDate().getTime() : 0;
                    return dateB - dateA;
                });

                setRequests(allPendingRequests);
            } catch (err: any) {
                console.error("Error fetching leave requests:", err);
                if (err.code === 'permission-denied') {
                    setError("Gagal mengambil data: Akses ditolak.");
                } else {
                    setError(`Gagal mengambil data permintaan izin.`);
                }
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchPendingRequests();
    }, [user, isUserLoading, firestore]);

    const handleUpdateRequest = async (path: string, status: 'approved' | 'rejected') => {
        if (!user || !firestore) return;
        try {
            const requestDocRef = doc(firestore, path);
            const batch = writeBatch(firestore);

            batch.update(requestDocRef, { 
                status,
                approvedBy: user.uid,
                approvedAt: new Date()
            });

            const activityRef = doc(collection(firestore, "activities"));
            batch.set(activityRef, {
                userId: user.uid,
                userName: user.name,
                userRole: user.role,
                type: 'leave_approval',
                description: `Mengubah status pengajuan menjadi ${status}`,
                timestamp: new Date(),
                targetId: path,
            });

            await batch.commit();
            setRequests(prevRequests => prevRequests.filter(req => req.path !== path));

        } catch (err) {
            console.error("Error updating request: ", err);
        }
    };

    const columns = useMemo(() => createColumns(handleUpdateRequest), [handleUpdateRequest]);

    if (!isUserLoading && user && user.role !== 'kepala_sekolah') {
        return (
            <div className="flex-1 pt-4 pb-24 md:p-8">
                <div className="max-w-7xl mx-auto">
                    <Alert variant="destructive">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle>Akses Ditolak</AlertTitle>
                        <AlertDescription>Halaman ini hanya dapat diakses oleh Kepala Sekolah.</AlertDescription>
                    </Alert>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 pt-4 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                
                <div className="px-4 md:px-0">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Persetujuan Izin</h1>
                    <p className="text-muted-foreground mt-1 font-medium">Tinjau dan proses permintaan izin atau sakit yang diajukan oleh guru dan pegawai.</p>
                </div>

                <Card className="overflow-hidden border shadow-none rounded-3xl bg-card">
                    <CardHeader className="p-6 border-b border-muted-foreground/10 text-primary">
                        <CardTitle className="font-black text-xs uppercase tracking-widest">Daftar Pengajuan Izin</CardTitle>
                        <CardDescription className="text-muted-foreground font-medium pt-1">Menunggu peninjauan dan persetujuan Kepala Sekolah.</CardDescription>
                    </Header>
                    <CardContent className="p-0 sm:p-6 min-h-[400px]">
                        {error ? (
                            <div className="p-8 text-center">
                                <Alert variant="destructive" className="rounded-2xl">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            </div>
                        ) : (isLoadingData || isUserLoading) ? (
                            <div className="p-4 sm:p-0">
                                <ApprovalTableSkeleton />
                            </div>
                        ) : requests.length > 0 ? (
                            <div className="p-4 sm:p-0">
                                <DataTable columns={columns} data={requests} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center py-20 px-4 text-muted-foreground">
                                <Inbox className="h-12 w-12 mb-4 opacity-20" />
                                <h3 className="text-lg font-bold text-foreground">Tidak Ada Permintaan</h3>
                                <p className="text-xs font-medium">Semua permintaan izin dan sakit telah diproses.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
