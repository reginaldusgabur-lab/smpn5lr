'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, writeBatch, Timestamp } from 'firebase/firestore';
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
import { format, parseISO, isValid } from 'date-fns';
import { id } from 'date-fns/locale';

const getRandomTime = (baseDate: Date, startTimeStr: string, endTimeStr: string): Date => {
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const startDate = new Date(baseDate.getTime());
    startDate.setHours(startH, startM, 0, 0);
    const endDate = new Date(baseDate.getTime());
    endDate.setHours(endH, endM, 0, 0);
    if (endDate < startDate) {
        endDate.setDate(endDate.getDate() + 1);
    }
    const randomTimestamp = startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
    const randomDate = new Date(randomTimestamp);
    randomDate.setSeconds(Math.floor(Math.random() * 60));
    return randomDate;
};

// Helper to convert various date types to a JS Date object
const toDate = (dateInput: any): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    if (typeof dateInput === 'string') {
        const parsed = parseISO(dateInput);
        if (isValid(parsed)) return parsed;
    }
    if (typeof dateInput.toDate === 'function') { // Firebase Timestamp
        return dateInput.toDate();
    }
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
                const problems = reportData.filter(d => 
                    (d.status === 'Alpa' && d.description === 'Tidak Ada Keterangan') || 
                    (d.description === 'Tidak Absen Pulang')
                );
                setProblematicDays(problems);
                setSelectedDays({});
            } catch (err) {
                console.error("Error fetching problematic days:", err);
                setError('Gagal memuat data kehadiran. Silakan coba lagi.');
            } finally {
                setIsLoading(false);
            }
        };
        getProblematicDays();
    }, [isOpen, firestore, user, month]);

    const handleSelectDay = (dayId: string) => {
        setSelectedDays(prev => ({ ...prev, [dayId]: !prev[dayId] }));
    };

    const handleSaveChanges = async () => {
        const selectedIds = Object.keys(selectedDays).filter(id => selectedDays[id]);
        if (selectedIds.length === 0) return setError("Tidak ada tanggal yang dipilih.");
        if (!currentUser?.uid) return setError("Gagal mengidentifikasi admin. Silakan muat ulang halaman.");
        if (!schoolConfig) return setError("Konfigurasi sekolah tidak termuat. Tidak dapat memproses.");

        const { checkInEndTime, checkOutStartTime, checkOutEndTime } = schoolConfig;
        if (!checkInEndTime || !checkOutStartTime || !checkOutEndTime) {
            return setError("Konfigurasi jam masuk/pulang tidak lengkap. Harap periksa pengaturan sekolah.");
        }

        setIsSaving(true);
        setError(null);

        try {
            const batch = writeBatch(firestore);
            const daysToUpdate = problematicDays.filter(day => selectedDays[day.id]);

            for (const day of daysToUpdate) {
                const recordDate = parseISO(day.date);
                if (day.status === 'Alpa') {
                    const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);
                    const checkInTime = getRandomTime(recordDate, '07:15', checkInEndTime);
                    let checkOutTime = getRandomTime(recordDate, checkOutStartTime, checkOutEndTime);
                    if (checkOutTime.getTime() <= checkInTime.getTime()) {
                        checkOutTime = new Date(checkInTime.getTime() + (6 * 60 * 60 * 1000));
                    }
                    batch.set(recordRef, { userId: user.uid, date: day.id, checkInTime: Timestamp.fromDate(checkInTime), checkOutTime: Timestamp.fromDate(checkOutTime), checkInLatitude: null, checkInLongitude: null, checkOutLatitude: null, checkOutLongitude: null, updatedBy: currentUser.uid, updatedAt: Timestamp.now(), reasonForUpdate: 'Input oleh Admin (Alpa)', manualEntry: true });
                } 
                else if (day.description === 'Tidak Absen Pulang') {
                    const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);
                    
                    // --- ROOT CAUSE FIX: Correctly convert Timestamp to Date before comparison ---
                    const originalCheckInTime = toDate(day.checkInTime);

                    if (!originalCheckInTime || !isValid(originalCheckInTime)) {
                        console.warn(`Skipping update for day ${day.id} due to invalid original check-in time.`);
                        continue; // Skip this update if the original date is invalid
                    }

                    let checkOutTime = getRandomTime(recordDate, checkOutStartTime, checkOutEndTime);
                    
                    if (checkOutTime.getTime() <= originalCheckInTime.getTime()) {
                         checkOutTime = new Date(originalCheckInTime.getTime() + (4 * 60 * 60 * 1000));
                    }
                    
                    batch.update(recordRef, { checkOutTime: Timestamp.fromDate(checkOutTime), updatedBy: currentUser.uid, updatedAt: Timestamp.now(), reasonForUpdate: 'Input oleh Admin (Absen Pulang)', manualEntry: true });
                }
            }

            await batch.commit();
            onClose(); // Close the modal, which triggers the parent page to refetch.

        } catch (err) {
            console.error("Error saving attendance:", err);
            setError("Gagal menyimpan perubahan. Silakan coba lagi.");
        } finally {
            setIsSaving(false); // Ensure saving state is always reset
        }
    };

    const hasSelection = useMemo(() => Object.values(selectedDays).some(Boolean), [selectedDays]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Perbaiki Kehadiran</DialogTitle>
                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertTitle>Terjadi Kesalahan</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </DialogHeader>

                {isLoading ? (
                    <div className="py-4 space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-3/4" />
                    </div>
                ) : problematicDays.length > 0 ? (
                    <div className="py-4">
                        <DialogDescription className="mb-4">
                           Pilih data untuk diperbaiki. Waktu yang kosong akan diisi secara acak sesuai rentang jam kerja yang berlaku.
                        </DialogDescription>
                        <div className="max-h-[300px] overflow-y-auto -mr-2 pr-2 space-y-1">
                            {problematicDays.map(day => (
                                <div 
                                    key={day.id} 
                                    className="flex items-center gap-3 p-2 rounded-md transition-colors hover:bg-muted/50 cursor-pointer"
                                    onClick={() => handleSelectDay(day.id)}
                                >
                                    <Checkbox id={day.id} checked={!!selectedDays[day.id]} className="w-5 h-5 shrink-0" />
                                    <label htmlFor={day.id} className="text-sm font-medium cursor-pointer grow">
                                        {format(parseISO(day.date), 'eeee, dd MMMM yyyy', { locale: id })}
                                    </label>
                                    <Badge variant={day.status === 'Alpa' ? "destructive" : "secondary"} className="whitespace-nowrap">
                                        {day.status === 'Alpa' ? 'Alpa' : 'Tidak Absen Pulang'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data yang perlu diperbaiki pada periode ini.</p>
                )}
                
                <DialogFooter className="pt-4">
                    <DialogClose asChild><Button variant="ghost" disabled={isSaving}>Batal</Button></DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isLoading || isSaving || problematicDays.length === 0 || !hasSelection}>
                        {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
