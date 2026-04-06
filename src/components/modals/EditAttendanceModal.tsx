import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
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

export default function EditAttendanceModal({ user, month, isOpen, onClose, currentUser }) {
    const firestore = useFirestore();
    const [absentDays, setAbsentDays] = useState<any[]>([]);
    const [selectedDays, setSelectedDays] = useState<{ [key: string]: boolean }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !firestore || !user) return;

        const getAbsentDays = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const schoolConfigRef = doc(firestore, 'schoolConfig', 'default');
                const schoolConfigSnap = await getDoc(schoolConfigRef);
                const schoolConfig = schoolConfigSnap.data() || {};

                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, month, schoolConfig);
                const alpaDays = reportData.filter(d => d.status === 'Alpa' && d.description === 'Tidak Ada Keterangan');
                setAbsentDays(alpaDays);
                setSelectedDays({});
            } catch (err) {
                console.error("Error fetching absent days:", err);
                setError('Gagal memuat data hari alpa. Silakan coba lagi.');
            } finally {
                setIsLoading(false);
            }
        };

        getAbsentDays();
    }, [isOpen, firestore, user, month]);

    const handleSelectDay = (dayId: string) => {
        setSelectedDays(prev => ({ ...prev, [dayId]: !prev[dayId] }));
    };

    const handleSaveChanges = async () => {
        const selectedIds = Object.keys(selectedDays).filter(id => selectedDays[id]);
        if (selectedIds.length === 0) {
            setError("Tidak ada tanggal yang dipilih.");
            return;
        }

        if (!currentUser || !currentUser.uid) {
            setError("Gagal mengidentifikasi admin (ID pengguna tidak ditemukan). Silakan muat ulang halaman dan coba lagi.");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const batch = writeBatch(firestore);
            const daysToUpdate = absentDays.filter(day => selectedDays[day.id]);

            daysToUpdate.forEach(day => {
                const [year, month, d] = day.id.split('-').map(Number);

                // Set a default time, e.g., 07:00 for check-in and 13:00 for check-out
                const checkInTime = new Date(year, month - 1, d, 7, 0, 0);
                const checkOutTime = new Date(year, month - 1, d, 13, 0, 0);

                const newRecordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', day.id);
                batch.set(newRecordRef, {
                    checkInTime,
                    checkOutTime,
                    checkInLocation: { latitude: 0, longitude: 0 },
                    checkOutLocation: { latitude: 0, longitude: 0 },
                    status: 'Hadir', // This is implicit but good to be clear
                    updatedBy: currentUser.uid, 
                    updatedAt: new Date(), 
                    reasonForUpdate: 'Input oleh Admin',
                    manualEntry: true // <-- THE NEW FLAG IS ADDED HERE
                });
            });

            await batch.commit();
            onClose(); 
        } catch (err) {
            console.error("Error saving attendance:", err);
            setError("Gagal menyimpan perubahan. Silakan coba lagi.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ubah Kehadiran (Alpa)</DialogTitle>
                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </DialogHeader>

                {isLoading ? (
                    <div className="py-4">
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                ) : absentDays.length > 0 ? (
                    <div className="flex flex-col gap-2 py-4">
                        <DialogDescription>
                           Pilih tanggal alpa yang ingin diubah menjadi "Hadir":
                        </DialogDescription>
                        {absentDays.map(day => (
                            <div key={day.id} className="flex items-center gap-2 pt-2">
                                <Checkbox 
                                    id={day.id} 
                                    checked={!!selectedDays[day.id]}
                                    onCheckedChange={() => handleSelectDay(day.id)}
                                />
                                <label htmlFor={day.id} className="cursor-pointer">
                                    {day.dateString} 
                                </label>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="py-4">Tidak ada data alpa yang bisa diubah pada periode ini.</p>
                )}
                
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost" disabled={isSaving}>Batal</Button>
                    </DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isLoading || isSaving || absentDays.length === 0}>
                        {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
