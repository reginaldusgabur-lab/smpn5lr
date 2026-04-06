'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Eye } from 'lucide-react';

const LaporanGuruListPage = () => {
    const firestore = useFirestore();

    const usersQuery = useMemo(
        () =>
            firestore
                ? query(collection(firestore, 'users'), where('role', 'in', ['guru', 'kepala_sekolah', 'pegawai']))
                : null,
        [firestore]
    );

    const { data: usersData, isLoading: isUsersLoading } = useCollection(null, usersQuery);

    if (isUsersLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Laporan Kehadiran Guru & Staf</CardTitle>
                <CardDescription>Pilih guru atau staf untuk melihat laporan kehadiran detail mereka.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>No</TableHead>
                                <TableHead>Nama</TableHead>
                                <TableHead>NIP</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {usersData && usersData.length > 0 ? (
                                usersData.map((user, index) => (
                                    <TableRow key={user.id}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell>{user.nip || '-'}</TableCell>
                                        <TableCell>{user.position || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/dashboard/admin/laporan-guru/${user.id}`} passHref>
                                                <Button variant="outline" size="sm">
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    Lihat Detail
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        Tidak ada data guru atau staf untuk ditampilkan.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default LaporanGuruListPage;
