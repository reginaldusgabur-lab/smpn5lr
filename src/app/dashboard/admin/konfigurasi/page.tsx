'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Download, Loader2, RefreshCw, LocateFixed, BookUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';

const daysOfWeek = [
    { value: 0, label: 'Minggu' },
    { value: 1, label: 'Senin' },
    { value: 2, label: 'Selasa' },
    { value: 3, label: 'Rabu' },
    { value: 4, label: 'Kamis' },
    { value: 5, label: 'Jumat' },
    { value: 6, label: 'Sabtu' },
];

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
  const [isManualHoliday, setIsManualHoliday] = useState(false);
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
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');

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
      setIsManualHoliday(schoolConfigData.isManualHoliday ?? false);
      setOffDays(schoolConfigData.offDays ?? [0, 6]);
      setUseLocationValidation(schoolConfigData.useLocationValidation ?? true);
      setUseTimeValidation(schoolConfigData.useTimeValidation ?? true);
      setLatitude(schoolConfigData.latitude?.toString() ?? '-8.58333');
      setLongitude(schoolConfigData.longitude?.toString() ?? '120.46667');
      setRadius(schoolConfigData.radius ?? 100);
      setCheckInStart(schoolConfigData.checkInStartTime ?? '06:00');
      setCheckInEnd(schoolConfigData.checkInEndTime ?? '08:00');
      setCheckOutStart(schoolConfigData.checkOutStartTime ?? '14:00');
      setCheckOutEnd(schoolConfigData.checkOutEndTime ?? '16:00');
      setGoogleSheetsUrl(schoolConfigData.googleSheetsUrl ?? '');

      if (schoolConfigData.qrCodeValue) {
        setQrCodeValue(schoolConfigData.qrCodeValue);
      } else if (user && schoolConfigRef && !isConfigLoading) {
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
      isManualHoliday,
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
      googleSheetsUrl: googleSheetsUrl,
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
                      <Label htmlFor="manual-holiday" className="font-semibold">Aktifkan Mode Libur Manual</Label>
                      <p className="text-sm text-muted-foreground">Jika aktif, seluruh sistem absensi akan diliburkan.</p>
                  </div>
                  <Switch id="manual-holiday" checked={isManualHoliday} onCheckedChange={setIsManualHoliday} />
              </div>
          </div>

           <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <BookUp className="h-6 w-6" />
                      <div>
                          <Label htmlFor="google-sheets-url" className="font-semibold">Integrasi & Backup</Label>
                          <p className="text-sm text-muted-foreground">Simpan URL Google Apps Script untuk backup laporan.</p>
                      </div>
                  </div>
              </div>
              <div className="space-y-4 pt-4 border-t">
                   <div className="space-y-2">
                      <Label htmlFor="google-sheets-url">URL Google Apps Script</Label>
                      <Input 
                          id="google-sheets-url" 
                          type="url" 
                          value={googleSheetsUrl} 
                          onChange={(e) => setGoogleSheetsUrl(e.target.value)} 
                          placeholder="https://script.google.com/macros/s/xxxxxxxxxx/exec"
                      />
                      <p className="text-sm text-muted-foreground">
                          URL ini didapat setelah mempublikasikan skrip (disediakan di langkah berikutnya).
                      </p>
                  </div>
              </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
              <Label className='font-medium'>Hari Libur Rutin</Label>
              <p className="text-sm text-muted-foreground">
                Pilih hari dalam seminggu yang dianggap sebagai hari libur.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {daysOfWeek.map(day => (
                    <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                        id={`day-${day.value}`}
                        checked={offDays.includes(day.value)}
                        onCheckedChange={(checked) => handleDayToggle(day.value, checked)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="font-normal">{day.label}</Label>
                    </div>
                ))}
              </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-location" className="font-semibold">Gunakan Validasi Lokasi</Label>
                <p className="text-sm text-muted-foreground">Wajibkan pengguna berada di area sekolah untuk absen.</p>
              </div>
              <Switch id="use-location" checked={useLocationValidation} onCheckedChange={setUseLocationValidation} />
            </div>
            {useLocationValidation && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <Label>Koordinat Lokasi Sekolah</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleGetCurrentLocation} disabled={isLocating}>
                      {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}
                      Dapatkan Lokasi
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="latitude" className="text-xs text-muted-foreground">Latitude</Label>
                        <Input id="latitude" type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Contoh: -8.58333" disabled={isLocating} />
                    </div>
                    <div>
                        <Label htmlFor="longitude" className="text-xs text-muted-foreground">Longitude</Label>
                        <Input id="longitude" type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Contoh: 120.46667" disabled={isLocating} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius">Radius Sekolah (meter)</Label>
                  <Input id="radius" type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} placeholder="Contoh: 100" />
                  <p className="text-sm text-muted-foreground">Jarak maksimal dari titik pusat sekolah yang dianggap valid.</p>
                </div>
              </div>
            )}
          </div>
          
          <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                  <div>
                      <Label htmlFor="time-restriction-mode" className="font-semibold">Mode Pembatasan Jam Absensi (Hemat Database)</Label>
                      <p className="text-sm text-muted-foreground">Batasi absensi hanya pada jam kerja yang telah ditentukan.</p>
                  </div>
                  <Switch id="time-restriction-mode" checked={useTimeValidation} onCheckedChange={setUseTimeValidation} />
              </div>
              {useTimeValidation && (
                  <div className="space-y-4 pt-4 border-t">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label htmlFor="checkin-start">Jam Mulai Masuk</Label>
                              <Input id="checkin-start" type="time" value={checkInStart} onChange={e => setCheckInStart(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="checkin-end">Jam Selesai Masuk</Label>
                              <Input id="checkin-end" type="time" value={checkInEnd} onChange={e => setCheckInEnd(e.target.value)} />
                          </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label htmlFor="checkout-start">Jam Mulai Pulang</Label>
                              <Input id="checkout-start" type="time" value={checkOutStart} onChange={e => setCheckOutStart(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="checkout-end">Jam Selesai Pulang</Label>
                              <Input id="checkout-end" type="time" value={checkOutEnd} onChange={e => setCheckOutEnd(e.target.value)} />
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
    </div>
  );
}
