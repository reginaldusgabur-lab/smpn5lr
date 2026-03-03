'use client';

import { useMemo, useEffect, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Inbox } from 'lucide-react';
import { useFirestore, useMemoFirebase, useUser, useDoc, useCollection } from '@/firebase';
import { collection, doc, query, where, Timestamp, getDocs, updateDoc, type DocumentData, collectionGroup } from 'firebase/firestore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

const approvalStatusVariant: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
    'approved': 'default',
    'pending': 'outline',
    'rejected': 'destructive',
};

const ApprovalTableSkeleton = ({ cols, rows = 3 }: { cols: number, rows?: number }) => (
    <div className="rounded-md border">
        <Table>
            <TableHeader>
                <TableRow>
                    {[...Array(cols)].map((_, i) => (
                        <TableHead key={i}>
                            <Skeleton className="h-5 w-full" />
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {[...Array(rows)].map((_, i) => (
                    <TableRow key={i}>
                        {[...Array(cols)].map((_, j) => (
                            <TableCell key={j}>
                                <Skeleton className="h-5 w-full" />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);

export default function ApprovalPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isRoleCheckLoading = isAuthLoading || isUserDataLoading;
  const isKepalaSekolah = !isRoleCheckLoading && userData?.role === 'kepala_sekolah';

  const usersForApprovalQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', 'in', ['guru', 'pegawai'])) : null, [firestore]);
  const { data: usersForApprovalData, isLoading: isUsersLoading } = useCollection(user, usersForApprovalQuery);
  const userMap = useMemo(() => {
    if (!usersForApprovalData) return new Map();
    return new Map(usersForApprovalData.map(u => [u.id, u.name]));
  }, [usersForApprovalData]);

  const [allRequests, setAllRequests] = useState<DocumentData[]>([]);
  const [isLeaveRequestsLoading, setIsLeaveRequestsLoading] = useState(true);

  useEffect(() => {
    if (!isKepalaSekolah || !firestore || isUsersLoading) {
        if (!isUsersLoading) setIsLeaveRequestsLoading(false);
        return;
    }

    const fetchLeaveRequests = async () => {
        setIsLeaveRequestsLoading(true);
        try {
            const userIdsForApproval = Array.from(userMap.keys());
            if (userIdsForApproval.length === 0) {
                setAllRequests([]);
                return;
            }

            const sixDaysAgo = new Date();
            sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
            sixDaysAgo.setHours(0, 0, 0, 0);

            const q = query(
                collectionGroup(firestore, 'leaveRequests'),
                where('startDate', '>=', Timestamp.fromDate(sixDaysAgo)),
                where('__name__', 'in', userIdsForApproval.map(id => `users/${id}/leaveRequests`))
            );
            
            const leaveRequestsSnapshot = await getDocs(q);
            
            const fetchedRequests = leaveRequestsSnapshot.docs.map(doc => {
                const userId = doc.ref.parent.parent?.id;
                return { ...doc.data(), id: doc.id, userId: userId };
            }).filter(Boolean) as DocumentData[];
            
            setAllRequests(fetchedRequests);
        } catch (error) {
            console.error("Gagal memuat permintaan izin:", error);
            toast({
                variant: "destructive",
                title: "Gagal Memuat Data",
                description: "Terjadi kesalahan saat memuat permintaan izin.",
            });
        } finally {
            setIsLeaveRequestsLoading(false);
        }
    };
    
    fetchLeaveRequests();

  }, [isKepalaSekolah, firestore, isUsersLoading, userMap, toast]);

  const { pendingRequests, recentHistory } = useMemo(() => {
    if (!allRequests || !userMap) return { pendingRequests: [], recentHistory: [] };
    const enrichedRequests = allRequests.map(req => ({
      ...req,
      userName: userMap.get(req.userId) || 'Nama tidak ditemukan'
    }));
    const pending = enrichedRequests.filter(req => req.status === 'pending').sort((a, b) => (a.startDate?.toDate()?.getTime() || 0) - (b.startDate?.toDate()?.getTime() || 0));
    const history = enrichedRequests.filter(req => req.status !== 'pending').sort((a, b) => (b.startDate?.toDate()?.getTime() || 0) - (a.startDate?.toDate()?.getTime() || 0));
    return { pendingRequests: pending, recentHistory: history };
  }, [allRequests, userMap]);

  const isDataLoading = isUsersLoading || isLeaveRequestsLoading;

  useEffect(() => {
    if (!isRoleCheckLoading) {
      if (!user) {
        router.replace('/');
      } else if (!isKepalaSekolah) {
        router.replace('/dashboard');
      }
    }
  }, [isRoleCheckLoading, user, isKepalaSekolah, router]);

  const handleUpdateRequestStatus = async (request: any, newStatus: 'approved' | 'rejected') => {
    if (!firestore || updatingId) return;
    setUpdatingId(request.id);

    const { userId, id: leaveRequestId } = request;
    const leaveRequestRef = doc(firestore, 'users', userId, 'leaveRequests', leaveRequestId);
    
    try {
        await updateDoc(leaveRequestRef, { status: newStatus });
        
        setAllRequests(prevRequests =>
            prevRequests.map(req =>
                req.id === request.id ? { ...req, status: newStatus } : req
            )
        );

        toast({
            title: `Pengajuan Berhasil Diperbarui`,
            description: `Permintaan dari ${request.userName} telah di-${newStatus === 'approved' ? 'setujui' : 'tolak'}.`,
        });
    } catch (error) {
        console.error("Gagal memperbarui status izin:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Memperbarui',
            description: 'Terjadi kesalahan. Pastikan Anda memiliki hak akses dan koneksi internet stabil.',
        });
    } finally {
        setUpdatingId(null);
    }
  };
  
  if (isRoleCheckLoading || !isKepalaSekolah || !userData) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Permintaan Izin Tertunda</CardTitle>
          <CardDescription>Tinjau dan proses permintaan izin atau sakit yang menunggu persetujuan.</CardDescription>
        </CardHeader>
        <CardContent>
          {isDataLoading ? (
            <ApprovalTableSkeleton cols={5} />
          ) : pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-10">
                <Inbox className="h-12 w-12 mb-4" />
                <p className="font-medium">Tidak Ada Permintaan Tertunda</p>
                <p className="text-sm">Semua permintaan izin dan sakit telah diproses.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Pengguna</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map(req => {
                    const isCurrentUpdating = updatingId === req.id;
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.userName}</TableCell>
                        <TableCell>
                          <Badge variant={req.type === 'Sakit' ? 'destructive' : 'secondary'}>
                            {req.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {req.startDate?.toDate ? format(req.startDate.toDate(), 'd MMM yyyy', { locale: id }) : ''} - {req.endDate?.toDate ? format(req.endDate.toDate(), 'd MMM yyyy', { locale: id }) : ''}
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={req.reason}>{req.reason}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleUpdateRequestStatus(req, 'approved')} disabled={isCurrentUpdating}>
                            {isCurrentUpdating && updatingId === req.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                            Setujui
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleUpdateRequestStatus(req, 'rejected')} disabled={isCurrentUpdating}>
                            {isCurrentUpdating && updatingId === req.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                            Tolak
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Persetujuan</CardTitle>
          <CardDescription>Riwayat permintaan izin atau sakit yang telah diproses dalam 6 hari terakhir.</CardDescription>
        </CardHeader>
        <CardContent>
          {isDataLoading ? (
            <ApprovalTableSkeleton cols={4} />
          ) : recentHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-10">
              <p>Tidak ada riwayat untuk ditampilkan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Pengguna</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentHistory.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.userName}</TableCell>
                      <TableCell>
                        <Badge variant={req.type === 'Sakit' ? 'destructive' : 'secondary'}>
                          {req.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {req.startDate?.toDate ? format(req.startDate.toDate(), 'd MMM yyyy', { locale: id }) : ''} - {req.endDate?.toDate ? format(req.endDate.toDate(), 'd MMM yyyy', { locale: id }) : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={approvalStatusVariant[req.status] || 'secondary'} className="capitalize">
                            {req.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
