'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, writeBatch, Timestamp, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogFooter, 
    DialogTitle, 
    DialogDescription,
    DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { format, parseISO, isValid, startOfDay, endOfDay, addMinutes, isBefore, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { MoreVertical, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { invalidateCache } from '@/lib/cache';
import { cn } from '@/lib/utils';

export default function EditAttendanceModal({ user, month, isOpen, onClose, currentUser }) {
    const firestore = useFirestore();
    const [problematicDays, setProblematicDays] = useState<any[]>([]);
    const [selectedDays, setSelectedDays] = useState<{ [key: string]: boolean }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [schoolConfig, setSchoolConfig] = useState<any>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        if (!isOpen || !firestore || !user) return;
        const getProblematicDays = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                const config = schoolConfigSnap.data() || {};
                if (isMounted.current) setSchoolConfig(config);
                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, month, config);
                
                const problems = reportData.filter(d => 
                    (d.status === 'Alpa') || 
                    (d.description === 'Belum absen pulang') ||
                    (d.description === 'Absen pulang (Tanpa masuk)')
                );
                if (isMounted.current) {
                    setProblematicDays(problems);
                    setSelectedDays({});
                    setIsLoading(false);
                }
            } catch (err) { if (isMounted.current) { setIsLoading(false); setError('Gagal memuat data.'); } }
        };
        getProblematicDays();
        return () => { isMounted.current = false; };
    }, [isOpen, firestore, user, month]);

    const handleSelectDay = (dayId: string) => setSelectedDays(prev => ({ ...prev, [dayId]: !prev[dayId] }));

    const handleAlpaConversionToLeave = async (day: any, newStatus: 'Sakit' | 'Izin' | 'Dinas') => {
        if (!currentUser?.uid || !firestore) return;
        setIsSaving(true);
        try {
            const targetDate = parseISO(day.date);
            const batch = writeBatch(firestore);
            
            const attendanceRef = collection(firestore, 'users', user.uid, 'attendanceRecords');
            const q = query(attendanceRef, where('date', '==', format(targetDate, 'yyyy-MM-dd')));
            const snap = await getDocs(q);
            if (!snap.empty) batch.delete(snap.docs[0].ref);

            const leaveRef = collection(firestore, 'users', user.uid, 'leaveRequests');
            batch.set(doc(leaveRef), {
                userId: user.uid, type: newStatus.includes('Izin') ? 'Izin' : newStatus, status: 'approved',
                startDate: Timestamp.fromDate(startOfDay(targetDate)),
                endDate: Timestamp.fromDate(endOfDay(targetDate)),
                createdAt: serverTimestamp(), approvedBy: currentUser.uid, approvedAt: serverTimestamp(),
                reason: newStatus
            });
            await batch.commit();
            invalidateCache(); 
            setProblematicDays(prev => prev.filter(p => p.id !== day.id));
        } catch (err) { setError("Gagal mengubah status."); }
        finally { setIsSaving(false); }
    };

    const handleAlpaConversionToAttendance = async (day: any, type: 'hadir' | 'terlambat' | 'dinas-pagi' | 'dinas-siang' | 'pulang-cepat' | 'lengkapi-masuk') => {
        if (!currentUser?.uid || !firestore || !schoolConfig) return;
        
        setIsSaving(true);
        try {
            const batch = writeBatch(firestore);
            const recordDate = parseISO(day.date);
            const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);

            const inEnd = schoolConfig.checkInEndTime || '07:30';
            const outStart = schoolConfig.checkOutStartTime || '14:00';
            const [hE, mE] = inEnd.split(':').map(Number);
            const limitIn = setMinutes(setHours(startOfDay(recordDate), hE), mE);
            const [hO, mO] = outStart.split(':').map(Number);
            const limitOutStart = setMinutes(setHours(startOfDay(recordDate), hO), mO);

            let data: any = {
                userId: user.uid, date: format(recordDate, 'yyyy-MM-dd'),
                manualEntry: true, updatedBy: currentUser.uid, updatedAt: serverTimestamp(),
                reasonForUpdate: 'Kehadiran penuh'
            };

            if (type === 'hadir') {
                data.checkInTime = Timestamp.fromDate(new Date(limitIn.getTime() - Math.floor(Math.random() * 5 * 60 * 1000)));
                data.checkOutTime = Timestamp.fromDate(new Date(limitOutStart.getTime() + Math.floor(Math.random() * 5 * 60 * 1000)));
            } else if (type === 'terlambat') {
                data.checkInTime = Timestamp.fromDate(new Date(limitIn.getTime() + Math.floor(Math.random() * 5 * 60 * 1000)));
                data.checkOutTime = Timestamp.fromDate(new Date(limitOutStart.getTime() + Math.floor(Math.random() * 5 * 60 * 1000)));
                data.reasonForUpdate = 'Terlambat';
            } else if (type === 'lengkapi-masuk') {
                data.checkInTime = Timestamp.fromDate(new Date(limitIn.getTime() - Math.floor(Math.random() * 5 * 60 * 1000)));
            } else if (type === 'dinas-pagi') {
                data.checkInTime = null;
                data.checkOutTime = Timestamp.fromDate(new Date(limitOutStart.getTime() + Math.floor(Math.random() * 5 * 60 * 1000)));
                data.reasonForUpdate = 'Dinas pagi';
            } else {
                data.checkInTime = day.checkInTime ? Timestamp.fromDate(parseISO(day.checkInTime)) : Timestamp.fromDate(new Date(limitIn.getTime() - Math.floor(Math.random() * 5 * 60 * 1000)));
                data.checkOutTime = null;
                data.reasonForUpdate = type === 'dinas-siang' ? 'Dinas siang' : 'Pulang cepat';
            }

            batch.set(recordRef, data, { merge: true });
            await batch.commit();
            invalidateCache(); 
            setProblematicDays(prev => prev.filter(p => p.id !== day.id));
        } catch (err) { setError("Gagal menyimpan perubahan."); }
        finally { setIsSaving(false); }
    };

    const handleSaveChanges = async () => {
        const selectedIds = Object.keys(selectedDays).filter(id => selectedDays[id]);
        if (selectedIds.length === 0 || !schoolConfig) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(firestore);
            const outStart = schoolConfig.checkOutStartTime || '14:00';
            const [hO, mO] = outStart.split(':').map(Number);
            
            for (const day of problematicDays.filter(d => selectedDays[d.id])) {
                const limitOutStart = setMinutes(setHours(startOfDay(parseISO(day.date)), hO), mO);
                const realOut = new Date(limitOutStart.getTime() + Math.floor(Math.random() * 5 * 60 * 1000));
                
                batch.set(doc(firestore, 'users', user.uid, 'attendanceRecords', day.id), { 
                    checkOutTime: Timestamp.fromDate(realOut), 
                    updatedBy: currentUser.uid, updatedAt: serverTimestamp(), 
                    reasonForUpdate: 'Kehadiran penuh', manualEntry: true 
                }, { merge: true });
            }
            await batch.commit();
            invalidateCache(); 
            onClose();
        } catch (err) { setError("Gagal menyimpan perubahan."); }
        finally { setIsSaving(false); }
    };

    const getAdminBadgeClass = (status: string) => {
        if (status === 'Alpa') return 'bg-red-50 text-red-700 border-red-200';
        if (status === 'Sakit') return 'bg-orange-50 text-orange-700 border-orange-200';
        if (status === 'Izin' || status.includes('Izin')) return 'bg-blue-50 text-blue-700 border-blue-200';
        return 'bg-orange-50 text-orange-700 border-orange-200';
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md rounded-xl border-none shadow-none p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-normal text-primary">Perbaiki kehadiran</DialogTitle>
                </DialogHeader>
                <div className="px-6 pb-6">
                {isLoading ? (
                    <div className="py-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                ) : problematicDays.length > 0 ? (
                    <div className="py-4">
                        <DialogDescription className="mb-4 text-sm font-bold text-muted-foreground">Pilih data untuk diperbaiki otomatis atau ubah status secara manual.</DialogDescription>
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                            {problematicDays.map(day => {
                                const hasIn = !!day.checkInTime;
                                const hasOut = !!day.checkOutTime;
                                const isNoIn = !hasIn && hasOut;

                                return (
                                    <div key={day.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 border border-muted-foreground/5">
                                        {day.status === 'Alpa' ? <div className="p-1 rounded-full bg-destructive/10"><AlertTriangle className="h-4 w-4 text-destructive" /></div> : <Checkbox checked={!!selectedDays[day.id]} onCheckedChange={() => handleSelectDay(day.id)} />}
                                        <label className="text-sm font-bold grow">{format(parseISO(day.date), 'eeee, d MMM yyyy', { locale: id })}</label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Badge variant="outline" className={cn("cursor-pointer font-bold text-[10px] px-3 py-1 rounded-lg uppercase shadow-none", getAdminBadgeClass(day.status))}>
                                                    {day.status} <MoreVertical className="h-3 w-3 ml-1" />
                                                </Badge>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-xl border-none p-2">
                                                <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest opacity-50 px-3 py-2">Koreksi Kehadiran</DropdownMenuLabel>
                                                {isNoIn ? (
                                                    <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToAttendance(day, 'lengkapi-masuk')}>Lengkapi absen masuk</DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToAttendance(day, 'hadir')}>{hasIn ? 'Lengkapi absen pulang' : 'Jadikan Hadir'}</DropdownMenuItem>
                                                )}
                                                {!hasIn && <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToAttendance(day, 'terlambat')}>Set Terlambat</DropdownMenuItem>}
                                                <DropdownMenuSeparator className='my-1.5 opacity-50' />
                                                <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest opacity-50 px-3 py-2">Ubah Status</DropdownMenuLabel>
                                                {!hasIn && (
                                                    <>
                                                        <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToLeave(day, 'Sakit')}>Jadikan Sakit</DropdownMenuItem>
                                                        <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToLeave(day, 'Izin')}>Jadikan Izin</DropdownMenuItem>
                                                        <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToAttendance(day, 'dinas-pagi')}>Dinas Pagi</DropdownMenuItem>
                                                    </>
                                                )}
                                                <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToAttendance(day, 'dinas-siang')}>Dinas siang</DropdownMenuItem>
                                                <DropdownMenuItem className="rounded-xl py-2.5 px-3 font-bold text-xs" onClick={() => handleAlpaConversionToAttendance(day, 'pulang-cepat')}>Pulang cepat</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center gap-3"><CheckCircle2 className="h-12 w-12 text-green-500 opacity-20" /><p className="text-sm font-bold text-muted-foreground">Semua data kehadiran sudah rapi.</p></div>
                )}
                </div>
                <DialogFooter className="p-6 pt-0 gap-2">
                    <DialogClose asChild><Button variant="ghost" className="rounded-xl font-bold shadow-none">Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} className="rounded-xl font-bold bg-primary uppercase text-xs tracking-wider shadow-none" disabled={isLoading || isSaving || !Object.values(selectedDays).some(Boolean)}>{isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : 'Lengkapi Terpilih'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
