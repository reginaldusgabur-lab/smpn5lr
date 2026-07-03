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
import { addDoc, collection, serverTimestamp, query, where, Timestamp, doc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { startOfDay, endOfDay, addDays, setHours, setMinutes, format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { PageWrapper } from '@/components/layout/page-wrapper';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
    const [isCancelling, setIsCancelling] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timerId);
    }, []);

    // Stabilize reference dates to prevent infinite re-renders
    const { today, tomorrow, currentMonthId, nextMonthId } = useMemo(() => {
        const t = startOfDay(currentTime);
        const tom = addDays(t, 1);
        return {
            today: t,
            tomorrow: tom,
            currentMonthId: format(t, 'yyyy-MM'),
            nextMonthId: format(tom, 'yyyy-MM')
        };
    }, [currentTime]);

    const schoolConfigRef = useMemoFirebase(() => user ? doc(firestore, 'schoolConfig', 'default') : null, [firestore, user]);
    const { data: schoolConfig, isLoading: isSchoolConfigLoading } = useDoc(user, schoolConfigRef);

    const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', currentMonthId) : null, [firestore, currentMonthId]);
    const { data: monthlyConfig, isLoading: isMonthlyLoading } = useDoc(user, monthlyConfigRef);

    const nextMonthlyConfigRef = useMemoFirebase(() => 
        (firestore && currentMonthId !== nextMonthId) ? doc(firestore, 'monthlyConfigs', nextMonthId) : null, 
        [firestore, currentMonthId, nextMonthId]
    );
    const { data: nextMonthlyConfig, isLoading: isNextMonthlyLoading } = useDoc(user, nextMonthlyConfigRef);

    const isDateHoliday = (date: Date) => {
        if (!schoolConfig) return false;
        if (schoolConfig.isAttendanceActive === false) return true;
        const offDays = schoolConfig.offDays ?? [0, 6];
        if (offDays.includes(date.getDay())) return true;
        const dateStr = format(date, 'yyyy-MM-dd');
        const monthId = format(date, 'yyyy-MM');
        const relevantConfig = monthId === currentMonthId ? monthlyConfig : nextMonthlyConfig;
        if (relevantConfig?.holidays?.includes(dateStr)) return true;
        return false;
    };

    const isTodayHoliday = useMemo(() => isDateHoliday(today), [schoolConfig, monthlyConfig, today, currentMonthId]);
    const isTomorrowHoliday = useMemo(() => isDateHoliday(tomorrow), [schoolConfig, nextMonthlyConfig, tomorrow, currentMonthId, nextMonthId]);

    const selectedDateValue = form.watch('leaveDate');
    const targetDate = useMemo(() => {
        return selectedDateValue === 'tomorrow' ? tomorrow : today;
    }, [selectedDateValue, today, tomorrow]);

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
        const isTodaySelected = selectedDateValue === 'today';
        return [
            {
                value: 'Pulang Cepat',
                label: 'Izin Pulang Cepat',
                disabled: !isTodaySelected || !hasCheckedIn || hasCheckedOut || !!currentDayLeave
            },
            {
                value: 'Sakit',
                label: 'Sakit',
                disabled: hasCheckedIn || (isTodaySelected && isPastCheckoutTime) || !!currentDayLeave
            },
            {
                value: 'Izin',
                label: 'Izin Pribadi',
                disabled: hasCheckedIn || (isTodaySelected && isPastCheckoutTime) || !!currentDayLeave
            },
            {
                value: 'Dinas',
                label: 'Perjalanan Dinas',
                disabled: !!currentDayLeave
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

    async function handleCancelLeave() {
        if (!user || !firestore || !currentDayLeave) return;
        setIsCancelling(true);
        try {
            const leaveRef = doc(firestore, 'users', user.uid, 'leaveRequests', currentDayLeave.id);
            await deleteDoc(leaveRef);
            toast({ title: 'Berhasil dibatalkan', description: 'Pengajuan izin Anda telah dihapus.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Gagal membatalkan', description: error.message });
        } finally {
            setIsCancelling(false);
        }
    }

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

    const isChecking = isAttendanceLoading || isSchoolConfigLoading || isLeavesLoading || isMonthlyLoading || isNextMonthlyLoading;

    return (
        <PageWrapper>
            <Card className="w-full overflow-hidden border border-muted-foreground/10 shadow-none rounded-xl bg-card">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <CardHeader className="p-4 sm:p-6 text-primary border-b border-muted-foreground/10">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="font-bold text-sm tracking-tight">Formulir Pengajuan Izin</CardTitle>
                                    <CardDescription className="text-muted-foreground font-medium pt-1">Isi formulir untuk mengajukan ketidakhadiran atau izin pulang cepat.</CardDescription>
                                </div>
                                {currentDayLeave && (
                                    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-xl border border-border/50">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status:</span>
                                        {currentDayLeave.status === 'pending' ? (
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 animate-pulse font-bold px-3">
                                                    <Clock className="w-3 h-3 mr-1.5" /> Menunggu
                                                </Badge>
                                                
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full" disabled={isCancelling}>
                                                            {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent className="rounded-2xl border-none shadow-2xl">
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle className="font-bold">Batalkan pengajuan?</AlertDialogTitle>
                                                            <AlertDialogDescription className="text-sm font-medium">
                                                                Apakah Anda yakin ingin membatalkan pengajuan <strong>{currentDayLeave.type}</strong> ini?
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel className="rounded-xl font-bold">Kembali</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleCancelLeave} className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold text-white border-none">Ya, Batalkan</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        ) : currentDayLeave.status === 'approved' ? (
                                            <Badge variant="default" className="bg-green-500 text-white font-bold px-3 border-none">
                                                <CheckCircle2 className="w-3 h-3 mr-1.5" /> Disetujui
                                            </Badge>
                                        ) : (
                                            <Badge variant="destructive" className="font-bold px-3 border-none">Ditolak</Badge>
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
                                        <p className="text-[11px] text-muted-foreground font-bold leading-relaxed">
                                            Anda telah mengajukan <strong>{currentDayLeave.type}</strong> untuk tanggal ini. 
                                            {currentDayLeave.status === 'pending' ? ' Anda dapat membatalkan pengajuan ini sebelum diproses.' : ' Pengajuan Anda sudah selesai diproses.'}
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
                                            <FormLabel className="text-xs font-bold ml-1 uppercase tracking-wider text-muted-foreground">Pilih Tanggal</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 shadow-none font-bold">
                                                        <SelectValue placeholder="Pilih tanggal" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="rounded-xl border-none shadow-2xl">
                                                    <SelectItem value="today" disabled={isTodayHoliday} className="rounded-lg font-bold">
                                                        Hari Ini {isTodayHoliday && '(Libur)'}
                                                    </SelectItem>
                                                    <SelectItem value="tomorrow" disabled={isTomorrowHoliday} className="rounded-lg font-bold">
                                                        Besok {isTomorrowHoliday && '(Libur)'}
                                                    </SelectItem>
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
                                            <FormLabel className="text-xs font-bold ml-1 uppercase tracking-wider text-muted-foreground">Jenis Pengajuan</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value} disabled={!!currentDayLeave || (selectedDateValue === 'today' && isTodayHoliday) || (selectedDateValue === 'tomorrow' && isTomorrowHoliday)}>
                                                <FormControl>
                                                    <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 shadow-none font-bold">
                                                        <SelectValue placeholder="Pilih jenis" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="rounded-xl border-none shadow-2xl">
                                                    {availableLeaveTypes.map(type => (
                                                        <SelectItem key={type.value} value={type.value} disabled={type.disabled} className="rounded-lg font-bold">
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
                                        <FormLabel className="text-xs font-bold ml-1 uppercase tracking-wider text-muted-foreground">Alasan</FormLabel>
                                        <FormControl>
                                            <Textarea 
                                                placeholder="Contoh: Demam, Kegiatan Keluarga..." 
                                                disabled={!!currentDayLeave || (selectedDateValue === 'today' && isTodayHoliday) || (selectedDateValue === 'tomorrow' && isTomorrowHoliday)}
                                                {...field} 
                                                className="min-h-[120px] rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all font-bold" 
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
                                disabled={isSubmitting || isChecking || !!currentDayLeave || (selectedDateValue === 'today' && isTodayHoliday) || (selectedDateValue === 'tomorrow' && isTomorrowHoliday)} 
                                className={cn(
                                    "w-full sm:w-auto h-12 rounded-xl font-black tracking-widest shadow-none active:scale-95 transition-all bg-primary uppercase",
                                    currentDayLeave?.status === 'pending' && "bg-amber-500 hover:bg-amber-600"
                                )}
                            >
                               {isSubmitting || isChecking ? (
                                   <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> PROSES...</>
                               ) : currentDayLeave ? (
                                   "DATA SUDAH ADA"
                               ) : (
                                   "KIRIM PENGAJUAN"
                               )}
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </PageWrapper>
    );
}
