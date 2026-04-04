'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { doc, writeBatch, Timestamp, getDoc, collection } from 'firebase/firestore'; // Added getDoc and collection
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { fetchUserMonthlyReportData } from '@/lib/attendance';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';

export default function EditAttendanceModal({ user, month, isOpen, onClose, currentUser }) { // Added currentUser prop
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
                
                if (!schoolConfigSnap.exists()) {
                    throw new Error("Konfigurasi sekolah tidak ditemukan.");
                }
                const schoolConfig = schoolConfigSnap.data();

                const reportData = await fetchUserMonthlyReportData(firestore, user.uid, month, schoolConfig);
                const alpaDays = reportData.filter(d => d.status === 'Alpa' && d.description === 'Tidak Ada Keterangan' && !d.date.setHours(0,0,0,0) > new Date().setHours(0,0,0,0));
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

        if (!currentUser) {
            setError("Gagal mengidentifikasi admin. Silakan muat ulang halaman dan coba lagi.");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const batch = writeBatch(firestore);
            const daysToUpdate = absentDays.filter(day => selectedDays[day.id]);

            daysToUpdate.forEach(day => {
                const recordDate = new Date(day.date);
                const checkInTime = new Date(recordDate.setHours(7, 0, 0, 0));
                const checkOutTime = new Date(recordDate.setHours(13, 0, 0, 0));

                const newRecordRef = doc(collection(firestore, 'users', user.uid, 'attendanceRecords'));
                
                batch.set(newRecordRef, {
                    checkInTime: Timestamp.fromDate(checkInTime),
                    checkOutTime: Timestamp.fromDate(checkOutTime),
                    status: 'Hadir',
                    manualEntry: true,
                    manualEntryBy: currentUser.uid, // Use passed prop
                    createdAt: Timestamp.now(),
                });
            });

            await batch.commit();
            onClose(); // Close modal on success
        } catch (err) {
            console.error("Error saving manual attendance:", err);
            setError("Gagal menyimpan kehadiran. Pastikan Anda memiliki koneksi internet dan izin yang benar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit Kehadiran Manual</DialogTitle>
                    <DialogDescription>
                        Pilih tanggal alpa untuk diisi sebagai "Hadir" untuk <strong>{user?.name}</strong>. Ini hanya berlaku untuk hari yang sudah lewat.
                    </DialogDescription>
                </DialogHeader>
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                <ScrollArea className="h-72 my-4">
                    <div className="p-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
                        ) : absentDays.length > 0 ? (
                            absentDays.map(day => (
                                <div key={day.id} className="flex items-center space-x-2 mb-2 p-2 rounded-md hover:bg-gray-100">
                                    <Checkbox 
                                        id={day.id}
                                        checked={!!selectedDays[day.id]}
                                        onCheckedChange={() => handleSelectDay(day.id)} 
                                    />
                                    <label htmlFor={day.id} className="text-sm font-medium leading-none cursor-pointer">
                                        {format(day.date, 'EEEE, dd MMMM yyyy', { locale: id })}
                                    </label>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-gray-500 py-10">Tidak ada hari alpa yang bisa diisi pada bulan ini.</p>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary" disabled={isSaving}>Batal</Button>
                    </DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isSaving || isLoading || absentDays.length === 0}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
                        Simpan Perubahan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
