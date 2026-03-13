'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUser, useFirestore, FirestorePermissionError, errorEmitter, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { addDoc, collection, serverTimestamp, query, where, Timestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Info, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, addDays, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const leaveRequestSchema = z.object({
  leaveDate: z.enum(['today', 'tomorrow'], {
    required_error: 'Tanggal pengajuan wajib dipilih.',
  }),
  type: z.enum(['Sakit', 'Izin', 'Dinas'], {
    required_error: 'Jenis pengajuan wajib dipilih.',
  }),
  reason: z.string().min(10, { message: 'Alasan harus diisi minimal 10 karakter.' }),
  proofUrl: z.string().url({ message: 'URL bukti tidak valid.' }).optional().or(z.literal('')),
});

export default function IzinPage() {
    const form = useForm<z.infer<typeof leaveRequestSchema>>({
        resolver: zodResolver(leaveRequestSchema),
        defaultValues: {
            leaveDate: 'today',
            type: undefined,
            reason: '',
            proofUrl: '',
        }
    });
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 60000); // Check every minute is enough
        return () => clearInterval(timerId);
    }, []);

    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    const selectedDateValue = form.watch('leaveDate');
    const targetDate = useMemo(() => {
        const now = new Date();
        return selectedDateValue === 'tomorrow' ? addDays(now, 1) : now;
    }, [selectedDateValue]); // Removed currentTime from dependencies

    const targetDateStart = useMemo(() => startOfDay(targetDate), [targetDate]);
    const targetDateEnd = useMemo(() => endOfDay(targetDate), [targetDate]);

    const attendanceQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(
            collection(firestore, 'users', user.uid, 'attendanceRecords'),
            where('checkInTime', '>=', Timestamp.fromDate(targetDateStart)),
            where('checkInTime', '<', Timestamp.fromDate(targetDateEnd))
        );
    }, [user, firestore, targetDateStart, targetDateEnd]);
    const { data: targetDateAttendance, isLoading: isAttendanceLoading } = useCollection(user, attendanceQuery);

    const leaveQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(
            collection(firestore, 'users', user.uid, 'leaveRequests'),
            where('startDate', '>=', Timestamp.fromDate(targetDateStart)),
            where('startDate', '<=', Timestamp.fromDate(targetDateEnd))
        );
    }, [user, firestore, targetDateStart, targetDateEnd]);
    const { data: targetDateLeave, isLoading: isLeaveLoading } = useCollection(user, leaveQuery);

    const isPastCheckoutTime = useMemo(() => {
        if (!schoolConfig?.checkOutStartTime) return false;
        const [hours, minutes] = schoolConfig.checkOutStartTime.split(':').map(Number);
        const checkOutStart = setMinutes(setHours(startOfDay(currentTime), hours), minutes);
        return currentTime > checkOutStart;
    }, [currentTime, schoolConfig]);

    async function onSubmit(values: z.infer<typeof leaveRequestSchema>) {
        if (!user || !firestore) return;
        
        if (values.leaveDate === 'today' && isPastCheckoutTime) {
            toast({ variant: 'destructive', title: 'Waktu Pengajuan Habis', description: 'Anda tidak dapat mengajukan izin untuk hari ini setelah jam kerja berakhir.' });
            return;
        }

        if (targetDateAttendance && targetDateAttendance.length > 0) {
            toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: `Anda sudah melakukan absensi pada ${format(targetDate, 'd MMMM yyyy', { locale: id })}. Tidak dapat mengajukan izin.` });
            return;
        }

        if (targetDateLeave && targetDateLeave.length > 0) {
            toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: `Anda sudah pernah mengajukan izin untuk ${format(targetDate, 'd MMMM yyyy', { locale: id })}.` });
            return;
        }

        setIsSubmitting(true);

        const dataToSave = {
            userId: user.uid,
            type: values.type,
            startDate: Timestamp.fromDate(startOfDay(targetDate)),
            endDate: Timestamp.fromDate(endOfDay(targetDate)),
            reason: values.reason,
            proofUrl: values.proofUrl || null,
            status: 'pending',
            createdAt: serverTimestamp(),
        };

        const leaveCollectionRef = collection(firestore, 'users', user.uid, 'leaveRequests');
        
        addDoc(leaveCollectionRef, dataToSave)
            .then(() => {
                toast({ title: 'Pengajuan Terkirim', description: 'Pengajuan izin/sakit Anda telah berhasil dikirim.' });
                router.push('/dashboard/laporan');
            })
            .catch((error) => {
                console.error('Failed to submit leave request:', error);
                const contextualError = new FirestorePermissionError({ operation: 'create', path: leaveCollectionRef.path, requestResourceData: dataToSave });
                errorEmitter.emit('permission-error', contextualError);
                toast({ title: 'Gagal Mengirim Pengajuan', description: error.message || 'Terjadi kesalahan. Periksa koneksi Anda dan coba lagi.', variant: 'destructive' });
            })
            .finally(() => setIsSubmitting(false));
    }

    const isChecking = isAttendanceLoading || isLeaveLoading || isSchoolConfigLoading;
    const isTodayAndPastCheckout = selectedDateValue === 'today' && isPastCheckoutTime;

    const todayFormatted = format(new Date(), 'eeee, d MMMM yyyy', { locale: id });
    const tomorrowFormatted = format(addDays(new Date(), 1), 'eeee, d MMMM yyyy', { locale: id });

    return (
        <div className="flex justify-center">
            <Card className="w-full max-w-2xl">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader>
                            <CardTitle>Formulir Pengajuan Izin/Sakit</CardTitle>
                            <CardDescription>Isi formulir di bawah ini untuk mengajukan ketidakhadiran. Anda hanya dapat mengajukan untuk hari ini atau besok.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isTodayAndPastCheckout && (
                                <Alert variant="destructive">
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Waktu Pengajuan Izin Hari Ini Telah Berakhir</AlertTitle>
                                    <AlertDescription>
                                        Anda tidak dapat memilih "Hari Ini" karena telah melewati jam pulang kerja. Silakan pilih "Besok" untuk melanjutkan.
                                    </AlertDescription>
                                </Alert>
                            )}
                            <FormField
                                control={form.control}
                                name="leaveDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Pilih Tanggal Izin</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih tanggal pengajuan" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="today">Hari Ini ({todayFormatted})</SelectItem>
                                                <SelectItem value="tomorrow">Besok ({tomorrowFormatted})</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField control={form.control} name="type" render={({ field }) => (<FormItem><FormLabel>Jenis Pengajuan</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis pengajuan" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Sakit">Sakit</SelectItem><SelectItem value="Izin">Izin</SelectItem><SelectItem value="Dinas">Perjalanan Dinas</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Alasan</FormLabel><FormControl><Textarea placeholder="Jelaskan alasan Anda tidak dapat hadir..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="proofUrl" render={({ field }) => (<FormItem><FormLabel>Link Bukti (Opsional)</FormLabel><FormControl><Input placeholder="https://... (contoh: link Google Drive surat dokter)" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        </CardContent>
                        <CardFooter className="border-t pt-6">
                            <Button type="submit" disabled={isSubmitting || isChecking || isTodayAndPastCheckout}>
                               {(isSubmitting || isChecking) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                               {isChecking ? 'Memeriksa data...' : 'Kirim Pengajuan'}
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}
