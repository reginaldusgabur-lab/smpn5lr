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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { format, parseISO, isValid, startOfDay, endOfDay, addMinutes, isSameDay, setHours, setMinutes, isBefore } from 'date-fns';
import { id } from 'date-fns/locale';
import { MoreVertical, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

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

const toDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput === 'string') {
        const parsed = parseISO(dateInput);
        if (isValid(parsed)) return parsed;
    }
    if (typeof dateInput.toDate === 'function') { return dateInput.toDate(); }
    return null;
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
                const problems = reportData.filter(d => (d.status === 'Alpa') || (d.description === 'Tidak absen pulang') || (d.description === 'Belum absen pulang'));
                if (isMounted.current) {
                    setProblematicDays(problems);
                    setSelectedDays({});
                }
            } catch (err) { console.error("Error fetching problematic days:", err); setError('Gagal memuat data.'); }
            finally { if (isMounted.current) setIsLoading(false); }
        };
        getProblematicDays();
        return () => { isMounted.current = false; };
    }, [isOpen, firestore, user, month]);

    const handleSelectDay = (dayId: string) => setSelectedDays(prev => ({ ...prev, [dayId]: !prev[dayId] }));

    const handleAlpaConversionToLeave = async (day: any, newStatus: 'Sakit' | 'Izin' | 'Dinas') => {
        if (!currentUser?.uid || !firestore) return setError("Admin tidak teridentifikasi.");
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
                userId: user.uid, type: newStatus, status: 'approved',
                startDate: Timestamp.fromDate(startOfDay(targetDate)),
                endDate: Timestamp.fromDate(endOfDay(targetDate)),
                createdAt: serverTimestamp(), approvedBy: currentUser.uid, approvedAt: serverTimestamp(), createdBy: currentUser.uid,
                reason: newStatus
            });
            await batch.commit();
            setProblematicDays(prev => prev.filter(p => p.id !== day.id));
        } catch (err) { console.error(err); setError("Gagal mengubah status."); }
        finally { setIsSaving(false); }
    };

    const handleAlpaConversionToAttendance = async (day: any, type: 'hadir' | 'terlambat' | 'dinas') => {
        if (!currentUser?.uid || !firestore) return setError("Admin tidak teridentifikasi.");
        if (!schoolConfig) return setError("Konfigurasi sekolah tidak termuat.");
        
        const { checkInStartTime, checkInEndTime, checkOutStartTime, checkOutEndTime } = schoolConfig;
        if (!checkInEndTime || !checkOutStartTime || !checkOutEndTime) return setError("Konfigurasi jam operasional belum lengkap.");

        setIsSaving(true); setError(null);
        try {
            const batch = writeBatch(firestore);
            const recordDate = parseISO(day.date);
            const now = new Date();
            const isPast = isBefore(recordDate, startOfDay(now));

            const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);

            let checkInTime: Date;
            let checkOutTime: Date | null = null;
            let reasonForUpdate: string;

            if (type === 'hadir' || type === 'dinas') {
                checkInTime = getRandomTime(recordDate, checkInStartTime || '07:00', checkInEndTime);
                reasonForUpdate = type === 'dinas' ? 'Dinas Pagi' : 'Kehadiran penuh';
            } else {
                const [endH, endM] = checkInEndTime.split(':').map(Number);
                const baseLateTime = new Date(recordDate);
                baseLateTime.setHours(endH, endM, 0);
                checkInTime = addMinutes(baseLateTime, Math.floor(Math.random() * 15) + 1);
                reasonForUpdate = 'Terlambat';
            }

            // Always fill check-out for past dates when fixing Alpa
            if (isPast) {
                checkOutTime = getRandomTime(recordDate, checkOutStartTime, checkOutEndTime);
                if (checkOutTime.getTime() <= checkInTime.getTime()) {
                    checkOutTime = addMinutes(checkInTime, 240);
                }
            }

            batch.set(recordRef, {
                userId: user.uid, date: format(recordDate, 'yyyy-MM-dd'),
                checkInTime: Timestamp.fromDate(checkInTime), 
                checkOutTime: checkOutTime ? Timestamp.fromDate(checkOutTime) : null,
                updatedBy: currentUser.uid, updatedAt: Timestamp.now(), reasonForUpdate: reasonForUpdate, manualEntry: true
            }, { merge: true });

            await batch.commit();
            setProblematicDays(prev => prev.filter(p => p.id !== day.id));
        } catch (err) { console.error("Error converting status:", err); setError("Gagal menyimpan perubahan."); }
        finally { setIsSaving(false); }
    };

    const handleSaveChanges = async () => {
        const selectedIds = Object.keys(selectedDays).filter(id => selectedDays[id]);
        if (selectedIds.length === 0) return setError("Tidak ada tanggal yang dipilih.");
        if (!currentUser?.uid || !schoolConfig) return setError("Konfigurasi tidak lengkap.");
        const { checkOutStartTime, checkOutEndTime } = schoolConfig;
        if (!checkOutStartTime || !checkOutEndTime) return setError("Konfigurasi jam pulang tidak lengkap.");

        setIsSaving(true); setError(null);
        try {
            const batch = writeBatch(firestore);
            const daysToUpdate = problematicDays.filter(day => selectedDays[day.id]);
            for (const day of daysToUpdate) {
                if (day.description === 'Tidak absen pulang' || day.description === 'Belum absen pulang') {
                    const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);
                    const originalCheckInTime = toDate(day.checkInTime);
                    if (!originalCheckInTime || !isValid(originalCheckInTime)) continue;
                    
                    let checkOutTime = getRandomTime(parseISO(day.date), checkOutStartTime, checkOutEndTime);
                    if (checkOutTime.getTime() <= originalCheckInTime.getTime()) {
                        checkOutTime = addMinutes(originalCheckInTime, 60);
                    }
                    
                    batch.update(recordRef, { 
                        checkOutTime: Timestamp.fromDate(checkOutTime), 
                        updatedBy: currentUser.uid, 
                        updatedAt: Timestamp.now(), 
                        reasonForUpdate: 'Kehadiran penuh', 
                        manualEntry: true 
                    });
                }
            }
            await batch.commit();
            onClose();
        } catch (err) { console.error(err); setError("Gagal menyimpan perubahan."); }
        finally { setIsSaving(false); }
    };

    const hasSelection = useMemo(() => Object.values(selectedDays).some(Boolean), [selectedDays]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold text-primary">Perbaiki Kehadiran</DialogTitle>
                    {error && <Alert variant="destructive" className="mt-4 rounded-xl"><AlertTitle className="font-bold">Kesalahan</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                </DialogHeader>
                <div className="px-6 pb-6">
                {isLoading ? (
                    <div className="py-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
                ) : problematicDays.length > 0 ? (
                    <div className="py-4">
                        <DialogDescription className="mb-4 text-sm font-medium">Pilih data untuk diperbaiki atau ubah status alpa secara langsung.</DialogDescription>
                        <div className="max-h-[300px] overflow-y-auto -mr-2 pr-2 space-y-2">
                            {problematicDays.map(day => (
                                <div key={day.id} className="flex items-center gap-3 p-3 rounded-2xl transition-colors hover:bg-muted/50 border border-muted-foreground/5">
                                    {day.status === 'Alpa' ? (
                                        <div className="p-1 rounded-full bg-destructive/10"><AlertTriangle className="h-4 w-4 text-destructive" /></div>
                                    ) : (
                                        <Checkbox id={day.id} checked={!!selectedDays[day.id]} onCheckedChange={() => handleSelectDay(day.id)} className="rounded-md" />
                                    )}
                                    <label htmlFor={day.id} className="text-sm font-bold grow cursor-pointer">{format(parseISO(day.date), 'eeee, dd MMMM yyyy', { locale: id })}</label>
                                    {day.status === 'Alpa' ? (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80 flex items-center px-3 py-1 rounded-lg text-[10px] font-bold">Alpa <MoreVertical className="h-3 w-3 ml-1" /></Badge>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl border-none p-2">
                                                <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'hadir')}>Jadikan Hadir</DropdownMenuItem>
                                                <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'terlambat')}>Jadikan Terlambat</DropdownMenuItem>
                                                <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'dinas')}>Dinas Pagi</DropdownMenuItem>
                                                <DropdownMenuSeparator className="my-1.5 opacity-50" />
                                                <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Sakit')}>Set Sakit</DropdownMenuItem>
                                                <DropdownMenuItem className="rounded-xl cursor-pointer py-2 px-3 font-bold text-xs" disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Izin')}>Set Izin</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    ) : (
                                        <Badge variant="secondary" className="whitespace-nowrap rounded-lg text-[10px] font-bold px-3 py-1 bg-amber-50 text-amber-700 border-amber-200">
                                            {day.description}
                                        </Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                        <CheckCircle2 className="h-12 w-12 text-green-500 opacity-20" />
                        <p className="text-sm font-medium text-muted-foreground">Semua data kehadiran sudah rapi.</p>
                    </div>
                )}
                </div>
                <DialogFooter className="p-6 pt-0 flex flex-col sm:flex-row gap-2">
                    <DialogClose asChild><Button variant="ghost" className="rounded-xl font-bold" disabled={isSaving}>Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} className="rounded-xl font-bold shadow-lg bg-primary" disabled={isLoading || isSaving || !hasSelection}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Perbaiki Terpilih'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}