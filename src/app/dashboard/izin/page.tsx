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
import { Loader2 } from 'lucide-react';
import { startOfDay, endOfDay, addDays, setHours, setMinutes } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { PageWrapper } from '@/components/layout/page-wrapper';

const leaveRequestSchema = z.object({
  leaveDate: z.enum(['today', 'tomorrow'], {
    required_error: 'Tanggal pengajuan wajib dipilih.',
  }),
  type: z.enum(['Sakit', 'Izin', 'Dinas', 'Pulang Cepat'], {
    required_error: 'Jenis pengajuan wajib dipilih.',
  }),
  reason: z.string().min(5, { message: 'Alasan terlalu singkat.' }),
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

    const isPastCheckoutTime = useMemo(() => {
        if (!schoolConfig?.checkOutStartTime) return false;
        const [hours, minutes] = schoolConfig.checkOutStartTime.split(':').map(Number);
        const checkOutStart = setMinutes(setHours(startOfDay(currentTime), hours), minutes);
        return currentTime > checkOutStart;
    }, [currentTime, schoolConfig]);
    
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
                toast({ variant: 'destructive', title: 'Gagal', description: 'Anda harus absen masuk terlebih dahulu.' });
                return;
            }
        } else {
            if (hasCheckedIn) {
                toast({ variant: 'destructive', title: 'Gagal', description: `Anda sudah melakukan absensi hari ini.` });
                return;
            }
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
                toast({ title: 'Terkirim', description: 'Pengajuan Anda telah dikirim.' });
                router.push('/dashboard/laporan');
            })
            .catch((error) => {
                const contextualError = new FirestorePermissionError({ operation: 'create', path: leaveCollectionRef.path, requestResourceData: dataToSave });
                errorEmitter.emit('permission-error', contextualError);
                toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
            })
            .finally(() => setIsSubmitting(false));
    }

    const isChecking = isAttendanceLoading || isSchoolConfigLoading;

    return (
        <PageWrapper>
            <Card className="w-full overflow-hidden border shadow-none rounded-xl">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader className="p-4 sm:p-6 text-primary border-b border-muted-foreground/10">
                            <CardTitle className="font-bold text-sm tracking-tight">Formulir Pengajuan Izin</CardTitle>
                            <CardDescription className="text-muted-foreground font-medium pt-1">Isi formulir untuk mengajukan ketidakhadiran atau izin pulang cepat.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="leaveDate"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Pilih Tanggal</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10 shadow-none">
                                                        <SelectValue placeholder="Pilih tanggal" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="rounded-xl border-none shadow-none">
                                                    <SelectItem value="today" className="rounded-lg">Hari Ini</SelectItem>
                                                    <SelectItem value="tomorrow" className="rounded-lg">Besok</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="type"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Jenis Pengajuan</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10 shadow-none">
                                                        <SelectValue placeholder="Pilih jenis" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="rounded-xl border-none shadow-none">
                                                    {availableLeaveTypes.map(type => (
                                                        <SelectItem key={type.value} value={type.value} disabled={type.disabled} className="rounded-lg">
                                                            {type.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem className="space-y-1.5">
                                        <FormLabel className="text-xs font-bold ml-1">Alasan</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Contoh: Demam, Kegiatan Keluarga..." {...field} className="min-h-[120px] rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all" />
                                        </FormControl>
                                        <FormMessage className="text-[10px] font-bold" />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter className="border-t p-6 bg-muted/5">
                            <Button type="submit" disabled={isSubmitting || isChecking} className="w-full sm:w-auto h-11 rounded-xl font-bold tracking-normal shadow-none active:scale-95 transition-all bg-primary">
                               {(isSubmitting || isChecking) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                               Kirim Pengajuan
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </PageWrapper>
    );
}