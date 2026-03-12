
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Download, Loader2, RefreshCw, LocateFixed, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { format, getDaysInMonth, startOfMonth, eachDayOfInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

const daysOfWeek = [
    { value: 0, label: 'Minggu' },
    { value: 1, label: 'Senin' },
    { value: 2, label: 'Selasa' },
    { value: 3, label: 'Rabu' },
    { value: 4, label: 'Kamis' },
    { value: 5, label: 'Jumat' },
    { value: 6, label: 'Sabtu' },
];

function MonthlyConfigCalendar({ user, schoolConfig }: { user: any, schoolConfig: any }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [manualWorkDays, setManualWorkDays] = useState<string>('');
  const [calculatedWorkDays, setCalculatedWorkDays] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const monthlyConfigId = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth]);
  const monthlyConfigRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'monthlyConfigs', monthlyConfigId);
  }, [firestore, monthlyConfigId]);
  
  const { data: monthlyConfigData, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);
  
  const allDaysInMonth = useMemo(() => {
    return eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    });
  }, [currentMonth]);

  useEffect(() => {
    if (monthlyConfigData) {
      setHolidays((monthlyConfigData.holidays ?? []).map((d: string) => new Date(`${d}T00:00:00`)));
      setManualWorkDays(monthlyConfigData.manualWorkDays?.toString() ?? '');
    } else {
      setHolidays([]);
      setManualWorkDays('');
    }
  }, [monthlyConfigData]);

  useEffect(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const recurringOffDays: number[] = schoolConfig?.offDays ?? [0];
    const specificHolidays = new Set(holidays.map(d => format(d, 'yyyy-MM-dd')));

    const workDays = allDays.filter(day => {
      const isRecurringOff = recurringOffDays.includes(day.getDay());
      const isSpecificHoliday = specificHolidays.has(format(day, 'yyyy-MM-dd'));
      return !isRecurringOff && !isSpecificHoliday;
    });

    setCalculatedWorkDays(workDays.length);
  }, [currentMonth, holidays, schoolConfig?.offDays]);


  const handleSave = async () => {
    if (!monthlyConfigRef) return;
    setIsSaving(true);
    
    const totalDaysInMonth = getDaysInMonth(currentMonth);
    const manualWorkDaysValue = manualWorkDays === '' ? null : parseInt(manualWorkDays, 10);

    if (manualWorkDaysValue !== null && (isNaN(manualWorkDaysValue) || manualWorkDaysValue < 0 || manualWorkDaysValue > totalDaysInMonth)) {
        toast({
            variant: 'destructive',
            title: 'Input Tidak Valid',
            description: `Jumlah hari kerja harus berupa angka antara 0 dan ${totalDaysInMonth}. Kosongkan untuk menggunakan perhitungan otomatis.`
        });
        setIsSaving(false);
        return;
    }

    try {
      const dataToSave = {
        id: monthlyConfigId,
        holidays: holidays.map(d => format(d, 'yyyy-MM-dd')),
        manualWorkDays: manualWorkDaysValue,
      };
      await setDoc(monthlyConfigRef, dataToSave, { merge: true });
      toast({ title: 'Berhasil', description: 'Pengaturan hari kerja dan libur telah disimpan.' });
    } catch (error) {
      console.error('Error saving monthly config:', error);
      toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal menyimpan pengaturan.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDayToggle = (day: Date, checked: boolean) => {
    setHolidays(prev => 
        checked 
        ? [...prev, day]
        : prev.filter(d => format(d, 'yyyy-MM-dd') !== format(day, 'yyyy-MM-dd'))
    );
    setManualWorkDays(''); 
  };
  
  return (
    <Card className="lg:col-span-3">
        <CardHeader>
            <CardTitle>Pengaturan Hari Kerja & Libur Bulanan</CardTitle>
            <CardDescription>
                Tandai hari libur spesifik atau tentukan jumlah hari kerja efektif secara manual untuk setiap bulan.
            </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
                {isMonthlyConfigLoading ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted rounded-md p-10">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-center gap-4">
                            <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                            >
                                <ChevronLeft />
                            </Button>
                            <span className="font-semibold text-center w-32">{format(currentMonth, 'MMMM yyyy', { locale: id })}</span>
                            <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                            >
                                <ChevronRight />
                            </Button>
                        </div>

                        <ScrollArea className="h-96 rounded-md border">
                            <Table>
                                <TableBody>
                                    {allDaysInMonth.map((day) => {
                                        const dayString = format(day, 'yyyy-MM-dd');
                                        const isChecked = holidays.some(d => format(d, 'yyyy-MM-dd') === dayString);

                                        return (
                                            <TableRow key={dayString} className="has-[:checked]:bg-primary/10">
                                                <TableCell className="w-12 text-center py-2">
                                                    <Checkbox
                                                        id={dayString}
                                                        checked={isChecked}
                                                        onCheckedChange={(checked) => handleDayToggle(day, !!checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    <Label htmlFor={dayString} className="font-normal cursor-pointer w-full block">
                                                        {format(day, 'eeee, d MMMM yyyy', { locale: id })}
                                                    </Label>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </>
                )}
            </div>
            <div className="md:col-span-1 space-y-4 border-l-0 md:border-l md:pl-6">
                <h3 className="font-semibold">Konfigurasi Bulan Ini</h3>
                 <p className="text-sm text-muted-foreground">
                    Jumlah hari kerja efektif di bulan <span className="font-bold">{format(currentMonth, 'MMMM', { locale: id })}</span> akan digunakan untuk menghitung persentase kehadiran.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="manualWorkDays">Jumlah Hari Kerja Efektif (Manual)</Label>
                    <Input
                        id="manualWorkDays"
                        type="number"
                        value={manualWorkDays}
                        onChange={(e) => setManualWorkDays(e.target.value)}
                        placeholder={calculatedWorkDays.toString()}
                    />
                     <p className="text-xs text-muted-foreground">
                        Dihitung otomatis: <span className="font-bold">{calculatedWorkDays} hari</span>. Isi untuk menimpa.
                    </p>
                </div>
            </div>
        </CardContent>
         <CardFooter className="border-t p-4 sm:p-6">
            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Pengaturan Bulan Ini
            </Button>
        </CardFooter>
    </Card>
  );
}


export default function KonfigurasiAbsenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isQrLoading, setIsQrLoading] = useState(true);

  // Form State
  const [holidayMode, setHolidayMode] = useState(false);
  
  const [offDays, setOffDays] = useState<number[]>([]);

  const [useLocationValidation, setUseLocationValidation] = useState(true);
  const [useTimeValidation, setUseTimeValidation] = useState(true);
  const [latitude, setLatitude] = useState('-8.58333');
  const [longitude, setLongitude] = useState('120.46667');
  const [radius, setRadius] = useState(100);
  const [checkInStart, setCheckInStart] = useState('06:00');
  const [checkInEnd, setCheckInEnd] = useState('08:00');
  const [checkOutStart, setCheckOutStart] = useState('14:00');
  const [checkOutEnd, setCheckOutEnd] = useState('16:00');
  const [qrCodeValue, setQrCodeValue] = useState('');
  
  const schoolConfigRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'schoolConfig', 'default');
  }, [firestore, user]);
  const { data: schoolConfigData, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isLoading = isAuthLoading || isConfigLoading || isUserDataLoading;
  const isAdmin = !isLoading && userData?.role === 'admin';
  

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isLoading, isAdmin, router]);

  useEffect(() => {
    if (schoolConfigData) {
      setHolidayMode(schoolConfigData.isAttendanceActive === false);
      setOffDays(schoolConfigData.offDays ?? [0, 6]); // Default to Sunday, Saturday off

      setUseLocationValidation(schoolConfigData.useLocationValidation ?? true);
      setUseTimeValidation(schoolConfigData.useTimeValidation ?? true);
      setLatitude(schoolConfigData.latitude?.toString() ?? '-8.58333');
      setLongitude(schoolConfigData.longitude?.toString() ?? '120.46667');
      setRadius(schoolConfigData.radius ?? 100);
      setCheckInStart(schoolConfigData.checkInStartTime ?? '06:00');
      setCheckInEnd(schoolConfigData.checkInEndTime ?? '08:00');
      setCheckOutStart(schoolConfigData.checkOutStartTime ?? '14:00');
      setCheckOutEnd(schoolConfigData.checkOutEndTime ?? '16:00');

      if (schoolConfigData.qrCodeValue) {
        setQrCodeValue(schoolConfigData.qrCodeValue);
      } else if (user && schoolConfigRef && !isConfigLoading) {
        // If no QR code exists on load, generate and save one.
        const newQrValue = Math.random().toString(36).substring(2, 15);
        setQrCodeValue(newQrValue);
        updateDocumentNonBlocking(schoolConfigRef, { qrCodeValue: newQrValue });
      }
    }
  }, [schoolConfigData, user, schoolConfigRef, isConfigLoading]);

  useEffect(() => {
    if (qrCodeValue) {
      setIsQrLoading(true);
      QRCode.toDataURL(qrCodeValue, {
          width: 300,
          margin: 2,
          errorCorrectionLevel: 'H'
      }, (err, url) => {
          if (err) {
              console.error('QR Code generation failed:', err);
              toast({
                  variant: 'destructive',
                  title: 'Gagal Membuat QR Code',
                  description: 'Terjadi kesalahan saat menyiapkan QR Code.',
              });
              setIsQrLoading(false);
              return;
          }
          setQrCodeDataUrl(url);
          setIsQrLoading(false);
      });
    } else {
        setIsQrLoading(!isConfigLoading);
    }
  }, [qrCodeValue, toast, isConfigLoading]);


  const downloadQRCode = async (format: 'png' | 'pdf') => {
    if (!qrCodeDataUrl) {
      toast({
        variant: 'destructive',
        title: 'Gagal Mengunduh',
        description: 'QR Code belum siap. Mohon tunggu sejenak dan coba lagi.',
      });
      return;
    }

    if (format === 'png') {
      const downloadLink = document.createElement('a');
      downloadLink.href = qrCodeDataUrl;
      downloadLink.download = 'absensi-qrcode.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } else { // pdf
      const { jsPDF } = await import('jspdf');
      const pdfDoc = new jsPDF();
      pdfDoc.setFontSize(20);
      pdfDoc.text('QR Code Absensi E-SPENLI', 105, 20, { align: 'center' });
      pdfDoc.addImage(qrCodeDataUrl, 'PNG', 65, 30, 80, 80);
      pdfDoc.save('absensi-qrcode.pdf');
    }
    toast({
      title: 'Berhasil',
      description: `QR Code berhasil diunduh sebagai ${format.toUpperCase()}.`,
    });
  };
  
  const handleGenerateNewQr = () => {
    if (!user || !schoolConfigRef) return;
    setIsQrLoading(true);
    const newQrValue = Math.random().toString(36).substring(2, 15);
    updateDocumentNonBlocking(schoolConfigRef, { qrCodeValue: newQrValue });
    setQrCodeValue(newQrValue);
    toast({
      title: 'QR Code Diperbarui',
      description: 'QR Code absensi baru telah berhasil dibuat.',
    });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        variant: 'destructive',
        title: 'Geolocation Tidak Didukung',
        description: 'Browser Anda tidak mendukung pengambilan lokasi.',
      });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setIsLocating(false);
        toast({
          title: 'Lokasi Ditemukan',
          description: 'Koordinat Latitude dan Longitude telah diperbarui.',
        });
      },
      (error) => {
        setIsLocating(false);
        let description = 'Terjadi kesalahan saat mengambil lokasi.';
        if (error.code === 1) { // PERMISSION_DENIED
          description = 'Akses lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.';
        } else if (error.code === 2) { // POSITION_UNAVAILABLE
          description = 'Lokasi tidak tersedia. Pastikan GPS dan koneksi internet Anda aktif.';
        } else if (error.code === 3) { // TIMEOUT
          description = 'Waktu permintaan habis saat mencoba mendapatkan lokasi.';
        }
        toast({
          variant: 'destructive',
          title: 'Gagal Mendapatkan Lokasi',
          description,
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };


  const handleSave = () => {
    if (!user || !schoolConfigRef) return;
    setIsSaving(true);
    setDocumentNonBlocking(schoolConfigRef, {
      isAttendanceActive: !holidayMode,
      offDays: offDays,
      useLocationValidation,
      useTimeValidation,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radius: Number(radius),
      checkInStartTime: checkInStart,
      checkInEndTime: checkInEnd,
      checkOutStartTime: checkOutStart,
      checkOutEndTime: checkOutEnd,
    }, { merge: true });
    toast({
      title: 'Pengaturan Disimpan',
      description: 'Konfigurasi absensi telah berhasil diperbarui.',
    });
    setIsSaving(false);
  };

  const handleDayToggle = (dayValue: number, checked: boolean | 'indeterminate') => {
    if (checked) {
        setOffDays(prev => [...prev, dayValue].sort());
    } else {
        setOffDays(prev => prev.filter(d => d !== dayValue));
    }
  };
  
  if (isLoading || !isAdmin) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>QR Code Absensi</CardTitle>
          <CardDescription>Gunakan QR Code ini untuk absensi.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4 p-4 sm:p-6">
          <div className="p-4 border rounded-lg bg-white aspect-square w-full max-w-[256px] relative">
            {isQrLoading || !qrCodeDataUrl ? (
              <div className="w-full h-full flex items-center justify-center bg-muted rounded-md">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Image src={qrCodeDataUrl} alt="QR Code Absensi" width={224} height={224} className="w-full h-full" />
            )}
          </div>
          <Button onClick={handleGenerateNewQr} variant="outline" className="w-full max-w-[256px]" disabled={isQrLoading}>
            {isQrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Buat QR Code Baru
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 border-t p-4 sm:p-6">
          <Button className="w-full" onClick={() => downloadQRCode('pdf')} disabled={isQrLoading}><Download className="mr-2 h-4 w-4" />Unduh PDF</Button>
          <Button variant="outline" className="w-full" onClick={() => downloadQRCode('png')} disabled={isQrLoading}><Download className="mr-2 h-4 w-4" />Unduh PNG</Button>
        </CardFooter>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Pengaturan Absensi Umum</CardTitle>
          <CardDescription>Atur parameter untuk sistem absensi di seluruh sekolah.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-4 sm:p-6">
          <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                  <div>
                      <Label htmlFor="holiday-mode" className="font-semibold">Mode Libur Manual</Label>
                      <p className="text-sm text-muted-foreground">Jika diaktifkan, sistem absensi akan non-aktif untuk semua.</p>
                  </div>
                  <Switch
                      id="holiday-mode"
                      checked={holidayMode}
                      onCheckedChange={setHolidayMode}
                  />
              </div>
              <div className="space-y-4 pt-4 border-t">
                  <Label className='font-medium'>Hari Libur Rutin</Label>
                  <p className="text-sm text-muted-foreground">
                    Pilih hari dalam seminggu yang dianggap sebagai hari libur. Sistem absensi akan non-aktif pada hari-hari ini.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {daysOfWeek.map(day => (
                        <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox
                            id={`day-${day.value}`}
                            checked={offDays.includes(day.value)}
                            onCheckedChange={(checked) => handleDayToggle(day.value, checked)}
                            disabled={holidayMode}
                        />
                        <Label htmlFor={`day-${day.value}`} className="font-normal">{day.label}</Label>
                        </div>
                    ))}
                  </div>
              </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-location" className="font-semibold">Gunakan Validasi Lokasi</Label>
                <p className="text-sm text-muted-foreground">Wajibkan pengguna berada di area sekolah untuk absen.</p>
              </div>
              <Switch id="use-location" checked={useLocationValidation} onCheckedChange={setUseLocationValidation} disabled={holidayMode} />
            </div>
            {useLocationValidation && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <Label>Koordinat Lokasi Sekolah</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleGetCurrentLocation} disabled={isLocating || holidayMode}>
                      {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                      Dapatkan Lokasi
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="latitude" className="text-xs text-muted-foreground">Latitude</Label>
                        <Input id="latitude" type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Contoh: -8.58333" disabled={holidayMode || isLocating} />
                    </div>
                    <div>
                        <Label htmlFor="longitude" className="text-xs text-muted-foreground">Longitude</Label>
                        <Input id="longitude" type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Contoh: 120.46667" disabled={holidayMode || isLocating} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius">Radius Sekolah (meter)</Label>
                  <Input id="radius" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} placeholder="Contoh: 100" disabled={holidayMode} />
                  <p className="text-sm text-muted-foreground">Jarak maksimal dari titik pusat sekolah yang dianggap valid.</p>
                </div>
                <div className="space-y-2">
                  <Label>Pratinjau Lokasi di Peta</Label>
                  <div className="aspect-video w-full overflow-hidden rounded-lg border">
                    <iframe
                      key={`${latitude}-${longitude}`}
                      width="100%"
                      height="100%"
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${latitude},${longitude}&hl=id&z=15&output=embed`}
                      title="Pratinjau Lokasi Peta"
                    ></iframe>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                  <div>
                      <Label htmlFor="use-time" className="font-semibold">Gunakan Validasi Jam Kerja</Label>
                      <p className="text-sm text-muted-foreground">Wajibkan pengguna absen di dalam jam kerja yang ditentukan.</p>
                  </div>
                  <Switch id="use-time" checked={useTimeValidation} onCheckedChange={setUseTimeValidation} disabled={holidayMode} />
              </div>
              {useTimeValidation && (
                  <div className="space-y-4 pt-4 border-t">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label htmlFor="checkin-start">Jam Mulai Masuk</Label>
                              <Input id="checkin-start" type="time" value={checkInStart} onChange={e => setCheckInStart(e.target.value)} disabled={holidayMode} />
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="checkin-end">Jam Selesai Masuk</Label>
                              <Input id="checkin-end" type="time" value={checkInEnd} onChange={e => setCheckInEnd(e.target.value)} disabled={holidayMode} />
                          </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label htmlFor="checkout-start">Jam Mulai Pulang</Label>
                              <Input id="checkout-start" type="time" value={checkOutStart} onChange={e => setCheckOutStart(e.target.value)} disabled={holidayMode} />
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="checkout-end">Jam Selesai Pulang</Label>
                              <Input id="checkout-end" type="time" value={checkOutEnd} onChange={e => setCheckOutEnd(e.target.value)} disabled={holidayMode} />
                          </div>
                      </div>
                  </div>
              )}
          </div>

        </CardContent>
         <CardFooter className="border-t p-4 sm:p-6">
           <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <span>Simpan Pengaturan Umum</span>
          </Button>
        </CardFooter>
      </Card>

      {schoolConfigData && <MonthlyConfigCalendar user={user} schoolConfig={schoolConfigData} />}

    </div>
  );
}
