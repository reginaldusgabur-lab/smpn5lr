'use client';

import { useMemo, useEffect, useState } from 'react';
import { useFirestore, useMemoFirebase, useUser, useCollection } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileWarning } from 'lucide-react';

interface OverviewCardsProps {
  userRole: string;
}

export function OverviewCards({ userRole }: OverviewCardsProps) {
  const { user } = useUser();
  const firestore = useFirestore();

  const allUsersQuery = useMemoFirebase(() => 
    firestore ? query(collection(firestore, 'users'), where('role', '!=', 'siswa')) : null, 
    [firestore]
  );
  const { data: usersData, isLoading: isUsersLoading } = useCollection(user, allUsersQuery);

  const [pendingRequestsCount, setPendingRequestsCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPendingRequests = async () => {
      if (userRole !== 'kepala_sekolah' || !firestore || !usersData) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const usersToQuery = usersData.filter(u => u.role !== 'admin' && u.role !== 'siswa');
        
        const requestPromises = usersToQuery.map(async (u) => {
          try {
            const q = query(
              collection(firestore, 'users', u.id, 'leaveRequests'), 
              where('status', '==', 'pending')
            );
            const snapshot = await getDocs(q);
            return snapshot.size;
          } catch (error) {
            console.error(`Failed to fetch pending requests for user ${u.id}:`, error);
            return 0;
          }
        });

        const counts = await Promise.all(requestPromises);
        const total = counts.reduce((acc, count) => acc + count, 0);
        setPendingRequestsCount(total);

      } catch (error) {
        console.error("Error fetching pending requests count:", error);
        setPendingRequestsCount(0);
      } finally {
        setIsLoading(false);
      }
    };

    if (!isUsersLoading) {
      fetchPendingRequests();
    }

  }, [userRole, firestore, usersData, isUsersLoading]);

  if (userRole !== 'kepala_sekolah') {
    return null; // Don't render the card for other roles
  }

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Permintaan Izin Tertunda</CardTitle>
        <FileWarning className="h-5 w-5 text-yellow-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-start">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="text-2xl font-bold">{pendingRequestsCount ?? 0}</div>
        )}
        <p className="text-xs text-muted-foreground">
          Permintaan izin/sakit menunggu persetujuan
        </p>
      </CardContent>
    </Card>
  );
}
