'use client';

import { useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFirestore, useMemoFirebase, useUser, useDoc, useCollection } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

const ReportSkeleton = () => (
    <div className="rounded-md border">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead><Skeleton className="h-5 w-full" /></TableHead>
                    <TableHead><Skeleton className="h-5 w-full" /></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow>
                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
                <TableRow>
                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
            </TableBody>
        </Table>
    </div>
);


export default function KepalaSekolahLaporanPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isRoleCheckLoading = isAuthLoading || isUserDataLoading;
  const isKepalaSekolah = !isRoleCheckLoading && userData?.role === 'kepala_sekolah';
  
  const usersForReportQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai'])) : null, [firestore]);
  const { data: usersForReportData, isLoading: isUsersLoading } = useCollection(user, usersForReportQuery);

  useEffect(() => {
    if (!isRoleCheckLoading) {
      if (!user) {
        router.replace('/');
      } else if (!isKepalaSekolah) {
        router.replace('/dashboard');
      }
    }
  }, [isRoleCheckLoading, user, isKepalaSekolah, router]);

  if (isRoleCheckLoading || !isKepalaSekolah || !userData) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  // TODO: Add actual report generation logic (tabs for daily, monthly, user selection etc.)
  
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Laporan Kehadiran Sekolah</CardTitle>
          <CardDescription>
            Tinjau laporan kehadiran untuk guru dan pegawai. Fitur lebih lanjut sedang dalam pengembangan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isUsersLoading ? (
            <ReportSkeleton />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersForReportData && usersForReportData.length > 0 ? (
                    usersForReportData.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="capitalize">{u.role}</TableCell>
                        <TableCell>{u.email}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center">
                        Tidak ada data guru atau pegawai yang ditemukan.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
