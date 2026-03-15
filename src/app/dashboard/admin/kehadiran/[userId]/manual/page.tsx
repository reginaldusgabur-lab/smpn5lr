'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parse, format, startOfDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';

export default function ManualAttendancePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const { user: authUser, isUserLoading: isAuthLoading } = useUser();

    const userId = params.userId as string;
    const dateStr = searchParams.get('date');

    const [userData, setUserData] = useState<any>(null);
    const [existingRecord, setExistingRecord] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [checkIn, setCheckIn] = useState('');
    const [checkOut, setCheckOut] = useState('');
    const [error, setError] = useState<string | null>(null);

    const date = dateStr ? parse(dateStr, 'yyyy-MM-dd', new Date()) : new Date();

    useEffect(() => {
        const checkAuthAndFetchData = async () => {
            if (isAuthLoading) return;
            if (!authUser) {
                router.replace('/');
                return;
            }

            try {
                const adminDocRef = doc(firestore, 'users', authUser.uid);
                const adminDocSnap = await getDoc(adminDocRef);
                if (!adminDocSnap.exists() || adminDocSnap.data().role !== 'admin') {
                    router.replace('/dashboard');
                    return;
                }

                const userDocRef = doc(firestore, 'users', userId);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    setUserData(userDocSnap.data());
                } else {
                    setError('Pengguna tidak ditemukan.');
                    setIsLoading(false);
                    return;
                }

                // Check for existing attendance record for that day
                const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
                const q = query(attendanceRef, 
                    where('checkInTime', '>=', startOfDay(date)),
                    where('checkInTime', '<=', endOfDay(date))
                );
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const record = querySnapshot.docs[0].data();
                    const recordId = querySnapshot.docs[0].id;
                    setExistingRecord({ ...record, id: recordId });
                    if (record.checkInTime) {
                        setCheckIn(format(record.checkInTime.toDate(), 'HH:mm'));
                    }
                    if (record.checkOutTime) {
                        setCheckOut(format(record.checkOutTime.toDate(), 'HH:mm'));
                    }
                }
            } catch (err) {
                console.error(err);
                setError('Gagal memuat data.');
            } finally {
                setIsLoading(false);
            }
        };
        checkAuthAndFetchData();
    }, [authUser, isAuthLoading, firestore, userId, date, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkIn && !checkOut) {
            setError('Setidaknya jam masuk atau jam pulang harus diisi.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const [inHours, inMinutes] = checkIn.split(':').map(Number);
            const [outHours, outMinutes] = checkOut ? checkOut.split(':').map(Number) : [null, null];

            const checkInTimestamp = checkIn ? Timestamp.fromDate(new Date(date.setHours(inHours, inMinutes, 0))) : null;
            const checkOutTimestamp = checkOut && outHours != null && outMinutes != null ? Timestamp.fromDate(new Date(date.setHours(outHours, outMinutes, 0))) : null;

            if (existingRecord) {
                // Update existing record
                const recordRef = doc(firestore, 'users', userId, 'attendanceRecords', existingRecord.id);
                await updateDoc(recordRef, {
                    checkInTime: checkInTimestamp,
                    checkOutTime: checkOutTimestamp,
                    lastModifiedBy: authUser?.uid,
                    lastModifiedAt: serverTimestamp()
                });
            } else {
                // Create new record
                const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
                await addDoc(attendanceRef, {
                    userId,
                    checkInTime: checkInTimestamp,
                    checkOutTime: checkOutTimestamp,
                    status: 'present', 
                    createdBy: authUser?.uid,
                    createdAt: serverTimestamp()
                });
            }
            router.back();
        } catch (err) {
            console.error("Error submitting attendance:", err);
            setError('Gagal menyimpan perubahan. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><Loader2 className="h-12 w-12 animate-spin" /></div>;
    }

    return (
        <div className="max-w-2xl mx-auto p-4">
             <Button variant="outline" size="icon" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <Card>
                <CardHeader>
                    <CardTitle>Entri Kehadiran Manual</CardTitle>
                    {userData && (
                        <CardDescription>
                            Masukkan jam kehadiran untuk <span className="font-semibold">{userData.name}</span> pada tanggal <span className="font-semibold">{format(date, 'EEEE, dd MMMM yyyy', { locale: id })}</span>.
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="checkIn">Jam Masuk</Label>
                                <Input id="checkIn" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="checkOut">Jam Pulang</Label>
                                <Input id="checkOut" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                            </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                            Kosongkan jam jika tidak ingin dicatat. Jika data sudah ada, entri ini akan menimpanya.
                        </p>
                        
                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
