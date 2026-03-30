'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { DataTable } from '@/components/data-table';
import { columns as createColumns } from './columns';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function IzinKepalaSekolahPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const [requests, setRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || user.role !== 'kepala_sekolah' || !firestore) {
            setIsLoading(false);
            return;
        }

        const fetchPendingRequests = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // 1. Get all staff (guru & pegawai)
                const usersQuery = query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai']));
                const usersSnapshot = await getDocs(usersQuery);

                if (usersSnapshot.empty) {
                    setRequests([]);
                    setIsLoading(false);
                    return;
                }

                const allPendingRequests: any[] = [];

                // 2. Loop through each user to find their pending leave requests
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

                // 3. Wait for all queries to complete
                await Promise.all(promises);

                setRequests(allPendingRequests);
            } catch (err: any) {
                console.error("Error fetching leave requests:", err);
                // Check for permission error, which is the most likely cause
                if (err.code === 'permission-denied') {
                    setError("Gagal mengambil data: Pastikan aturan keamanan Firestore memperbolehkan Kepala Sekolah untuk membaca koleksi 'users' dan sub-koleksi 'leaveRequests'.");
                } else {
                    setError(`Gagal mengambil data permintaan izin. Terjadi kesalahan: ${err.message}`);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchPendingRequests();

        // Note: This approach doesn't use a real-time listener (onSnapshot)
        // to avoid complex and potentially costly collectionGroup queries.
        // The user might need to refresh the page to see new requests.

    }, [user, firestore]);

    const handleUpdateRequest = async (path: string, status: 'approved' | 'rejected') => {
        if (!user) return;
        try {
            const requestDocRef = doc(firestore, path);
            const batch = writeBatch(firestore);

            batch.update(requestDocRef, { status });

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

            // Refresh the list after updating
            setRequests(prevRequests => prevRequests.filter(req => req.path !== path));

        } catch (err) {
            console.error("Error updating request: ", err);
        }
    };

    const columns = useMemo(() => createColumns(handleUpdateRequest), [handleUpdateRequest]);

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
    }

    if (error) {
        return (
            <div className="p-4">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (user?.role !== 'kepala_sekolah') {
        return (
            <div className="p-4">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Akses Ditolak</AlertTitle>
                    <AlertDescription>Halaman ini hanya dapat diakses oleh Kepala Sekolah.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Persetujuan Izin</CardTitle>
                    <CardDescription>Tinjau dan proses permintaan izin atau sakit yang diajukan oleh guru dan pegawai.</CardDescription>
                </CardHeader>
                <CardContent>
                     {requests.length > 0 ? (
                        <DataTable columns={columns} data={requests} />
                    ) : (
                        <div className="text-center p-8 border rounded-md">
                            <p className="text-muted-foreground">Tidak ada permintaan izin yang sedang menunggu persetujuan.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
