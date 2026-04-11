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
import { PageWrapper } from '@/components/layout/page-wrapper';

const leaveRequestSchema = z.object({
  leaveDate: z.enum(['today', 'tomorrow'], {
    required_error: 'Tanggal pengajuan wajib dipilih.',
  }),
  type: z.enum(['Sakit', 'Izin', 'Dinas', 'Pulang Cepat'], {
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
        const timerId = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timerId);
    }, []);

    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    const selectedDateValue = form.watch('leaveDate');
    const selectedLeaveType = form.watch('type');

    const targetDate = useMemo(() => {
        const now = new Date();
        return selectedDateValue === 'tomorrow' ? addDays(now, 1) : now;
    }, [selectedDateValue]);

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
    
    const hasCheckedIn = useMemo(() => !!(targetDateAttendance && targetDateAttendance[0]?.checkInTime), [targetDateAttendance]);
    const hasCheckedOut = useMemo(() => !!(targetDateAttendance && targetDateAttendance[0]?.checkOutTime), [targetDateAttendance]);

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
    
    // --- FIX: Logic changed to disable options instead of hiding them ---
    const availableLeaveTypes = useMemo(() => {
        const isToday = selectedDateValue === 'today';
        return [
            {
                value: 'Pulang Cepat',
                label: 'Izin Pulang Cepat',
                disabled: !isToday || !hasCheckedIn || hasCheckedOut
            },
            {
                value: 'Sakit',
                label: 'Sakit',
                disabled: hasCheckedIn || (isToday && isPastCheckoutTime)
            },
            {
                value: 'Izin',
                label: 'Izin',
                disabled: hasCheckedIn || (isToday && isPastCheckoutTime)
            },
            {
                value: 'Dinas',
                label: 'Perjalanan Dinas',
                disabled: hasCheckedIn
            },
        ];
    }, [selectedDateValue, hasCheckedIn, hasCheckedOut, isPastCheckoutTime]);

    // Reset leave type if it becomes disabled
    useEffect(() => {
        const selectedType = form.getValues('type');
        if (selectedType) {
            const typeIsDisabled = availableLeaveTypes.find(t => t.value === selectedType)?.disabled;
            if (typeIsDisabled) {
                form.resetField('type', { keepError: false });
            }
        }
    }, [availableLeaveTypes, form]);

    async function onSubmit(values: z.infer<typeof leaveRequestSchema>) {
        if (!user || !firestore) return;
        
        if (values.type === 'Pulang Cepat') {
            if (!hasCheckedIn) {
                toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: 'Anda harus absen masuk terlebih dahulu untuk mengajukan izin pulang cepat.' });
                return;
            }
            if (hasCheckedOut) {
                toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: 'Anda sudah absen pulang. Tidak dapat mengajukan izin pulang cepat.' });
                return;
            }
        } else {
            if (hasCheckedIn) {
                toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: `Anda sudah melakukan absensi hari ini. Tidak dapat mengajukan izin sakit/dinas.` });
                return;
            }
        }

        if (values.leaveDate === 'today' && isPastCheckoutTime && values.type !== 'Pulang Cepat') {
            toast({ variant: 'destructive', title: 'Waktu Pengajuan Habis', description: 'Anda tidak dapat mengajukan izin untuk hari ini setelah jam kerja berakhir.' });
            return;
        }

        if (targetDateLeave && targetDateLeave.length > 0) {
            const existingLeaveType = targetDateLeave[0].type;
            toast({ variant: 'destructive', title: 'Gagal Mengirim Pengajuan', description: `Anda sudah pernah mengajukan '${existingLeaveType}' untuk ${format(targetDate, 'd MMMM yyyy', { locale: id })}.` });
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
                toast({ title: 'Pengajuan Terkirim', description: 'Pengajuan Anda telah berhasil dikirim dan menunggu persetujuan.' });
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

    const getSubmitButtonText = () => {
      if (isChecking) return 'Memeriksa data...';
      if (selectedLeaveType === 'Pulang Cepat') return 'Ajukan Izin Pulang Cepat';
      return 'Kirim Pengajuan Ketidakhadiran';
    }

    return (
        <PageWrapper>
            <Card className="w-full">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader>
                            <CardTitle>Formulir Pengajuan Izin</CardTitle>
                            <CardDescription>Isi formulir untuk mengajukan ketidakhadiran atau izin pulang cepat. Pengajuan akan ditinjau oleh Kepala Sekolah.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             {isTodayAndPastCheckout && !hasCheckedIn && (
                                <Alert variant="destructive">
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Waktu Pengajuan Izin Hari Ini Telah Berakhir</AlertTitle>
                                    <AlertDescription>
                                        Anda tidak dapat lagi mengajukan Izin/Sakit/Dinas untuk hari ini karena telah melewati jam kerja. Silakan pilih "Besok".
                                    </AlertDescription>
                                </Alert>
                            )}
                            
                            {!hasCheckedIn && selectedDateValue === 'today' && (
                                <Alert variant="default">
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Info: Izin Pulang Cepat</AlertTitle>
                                    <AlertDescription>
                                        Opsi "Izin Pulang Cepat" akan aktif setelah Anda melakukan absensi masuk hari ini.
                                    </AlertDescription>
                                </Alert>
                            )}

                            <FormField
                                control={form.control}
                                name="leaveDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Pilih Tanggal Pengajuan</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih tanggal pengajuan" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="today">Hari Ini ({todayFormatted})</SelectItem>
                                                <SelectItem value="tomorrow">Besok ({tomorrowFormatted})</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Jenis Pengajuan</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih jenis pengajuan" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {/* --- FIX: Render items with disabled prop --- */}
                                                {availableLeaveTypes.map(type => (
                                                    <SelectItem key={type.value} value={type.value} disabled={type.disabled}>
                                                        {type.label}
                                                    </SelectItem>
                                                ))}
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
                                            <Textarea placeholder="Jelaskan alasan Anda..." {...field} />
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
                                            <Input placeholder="https://... (contoh: link surat dokter)" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter className="border-t pt-6">
                            <Button type="submit" disabled={isSubmitting || isChecking}>
                               {(isSubmitting || isChecking) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                               {getSubmitButtonText()}
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </PageWrapper>
    );
}
