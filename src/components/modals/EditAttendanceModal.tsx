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
    const randomDate = new Date(randomTimestamp);
    randomDate.setSeconds(Math.floor(Math.random() * 60));
    return randomDate;
};

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
                
                const problems = reportData.filter(d => {
                    const isManualTerminal = d.manualEntry && (d.description === 'Pulang cepat' || d.description === 'Dinas pagi' || d.description === 'Dinas siang');
                    if (isManualTerminal) return false;
                    
                    return (d.status === 'Alpa') || (d.description === 'Belum absen pulang');
                });

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
            if (!snap.empty) {
                batch.delete(snap.docs[0].ref);
            }

            const leaveRef = collection(firestore, 'users', user.uid, 'leaveRequests');
            const newLeaveDoc = doc(leaveRef);
            batch.set(newLeaveDoc, {
                userId: user.uid, type: newStatus === 'Izin' || newStatus === 'Dinas' ? newStatus : 'Sakit', status: 'approved',
                startDate: Timestamp.fromDate(startOfDay(targetDate)),
                endDate: Timestamp.fromDate(endOfDay(targetDate)),
                createdAt: serverTimestamp(), approvedBy: currentUser.uid, approvedAt: serverTimestamp(), createdBy: currentUser.uid,
                reason: newStatus
            });
            await batch.commit();
            invalidateCache(); 
            setProblematicDays(prev => prev.filter(p => p.id !== day.id));
        } catch (err) { setError("Gagal mengubah status."); }
        finally { setIsSaving(false); }
    };

    const handleAlpaConversionToAttendance = async (day: any, type: 'hadir' | 'terlambat' | 'dinas-pagi' | 'dinas-siang' | 'pulang-cepat') => {
        if (!currentUser?.uid || !firestore || !schoolConfig) return;
        
        const { checkInEndTime, checkOutStartTime, checkOutEndTime } = schoolConfig;
        setIsSaving(true);
        try {
            const now = new Date();
            const batch = writeBatch(firestore);
            const recordDate = parseISO(day.date);
            const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);

            let checkInTime: Date | null = null;
            let checkOutTime: Date | null = null;
            let reasonForUpdate: string;

            const [outH_threshold, outM_threshold] = (checkOutStartTime || '14:00').split(':').map(Number);
            const checkOutThreshold = setMinutes(setHours(startOfDay(recordDate), outH_threshold), outM_threshold);
            const shouldFillCheckOut = isBefore(startOfDay(recordDate), startOfDay(now)) || now >= checkOutThreshold;

            const [endH, endM] = (checkInEndTime || '07:30').split(':').map(Number);
            const baseLimit = setMinutes(setHours(startOfDay(recordDate), endH), endM);

            if (type === 'hadir') {
                if (day.checkInTime) {
                    checkInTime = parseISO(day.checkInTime);
                } else {
                    const randomMs = Math.floor(Math.random() * (5 * 60 * 1000));
                    checkInTime = new Date(baseLimit.getTime() - randomMs);
                }
                // ALWAYS fill checkOut for admin correction if manually finalizing
                checkOutTime = getRandomTime(recordDate, checkOutStartTime || '14:00', checkOutEndTime || '16:00');
                reasonForUpdate = 'Kehadiran penuh';
            } else if (type === 'terlambat') {
                const randomMs = Math.floor(Math.random() * (5 * 60 * 1000));
                checkInTime = new Date(baseLimit.getTime() + randomMs);
                checkOutTime = getRandomTime(recordDate, checkOutStartTime || '14:00', checkOutEndTime || '16:00');
                reasonForUpdate = 'Terlambat';
            } else if (type === 'dinas-pagi') {
                checkInTime = null;
                checkOutTime = getRandomTime(recordDate, checkOutStartTime || '14:00', checkOutEndTime || '16:00');
                reasonForUpdate = 'Dinas pagi';
            } else if (type === 'dinas-siang') {
                if (day.checkInTime) {
                    checkInTime = parseISO(day.checkInTime);
                } else {
                    const randomMs = Math.floor(Math.random() * (5 * 60 * 1000));
                    checkInTime = new Date(baseLimit.getTime() - randomMs);
                }
                checkOutTime = getRandomTime(recordDate, "11:00", "13:00");
                reasonForUpdate = 'Dinas siang';
            } else { // pulang-cepat
                if (day.checkInTime) {
                    checkInTime = parseISO(day.checkInTime);
                } else {
                    const randomMs = Math.floor(Math.random() * (5 * 60 * 1000));
                    checkInTime = new Date(baseLimit.getTime() - randomMs);
                }
                checkOutTime = getRandomTime(recordDate, "11:00", "13:00");
                reasonForUpdate = 'Pulang cepat';
            }

            if (checkInTime && checkOutTime && checkOutTime.getTime() <= checkInTime.getTime()) {
                checkOutTime = addMinutes(checkInTime, 240);
            }

            batch.set(recordRef, {
                userId: user.uid, date: format(recordDate, 'yyyy-MM-dd'),
                checkInTime: checkInTime ? Timestamp.fromDate(checkInTime) : null, 
                checkOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : null,
                updatedBy: currentUser.uid, updatedAt: Timestamp.now(), reasonForUpdate: reasonForUpdate, manualEntry: true
            }, { merge: true });

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
            const now = new Date();
            const batch = writeBatch(firestore);
            const daysToUpdate = problematicDays.filter(day => selectedDays[day.id]);
            for (const day of daysToUpdate) {
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);
                const recordDate = parseISO(day.date);
                
                const [endH, endM] = (schoolConfig.checkInEndTime || '07:30').split(':').map(Number);
                const baseLimit = setMinutes(setHours(startOfDay(recordDate), endH), endM);

                let dataToUpdate: any = { 
                    updatedBy: currentUser.uid, 
                    updatedAt: Timestamp.now(), 
                    reasonForUpdate: 'Kehadiran penuh', 
                    manualEntry: true 
                };

                if (!day.checkInTime) {
                    const randomMs = Math.floor(Math.random() * (5 * 60 * 1000));
                    dataToUpdate.checkInTime = Timestamp.fromDate(new Date(baseLimit.getTime() - randomMs));
                } else {
                    dataToUpdate.checkInTime = Timestamp.fromDate(parseISO(day.checkInTime));
                }

                // For bulk "Correction", we always fill checkout time if we are correcting a "Belum absen pulang"
                let checkOutTime = getRandomTime(recordDate, schoolConfig.checkOutStartTime || '14:00', schoolConfig.checkOutEndTime || '16:00');
                const cIn = dataToUpdate.checkInTime.toDate();
                if (checkOutTime.getTime() <= cIn.getTime()) {
                    checkOutTime = addMinutes(cIn, 60);
                }
                dataToUpdate.checkOutTime = Timestamp.fromDate(checkOutTime);

                batch.set(recordRef, dataToUpdate, { merge: true });
            }
            await batch.commit();
            invalidateCache(); 
            onClose();
        } catch (err) { setError("Gagal menyimpan perubahan."); }
        finally { setIsSaving(false); }
    };

    const hasSelection = useMemo(() => Object.values(selectedDays).some(Boolean), [selectedDays]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md rounded-xl border-none shadow-none p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold text-primary">Perbaiki kehadiran</DialogTitle>
                    {error && <Alert variant="destructive" className="mt-4 rounded-xl"><AlertTitle className="font-bold">Kesalahan</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                </DialogHeader>
                <div className="px-6 pb-6">
                {isLoading ? (
                    <div className="py-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
                ) : problematicDays.length > 0 ? (
                    <div className="py-4">
                        <DialogDescription className="mb-4 text-sm font-bold text-muted-foreground">Pilih data untuk diperbaiki atau ubah status alpa secara langsung.</DialogDescription>
                        <div className="max-h-[300px] overflow-y-auto -mr-2 pr-2 space-y-2">
                            {problematicDays.map(day => {
                                const hasIn = !!day.checkInTime;
                                return (
                                    <div key={day.id} className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-muted/50 border border-muted-foreground/5">
                                        {day.status === 'Alpa' ? (
                                            <div className="p-1 rounded-full bg-destructive/10"><AlertTriangle className="h-4 w-4 text-destructive" /></div>
                                        ) : (
                                            <Checkbox id={day.id} checked={!!selectedDays[day.id]} onCheckedChange={() => handleSelectDay(day.id)} className="rounded-md" />
                                        )}
                                        <label htmlFor={day.id} className="text-sm font-bold grow cursor-pointer">{format(parseISO(day.date), 'eeee, d MMM yyyy', { locale: id })}</label>
                                        {day.status === 'Alpa' || !day.checkOutTime ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Badge variant={day.status === 'Alpa' ? 'destructive' : 'secondary'} className="cursor-pointer hover:bg-muted/80 flex items-center px-3 py-1 rounded-lg text-[10px] font-bold">
                                                        {day.status === 'Alpa' ? 'Alpa' : 'Hadir'} <MoreVertical className="h-3 w-3 ml-1" />
                                                    </Badge>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-xl border-none p-2">
                                                    <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2 opacity-50">
                                                        {hasIn ? 'Koreksi Pulang' : 'Koreksi Hadir'}
                                                    </DropdownMenuLabel>
                                                    
                                                    <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'hadir')}>
                                                        {hasIn ? 'Lengkapi absen pulang' : 'Jadikan Hadir'}
                                                    </DropdownMenuItem>

                                                    {!hasIn && (
                                                        <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'terlambat')}>Set Terlambat</DropdownMenuItem>
                                                    )}
                                                    
                                                    <DropdownMenuSeparator className="my-1.5 opacity-50" />
                                                    
                                                    <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2 opacity-50">Ubah Status</DropdownMenuLabel>
                                                    
                                                    {!hasIn && (
                                                        <>
                                                            <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Sakit')}>Set Sakit</DropdownMenuItem>
                                                            <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Izin')}>Set Izin</DropdownMenuItem>
                                                            <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'dinas-pagi')}>Dinas Pagi</DropdownMenuItem>
                                                        </>
                                                    )}
                                                    
                                                    <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'dinas-siang')}>Dinas Siang</DropdownMenuItem>
                                                    <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'pulang-cepat')}>Pulang Cepat</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : (
                                            <Badge variant="secondary" className="whitespace-nowrap rounded-lg text-[10px] font-bold px-3 py-1 bg-amber-50 text-amber-700 border-amber-200">
                                                {day.description}
                                            </Badge>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                        <CheckCircle2 className="h-12 w-12 text-green-500 opacity-20" />
                        <p className="text-sm font-bold text-muted-foreground">Semua data kehadiran sudah rapi.</p>
                    </div>
                )}
                </div>
                <DialogFooter className="p-6 pt-0 flex flex-col sm:flex-row gap-2">
                    <DialogClose asChild><Button variant="ghost" className="rounded-xl font-bold" disabled={isSaving}>Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} className="rounded-xl font-bold shadow-none bg-primary" disabled={isLoading || isSaving || !hasSelection}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Perbaiki terpilih'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
