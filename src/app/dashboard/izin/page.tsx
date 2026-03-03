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
import { useUser, useFirestore, FirestorePermissionError, errorEmitter, useCollection, useMemoFirebase } from '@/firebase';
import { addDoc, collection, serverTimestamp, query, where, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Info, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const leaveRequestSchema = z.object({
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
    const [todayFormatted, setTodayFormatted] = useState('');

    useEffect(() => {
        setTodayFormatted(format(new Date(), 'eeee, d MMMM yyyy', { locale: id }));
    }, []);

    const todaysRecordsQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const today = new Date();
        const todayStart = startOfDay(today);
        const todayEnd = endOfDay(today);

        return query(
            collection(firestore, 'users', user.uid, 'attendanceRecords'),
            where('checkInTime', '>=', Timestamp.fromDate(todayStart)),
            where('checkInTime', '<', Timestamp.fromDate(todayEnd))
        );
    }, [user, firestore]);
    const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysRecordsQuery);

    const todaysLeaveQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const today = new Date();
        const todayStart = startOfDay(today);
        const todayEnd = endOfDay(today);

        return query(
            collection(firestore, 'users', user.uid, 'leaveRequests'),
            where('startDate', '>=', Timestamp.fromDate(todayStart)),
            where('startDate', '<=', Timestamp.fromDate(todayEnd))
        );
    }, [user, firestore]);
    const { data: todaysLeave, isLoading: isLeaveLoading } = useCollection(user, todaysLeaveQuery);


    async function onSubmit(values: z.infer<typeof leaveRequestSchema>) {
        if (!user || !firestore) return;

        if (todaysAttendance && todaysAttendance.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Gagal Mengirim Pengajuan',
                description: 'Anda sudah melakukan absensi hari ini. Tidak dapat mengajukan izin.',
            });
            return;
        }

        if (todaysLeave && todaysLeave.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Gagal Mengirim Pengajuan',
                description: 'Anda sudah pernah mengajukan izin untuk hari ini.',
            });
            return;
        }

        setIsSubmitting(true);
        const today = new Date();

        const dataToSave = {
            userId: user.uid,
            type: values.type,
            startDate: Timestamp.fromDate(startOfDay(today)),
            endDate: Timestamp.fromDate(endOfDay(today)),
            reason: values.reason,
            proofUrl: values.proofUrl || null,
            status: 'pending',
            createdAt: serverTimestamp(),
        };

        const leaveCollectionRef = collection(firestore, 'users', user.uid, 'leaveRequests');
        
        addDoc(leaveCollectionRef, dataToSave)
            .then(() => {
                toast({
                    title: 'Pengajuan Terkirim',
                    description: 'Pengajuan izin/sakit Anda telah berhasil dikirim.',
                });
                router.push('/dashboard/laporan');
            })
            .catch((error) => {
                console.error('Failed to submit leave request:', error);
                
                const contextualError = new FirestorePermissionError({
                   operation: 'create',
                   path: leaveCollectionRef.path,
                   requestResourceData: dataToSave
                });
                errorEmitter.emit('permission-error', contextualError);
                
                toast({
                    title: 'Gagal Mengirim Pengajuan',
                    description: error.message || 'Terjadi kesalahan. Periksa koneksi Anda dan coba lagi.',
                    variant: 'destructive',
                });
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    }

    const isChecking = isAttendanceLoading || isLeaveLoading;

    return (
        <div className="flex justify-center">
            <Card className="w-full max-w-2xl">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader>
                            <CardTitle>Formulir Pengajuan Izin/Sakit</CardTitle>
                            <CardDescription>
                                Isi formulir di bawah ini untuk mengajukan ketidakhadiran untuk hari ini.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400">
                                <Info className="h-4 w-4" />
                                <AlertTitle>Informasi Tanggal</AlertTitle>
                                <AlertDescription>
                                    Pengajuan izin ini secara otomatis berlaku untuk hari ini: <span className="font-semibold">{todayFormatted || 'Memuat tanggal...'}</span>.
                                </AlertDescription>
                            </Alert>
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Jenis Pengajuan</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih jenis pengajuan" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="Sakit">Sakit</SelectItem>
                                                <SelectItem value="Izin">Izin</SelectItem>
                                                <SelectItem value="Dinas">Perjalanan Dinas</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                           
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Alasan</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Jelaskan alasan Anda tidak dapat hadir..."
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="proofUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Link Bukti (Opsional)</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="https://... (contoh: link Google Drive surat dokter)"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                        </CardContent>
                        <CardFooter className="border-t pt-6">
                            <Button type="submit" disabled={isSubmitting || isChecking}>
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
