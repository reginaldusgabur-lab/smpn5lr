
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, Timestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parse, format, startOfDay, endOfDay, addMinutes, isSameDay, setHours, setMinutes, isBefore } from 'date-fns';
import { id } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

const getRandomTime = (baseDate: Date, startTimeStr: string, endTimeStr: string): Date => {
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const startDate = new Date(baseDate.getTime());
    startDate.setHours(startH, startM, 0, 0);
    const endDate = new Date(baseDate.getTime());
    endDate.setHours(endH, endM, 0, 0);
    
    if (endDate.getTime() <= startDate.getTime()) {
        endDate.setDate(endDate.getDate() + 1);
    }
    
    const randomTimestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
    const res = new Date(randomTimestamp);
    res.setSeconds(Math.floor(Math.random() * 60));
    return res;
};

export default function ManualAttendancePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const { user: authUser, isUserLoading: isAuthLoading } = useUser();
    const { toast } = useToast();

    const userId = params.userId as string;
    const dateStr = searchParams.get('date');

    const [userData, setUserData] = useState<any>(null);
    const [schoolConfig, setSchoolConfig] = useState<any>(null);
    const [existingRecord, setExistingRecord] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [checkIn, setCheckIn] = useState('');
    const [checkOut, setCheckOut] = useState('');
    const [error, setError] = useState<string | null>(null);

    const date = dateStr ? parse(dateStr, 'yyyy-MM-dd', new Date()) : startOfDay(new Date());

    useEffect(() => {
        const checkAuthAndFetchData = async () => {
            if (isAuthLoading) return;
            if (!authUser) { router.replace('/'); return; }

            try {
                const adminDocRef = doc(firestore, 'users', authUser.uid);
                const adminDocSnap = await getDoc(adminDocRef);
                if (!adminDocSnap.exists() || adminDocSnap.data().role !== 'admin') {
                    router.replace('/dashboard'); return;
                }

                const userDocRef = doc(firestore, 'users', userId);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) setUserData(userDocSnap.data());
                else { setError('Pengguna tidak ditemukan.'); setIsLoading(false); return; }

                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                if (schoolConfigSnap.exists()) setSchoolConfig(schoolConfigSnap.data());

                const attendanceRef = collection(firestore, 'users', userId, 'attendanceRecords');
                const q = query(attendanceRef, where('date', '==', format(date, 'yyyy-MM-dd')));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const record = querySnapshot.docs[0].data();
                    setExistingRecord({ ...record, id: querySnapshot.docs[0].id });
                    if (record.checkInTime) setCheckIn(format(record.checkInTime.toDate(), 'HH:mm'));
                    if (record.checkOutTime) setCheckOut(format(record.checkOutTime.toDate(), 'HH:mm'));
                }
            } catch (err) { console.error(err); setError('Gagal memuat data.'); }
            finally { setIsLoading(false); }
        };
        checkAuthAndFetchData();
    }, [authUser, isAuthLoading, firestore, userId, date, router]);

    const handleSetLate = async () => {
        if (!schoolConfig || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const recordDate = startOfDay(date);
            const now = new Date();
            const isToday = isSameDay(recordDate, now);

            const inEnd = schoolConfig.checkInEndTime || '08:00';
            const [endH, endM] = inEnd.split(':').map(Number);
            const baseLateTime = new Date(recordDate);
            baseLateTime.setHours(endH, endM, 0);
            const checkInTime = addMinutes(baseLateTime, Math.floor(Math.random() * 15) + 1);

            let checkOutTime: Date | null = null;
            const outStart = schoolConfig.checkOutStartTime || '14:00';
            const outEnd = schoolConfig.checkOutEndTime || '15:00';
            const [outH, outM] = outStart.split(':').map(Number);
            const checkOutLimit = setMinutes(setHours(startOfDay(recordDate), outH), outM);

            if (!isToday || (isToday && now >= checkOutLimit)) {
                checkOutTime = getRandomTime(recordDate, outStart, outEnd);
                if (checkOutTime.getTime() <= checkInTime.getTime()) {
                    checkOutTime = addMinutes(checkInTime, 240);
                }
            }

            const attendanceData: any = {
                userId, date: format(date, 'yyyy-MM-dd'),
                checkInTime: Timestamp.fromDate(checkInTime),
                checkOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : (existingRecord?.checkOutTime || null),
                manualEntry: true, reasonForUpdate: 'Terlambat',
                lastModifiedBy: authUser?.uid, lastModifiedAt: serverTimestamp()
            };

            if (existingRecord) {
                await updateDoc(doc(firestore, 'users', userId, 'attendanceRecords', existingRecord.id), attendanceData);
            } else {
                await addDoc(collection(firestore, 'users', userId, 'attendanceRecords'), { ...attendanceData, createdAt: serverTimestamp() });
            }
            toast({ title: 'Sukses', description: `Status terlambat telah disimpan.` });
            router.back();
        } catch (err) { setError('Gagal memproses keterlambatan.'); }
        finally { setIsSubmitting(false); }
    };

    const handleSetHadir = async () => {
        if (!schoolConfig || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const recordDate = startOfDay(date);
            const now = new Date();
            const isToday = isSameDay(recordDate, now);

            const inStart = schoolConfig.checkInStartTime || '07:00';
            const inEnd = schoolConfig.checkInEndTime || '07:30';
            const checkInTime = getRandomTime(recordDate, inStart, inEnd);

            const outStart = schoolConfig.checkOutStartTime || '14:00';
            const outEnd = schoolConfig.checkOutEndTime || '15:00';
            
            let checkOutTime: Date | null = null;
            const [outH, outM] = outStart.split(':').map(Number);
            const checkOutLimit = setMinutes(setHours(startOfDay(recordDate), outH), outM);

            if (!isToday || (isToday && now >= checkOutLimit)) {
                checkOutTime = getRandomTime(recordDate, outStart, outEnd);
                if (checkOutTime.getTime() <= checkInTime.getTime()) {
                    checkOutTime = addMinutes(checkInTime, 240);
                }
            }

            const attendanceData: any = {
                userId, date: format(date, 'yyyy-MM-dd'),
                checkInTime: Timestamp.fromDate(checkInTime),
                checkOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : (existingRecord?.checkOutTime || null),
                manualEntry: true, reasonForUpdate: 'Kehadiran penuh',
                lastModifiedBy: authUser?.uid, lastModifiedAt: serverTimestamp()
            };

            if (existingRecord) {
                await updateDoc(doc(firestore, 'users', userId, 'attendanceRecords', existingRecord.id), attendanceData);
            } else {
                await addDoc(collection(firestore, 'users', userId, 'attendanceRecords'), { ...attendanceData, createdAt: serverTimestamp() });
            }
            toast({ title: 'Sukses', description: `Kehadiran penuh telah disimpan.` });
            router.back();
        } catch (err) { setError('Gagal memproses kehadiran otomatis.'); }
        finally { setIsSubmitting(false); }
    };

    const handleCreateLeave = async (type: 'Sakit' | 'Izin' | 'Dinas', reason: string) => {
        setIsSubmitting(true); setError(null);
        try {
            const batch = writeBatch(firestore);
            const q = query(collection(firestore, 'users', userId, 'attendanceRecords'), where('date', '==', format(date, 'yyyy-MM-dd')));
            const snap = await getDocs(q);
            if (!snap.empty) batch.delete(snap.docs[0].ref);

            batch.set(doc(collection(firestore, 'users', userId, 'leaveRequests')), {
                userId, type, status: 'approved', reason,
                startDate: Timestamp.fromDate(startOfDay(date)),
                endDate: Timestamp.fromDate(endOfDay(date)),
                createdAt: serverTimestamp(), approvedBy: authUser?.uid, approvedAt: serverTimestamp()
            });

            await batch.commit();
            toast({ title: 'Sukses', description: `Kehadiran telah diubah menjadi ${reason}.` });
            router.back();
        } catch (err) { setError('Gagal menyimpan perubahan.'); }
        finally { setIsSubmitting(false); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkIn && !checkOut) { setError('Setidaknya jam masuk atau jam pulang harus diisi.'); return; }
        setIsSubmitting(true); setError(null);
        try {
            const [inH, inM] = checkIn ? checkIn.split(':').map(Number) : [null, null];
            const [outH, outM] = checkOut ? checkOut.split(':').map(Number) : [null, null];
            const checkInTs = inH !== null ? Timestamp.fromDate(new Date(new Date(date).setHours(inH, inM!, 0))) : null;
            const checkOutTs = outH !== null ? Timestamp.fromDate(new Date(new Date(date).setHours(outH, outM!, 0))) : null;
            
            const data = {
                userId, date: format(date, 'yyyy-MM-dd'),
                checkInTime: checkInTs || (existingRecord?.checkInTime || null),
                checkOutTime: checkOutTs || (existingRecord?.checkOutTime || null),
                manualEntry: true, lastModifiedBy: authUser?.uid, lastModifiedAt: serverTimestamp()
            };
            if (existingRecord) await updateDoc(doc(firestore, 'users', userId, 'attendanceRecords', existingRecord.id), data);
            else await addDoc(collection(firestore, 'users', userId, 'attendanceRecords'), { ...data, createdAt: serverTimestamp() });
            toast({ title: 'Sukses', description: `Kehadiran telah disimpan.` });
            router.back();
        } catch (err) { setError('Gagal menyimpan perubahan.'); }
        finally { setIsSubmitting(false); }
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><Loader2 className="h-12 w-12 animate-spin" /></div>;

    return (
        <div className="max-w-2xl mx-auto p-4 flex flex-col items-stretch pb-24">
             <Button variant="outline" size="icon" onClick={() => router.back()} className="mb-4 rounded-full h-10 w-10 shrink-0">
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <Card className="rounded-3xl border shadow-xl overflow-hidden">
                <CardHeader className="bg-muted/30 border-b border-muted-foreground/10">
                    <CardTitle className="font-bold text-xl">Entri Kehadiran Manual</CardTitle>
                    {userData && (
                        <CardDescription className="font-bold">
                            Ubah kehadiran untuk <span className="text-foreground">{userData.name}</span> pada <span className="text-foreground">{format(date, 'EEEE, dd MMMM yyyy', { locale: id })}</span>.
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="p-6">
                    {error && <p className="text-destructive mb-6 text-sm font-bold text-center bg-destructive/10 p-3 rounded-xl">{error}</p>}
                    <div className="space-y-4 mb-8">
                        <Label className="text-xs font-bold text-primary tracking-widest uppercase ml-1">Tindakan cepat</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <Button variant="default" className="rounded-xl font-bold h-11" onClick={handleSetHadir} disabled={isSubmitting}>Jadikan hadir</Button>
                            <Button variant="outline" className="rounded-xl font-bold h-11" onClick={handleSetLate} disabled={isSubmitting}>Jadikan terlambat</Button>
                            <Button variant="outline" className="rounded-xl font-bold h-11" onClick={() => handleCreateLeave('Sakit', 'Sakit')} disabled={isSubmitting}>Jadikan sakit</Button>
                            <Button variant="outline" className="rounded-xl font-bold h-11" onClick={() => handleCreateLeave('Izin', 'Izin pribadi')} disabled={isSubmitting}>Jadikan izin</Button>
                            <Button variant="outline" className="rounded-xl font-bold h-11 text-xs" onClick={() => handleCreateLeave('Dinas', 'Dinas pagi')} disabled={isSubmitting}>Dinas pagi</Button>
                            <Button variant="outline" className="rounded-xl font-bold h-11 text-xs" onClick={() => handleCreateLeave('Dinas', 'Dinas siang')} disabled={isSubmitting}>Dinas siang</Button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 border-t border-muted-foreground/10 pt-8">
                         <Label className="text-xs font-bold text-primary tracking-widest uppercase ml-1">Entri jam manual</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="checkIn" className="text-xs font-bold ml-1">Jam masuk</Label>
                                <Input id="checkIn" type="time" className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="checkOut" className="text-xs font-bold ml-1">Jam pulang</Label>
                                <Input id="checkOut" type="time" className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-bold italic">Isi jam masuk/pulang secara manual jika diperlukan dan klik simpan.</p>
                        <div className="flex justify-end pt-4">
                            <Button type="submit" className="w-full sm:w-auto h-12 rounded-xl font-bold px-10 shadow-lg active:scale-95 transition-all" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan kehadiran
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
