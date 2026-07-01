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
import { Loader2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { startOfDay, endOfDay, addDays, setHours, setMinutes, format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

    // Query untuk mengecek absensi pada tanggal target
    const attendanceQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(
            collection(firestore, 'users', user.uid, 'attendanceRecords'),
            where('checkInTime', '>=', Timestamp.fromDate(targetDateStart)),
            where('checkInTime', '<', Timestamp.fromDate(targetDateEnd))
        );
    }, [user, firestore, targetDateStart, targetDateEnd]);
    const { data: targetDateAttendance, isLoading: isAttendanceLoading } = useCollection(user, attendanceQuery);
    
    // Query untuk mengecek apakah sudah ada pengajuan izin pada tanggal target
    const existingLeaveQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return query(
            collection(firestore, 'users', user.uid, 'leaveRequests'),
            where('startDate', '==', Timestamp.fromDate(targetDateStart))
        );
    }, [user, firestore, targetDateStart]);
    const { data: existingLeaves, isLoading: isLeavesLoading } = useCollection(user, existingLeaveQuery);
    const currentDayLeave = existingLeaves?.[0];

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
                disabled: !isToday || !hasCheckedIn || hasCheckedOut || !!currentDayLeave
            },
            {
                value: 'Sakit',
                label: 'Sakit',
                disabled: hasCheckedIn || (isToday && isPastCheckoutTime) || !!currentDayLeave
            },
            {
                value: 'Izin',
                label: 'Izin',
                disabled: hasCheckedIn || (isToday && isPastCheckoutTime) || !!currentDayLeave
            },
            {
                value: 'Dinas',
                label: 'Perjalanan Dinas',
                disabled: hasCheckedIn || !!currentDayLeave
            },
        ];
    }, [selectedDateValue, hasCheckedIn, hasCheckedOut, isPastCheckoutTime, currentDayLeave]);

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
        
        if (currentDayLeave) {
            toast({ variant: 'destructive', title: 'Sudah ada pengajuan', description: 'Anda sudah mengirim pengajuan untuk tanggal ini.' });
            return;
        }

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
                form.reset();
            })
            .catch((error) => {
                const contextualError = new FirestorePermissionError({ operation: 'create', path: leaveCollectionRef.path, requestResourceData: dataToSave });
                errorEmitter.emit('permission-error', contextualError);
                toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
            })
            .finally(() => setIsSubmitting(false));
    }

    const isChecking = isAttendanceLoading || isSchoolConfigLoading || isLeavesLoading;

    return (
        <PageWrapper>
            <Card className="w-full overflow-hidden border shadow-none rounded-xl">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader className="p-4 sm:p-6 text-primary border-b border-muted-foreground/10">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="font-bold text-sm tracking-tight">Formulir Pengajuan Izin</CardTitle>
                                    <CardDescription className="text-muted-foreground font-medium pt-1">Isi formulir untuk mengajukan ketidakhadiran atau izin pulang cepat.</CardDescription>
                                </div>
                                {currentDayLeave && (
                                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-xl border border-border/50">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status Anda:</span>
                                        {currentDayLeave.status === 'pending' ? (
                                            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 animate-pulse font-bold px-3">
                                                <Clock className="w-3 h-3 mr-1.5" /> Menunggu
                                            </Badge>
                                        ) : currentDayLeave.status === 'approved' ? (
                                            <Badge variant="default" className="bg-green-500 text-white font-bold px-3">
                                                <CheckCircle2 className="w-3 h-3 mr-1.5" /> Disetujui
                                            </Badge>
                                        ) : (
                                            <Badge variant="destructive" className="font-bold px-3">Ditolak</Badge>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            {currentDayLeave && (
                                <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-primary">Informasi Pengajuan</p>
                                        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                                            Anda telah mengajukan <strong>{currentDayLeave.type}</strong> untuk tanggal ini. 
                                            Harap tunggu persetujuan dari Kepala Sekolah sebelum mengajukan izin kembali.
                                        </p>
                                    </div>
                                </div>
                            )}

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
                                            <Select onValueChange={field.onChange} value={field.value} disabled={!!currentDayLeave}>
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
                                            <Textarea 
                                                placeholder="Contoh: Demam, Kegiatan Keluarga..." 
                                                disabled={!!currentDayLeave}
                                                {...field} 
                                                className="min-h-[120px] rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all" 
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[10px] font-bold" />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter className="border-t p-6 bg-muted/5">
                            <Button 
                                type="submit" 
                                disabled={isSubmitting || isChecking || !!currentDayLeave} 
                                className={cn(
                                    "w-full sm:w-auto h-11 rounded-xl font-bold tracking-normal shadow-none active:scale-95 transition-all",
                                    currentDayLeave?.status === 'pending' ? "bg-amber-500 hover:bg-amber-600" : "bg-primary"
                                )}
                            >
                               {isSubmitting || isChecking ? (
                                   <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...</>
                               ) : currentDayLeave?.status === 'pending' ? (
                                   <><Clock className="mr-2 h-4 w-4" /> Menunggu Persetujuan</>
                               ) : currentDayLeave?.status === 'approved' ? (
                                   <><CheckCircle2 className="mr-2 h-4 w-4" /> Sudah Disetujui</>
                               ) : (
                                   "Kirim Pengajuan"
                               )}
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </PageWrapper>
    );
}
