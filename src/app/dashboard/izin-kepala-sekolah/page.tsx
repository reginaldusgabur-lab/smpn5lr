'use client';

import { useState, useEffect, useMemo } from 'react';
import { collectionGroup, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { DataTable } from '@/components/data-table';
import { columns as createColumns } from './columns'; 
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function IzinKepalaSekolahPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const [requests, setRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || user.role !== 'kepala_sekolah') {
            setIsLoading(false);
            return;
        }

        const q = query(
            collectionGroup(firestore, 'leaveRequests'),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedRequests = snapshot.docs.map(doc => ({
                id: doc.id,
                path: doc.ref.path,
                ...doc.data()
            }));
            setRequests(fetchedRequests);
            setIsLoading(false);
        }, (err) => {
            console.error("Error fetching leave requests: ", err);
            setError("Gagal mengambil data permintaan izin. Silakan coba lagi.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, firestore]);

    const handleUpdateRequest = async (path: string, status: 'approved' | 'rejected') => {
        try {
            const requestDocRef = doc(firestore, path);
            const batch = writeBatch(firestore);

            batch.update(requestDocRef, { status });

            // Add to activity log
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

        } catch (err) {
            console.error("Error updating request: ", err);
            // Optionally, show an error message to the user
        }
    };

    const columns = useMemo(() => createColumns(handleUpdateRequest), []);

    if (isLoading) {
        return <div className="flex h-[calc(100vh-80px)] items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
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
        )
    }

    return (
        <div className="p-4 md:p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Persetujuan Izin</CardTitle>
                    <CardDescription>Tinjau dan proses permintaan izin atau sakit yang diajukan oleh guru dan pegawai.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={requests} />
                </CardContent>
            </Card>
        </div>
    );
}
