'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot, Timestamp, collection, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

function DigitalClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  return (
    <div className="text-6xl font-bold text-center text-gray-800 dark:text-white">
      {format(time, 'HH:mm:ss')}
    </div>
  );
}

export default function PersonalDashboard() {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useUser();
  const firestore = useFirestore();
  const [attendance, setAttendance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !firestore) return;

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const q = query(
      collection(firestore, `users/${user.uid}/attendanceRecords`),
      where('checkInTime', '>=', Timestamp.fromDate(startOfToday)),
      where('checkInTime', '<', Timestamp.fromDate(endOfToday))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setAttendance({ id: doc.id, ...doc.data() });
      } else {
        setAttendance(null);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching attendance: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, firestore]);
  
  const handleGoToScan = () => {
    router.push('/dashboard/absen');
  };

  if (isLoading || isUserLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin" /></div>;
  }

  const todayStr = format(new Date(), "eeee, d MMMM yyyy", { locale: id });

  return (
    <div className="dark:bg-gray-900 dark:text-white p-6 rounded-lg shadow-md">
       <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Selamat Datang</h1>
        <p className="text-xl mt-1 text-gray-700 dark:text-gray-300 font-semibold">{user?.name}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Berikut adalah riwayat kehadiran Anda dalam 1 hari terakhir. Riwayat selengkapnya dapat dilihat pada menu laporan.</p>
      </div>

      <div className="my-8">
          <DigitalClock />
           <p className="text-center text-lg text-gray-600 dark:text-gray-300">{todayStr}</p>
      </div>

       <Card className="dark:bg-gray-800">
        <CardHeader>
            <CardTitle className="text-center">Kehadiran Anda Hari Ini</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                    <p className="text-gray-500 dark:text-gray-400">Absen Masuk</p>
                    <p className="text-2xl font-bold">{attendance?.checkInTime ? format(attendance.checkInTime.toDate(), 'HH:mm') : '--:--'}</p>
                </div>
                <div>
                    <p className="text-gray-500 dark:text-gray-400">Absen Pulang</p>
                    <p className="text-2xl font-bold">{attendance?.checkOutTime ? format(attendance.checkOutTime.toDate(), 'HH:mm') : '--:--'}</p>
                </div>
            </div>
             <div className="mt-6">
                 {!attendance && (
                    <Button onClick={handleGoToScan} className="w-full">
                        Absen Masuk
                    </Button>
                )}
                {attendance && !attendance.checkOutTime && (
                    <Button onClick={handleGoToScan} className="w-full">
                        Absen Pulang
                    </Button>
                )}
                 {attendance && attendance.checkOutTime && (
                    <Button disabled className="w-full">Anda Sudah Absen Hari Ini</Button>
                )}
            </div>
        </CardContent>
       </Card>
    </div>
  );
}
