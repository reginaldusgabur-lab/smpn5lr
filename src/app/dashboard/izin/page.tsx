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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUser, useFirestore, FirestorePermissionError, errorEmitter } from '@/firebase';
import { addDoc, collection, serverTimestamp, query, where, Timestamp, getDocs, Firestore } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

const leaveRequestSchema = z.object({
  dateOption: z.enum(['today', 'tomorrow'], {
      required_error: 'Anda harus memilih tanggal izin.'
  }),
  type: z.enum(['Sakit', 'Izin', 'Dinas'], {
    required_error: 'Jenis pengajuan wajib dipilih.',
  }),
  reason: z.string().min(10, { message: 'Alasan harus diisi minimal 10 karakter.' }),
  proofUrl: z.string().url({ message: 'URL bukti tidak valid.' }).optional().or(z.literal('')),
});

async function checkExistingData(firestore: Firestore, user: User | null, selectedDate: Date) {
    if (!user || !firestore) return { attendance: [], leave: [] };

    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);

    const attendanceQuery = query(
        collection(firestore, 'users', user.uid, 'attendanceRecords'),
        where('checkInTime', '>=', Timestamp.fromDate(dayStart)),
        where('checkInTime', '<', Timestamp.fromDate(dayEnd))
    );

    const leaveQuery = query(
        collection(firestore, 'users', user.uid, 'leaveRequests'),
        where('startDate', '>=', Timestamp.fromDate(dayStart)),
        where('startDate', '<=', Timestamp.fromDate(dayEnd))
    );

    const [attendanceSnapshot, leaveSnapshot] = await Promise.all([
        getDocs(attendanceQuery),
        getDocs(leaveQuery)
    ]);

    return {
        attendance: attendanceSnapshot.docs.map(doc => doc.data()),
        leave: leaveSnapshot.docs.map(doc => doc.data())
    };
}

export default function IzinPage() {
    const form = useForm<z.infer<typeof leaveRequestSchema>>({
        resolver: zodResolver(leaveRequestSchema),
        defaultValues: {
            dateOption: 'today',
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
    
    const selectedDateOption = form.watch('dateOption');
    
    const selectedDate = useMemo(() => {
        const today = startOfDay(new Date());
        return selectedDateOption === 'tomorrow' ? addDays(today, 1) : today;
    }, [selectedDateOption]);

    const { data: existingData, isLoading: isChecking } = useQuery({
        queryKey: ['leave-requests', user?.uid, selectedDate.toISOString()],
        queryFn: () => checkExistingData(firestore, user, selectedDate),
        enabled: !!user && !!firestore,
    });

    async function onSubmit(values: z.infer<typeof leaveRequestSchema>) {
        if (!user || !firestore || !existingData) return;
        
        const finalDate = values.dateOption === 'tomorrow' ? addDays(new Date(), 1) : new Date();

        if (existingData.attendance.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Gagal Mengirim Pengajuan',
                description: `Anda sudah melakukan absensi pada ${format(finalDate, 'd MMMM yyyy')}. Tidak dapat mengajukan izin.`,
            });
            return;
        }

        if (existingData.leave.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Gagal Mengirim Pengajuan',
                description: `Anda sudah pernah mengajukan izin untuk tanggal ${format(finalDate, 'd MMMM yyyy')}.`,
            });
            return;
        }

        setIsSubmitting(true);
        
        const dataToSave = {
            userId: user.uid,
            type: values.type,
            startDate: Timestamp.fromDate(startOfDay(finalDate)),
            endDate: Timestamp.fromDate(endOfDay(finalDate)),
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

    return (
        <div className="flex justify-center p-4">
            <Card className="w-full max-w-2xl">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <CardHeader>
                            <CardTitle>Formulir Pengajuan Izin/Sakit</CardTitle>
                            <CardDescription>
                                Pilih tanggal, jenis pengajuan, dan isi alasan Anda untuk mengajukan ketidakhadiran.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField
                                control={form.control}
                                name="dateOption"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Pilih Tanggal Izin</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                                className="flex items-center space-x-4"
                                            >
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                        <RadioGroupItem value="today" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        Hari Ini ({format(new Date(), "d MMM")})
                                                    </FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                        <RadioGroupItem value="tomorrow" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        Besok ({format(addDays(new Date(), 1), "d MMM")})
                                                    </FormLabel>
                                                </FormItem>
                                            </RadioGroup>
                                        </FormControl>
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
                                )}/>
                           
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
                                )}/>
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
                                )}/>
                        </CardContent>
                        <CardFooter>
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
