
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, writeBatch, Timestamp, collection, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore';
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
import { format, parseISO, isValid, startOfDay, endOfDay, addMinutes, isSameDay, setHours, setMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { MoreVertical } from 'lucide-react';

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

    useEffect(() => {
        if (!isOpen || !firestore || !user) return;
        const getProblematicDays = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                const config = schoolConfigSnap.data() || {};
                setSchoolConfig(config);
                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, month, config);
                const problems = reportData.filter(d => (d.status === 'Alpa' && d.description === 'Tidak Ada Keterangan') || (d.description === 'Tidak Absen Pulang'));
                setProblematicDays(problems);
                setSelectedDays({});
            } catch (err) { console.error("Error fetching problematic days:", err); setError('Gagal memuat data.'); }
            finally { setIsLoading(false); }
        };
        getProblematicDays();
    }, [isOpen, firestore, user, month]);

    const handleSelectDay = (dayId: string) => setSelectedDays(prev => ({ ...prev, [dayId]: !prev[dayId] }));

    const handleAlpaConversionToLeave = async (day: any, newStatus: 'Sakit' | 'Izin' | 'Dinas') => {
        if (!currentUser?.uid || !firestore) return setError("Admin tidak teridentifikasi.");
        setIsSaving(true);
        try {
            const targetDate = parseISO(day.date);
            const batch = writeBatch(firestore);
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

    const handleAlpaConversionToAttendance = async (day: any, type: 'hadir' | 'terlambat') => {
        if (!currentUser?.uid || !firestore) return setError("Admin tidak teridentifikasi.");
        if (!schoolConfig) return setError("Konfigurasi sekolah tidak termuat.");
        const { checkInStartTime, checkInEndTime, checkOutStartTime, checkOutEndTime } = schoolConfig;
        if (!checkInEndTime || !checkOutStartTime || !checkOutEndTime) return setError("Konfigurasi jam masuk/pulang belum lengkap.");

        setIsSaving(true); setError(null);
        try {
            const batch = writeBatch(firestore);
            const recordDate = parseISO(day.date);
            const now = new Date();
            const isToday = isSameDay(recordDate, now);

            const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);

            let checkInTime: Date;
            let checkOutTime: Date | null = null;
            let reasonForUpdate: string;

            if (type === 'hadir') {
                checkInTime = getRandomTime(recordDate, checkInStartTime || '07:00', checkInEndTime);
                reasonForUpdate = 'Kehadiran Penuh';
            } else {
                const [endH, endM] = checkInEndTime.split(':').map(Number);
                const baseLateTime = new Date(recordDate);
                baseLateTime.setHours(endH, endM, 0);
                checkInTime = addMinutes(baseLateTime, Math.floor(Math.random() * 10) + 1);
                reasonForUpdate = 'Terlambat';
            }
            
            const [outStartH, outStartM] = checkOutStartTime.split(':').map(Number);
            const checkOutLimit = setMinutes(setHours(new Date(now), outStartH), outStartM);

            if (!isToday || (isToday && now >= checkOutLimit)) {
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
            });

            await batch.commit();
            setProblematicDays(prev => prev.filter(p => p.id !== day.id));
        } catch (err) { console.error("Error converting Alpa status:", err); setError("Gagal menyimpan perubahan."); }
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
                if (day.description === 'Tidak Absen Pulang') {
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
                        reasonForUpdate: 'Kehadiran Penuh', 
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Perbaiki Kehadiran</DialogTitle>
                    {error && <Alert variant="destructive" className="mt-4"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                </DialogHeader>
                {isLoading ? (
                    <div className="py-4 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
                ) : problematicDays.length > 0 ? (
                    <div className="py-4">
                        <DialogDescription className="mb-4">Pilih data untuk diperbaiki atau ubah status Alpa secara langsung.</DialogDescription>
                        <div className="max-h-[300px] overflow-y-auto -mr-2 pr-2 space-y-1">
                            {problematicDays.map(day => (
                                <div key={day.id} className="flex items-center gap-3 p-2 rounded-md transition-colors hover:bg-muted/50">
                                    {day.status === 'Alpa' ? <div className="w-5 h-5 shrink-0" /> : <Checkbox id={day.id} checked={!!selectedDays[day.id]} onCheckedChange={() => handleSelectDay(day.id)} className="w-5 h-5 shrink-0" />}
                                    <label htmlFor={day.id} className="text-sm font-medium grow">{format(parseISO(day.date), 'eeee, dd MMMM yyyy', { locale: id })}</label>
                                    {day.status === 'Alpa' ? (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Badge variant="destructive" className="cursor-pointer hover:bg-destructive/80 flex items-center">Alpa <MoreVertical className="h-3 w-3 ml-1" /></Badge>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'hadir')}>Jadikan Hadir</DropdownMenuItem>
                                                <DropdownMenuItem disabled={isSaving} onClick={() => handleAlpaConversionToAttendance(day, 'terlambat')}>Jadikan Terlambat</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Sakit')}>Ubah ke Sakit</DropdownMenuItem>
                                                <DropdownMenuItem disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Izin')}>Ubah ke Izin</DropdownMenuItem>
                                                <DropdownMenuItem disabled={isSaving} onClick={() => handleAlpaConversionToLeave(day, 'Dinas')}>Ubah ke Dinas</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    ) : <Badge variant="secondary" className="whitespace-nowrap">Tidak Absen Pulang</Badge>}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data yang perlu diperbaiki.</p>}
                <DialogFooter className="pt-4">
                    <DialogClose asChild><Button variant="ghost" disabled={isSaving}>Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isLoading || isSaving || !hasSelection}>
                        {isSaving ? 'Menyimpan...' : 'Perbaiki yang Dipilih'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
