'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Html5Qrcode, type Html5QrcodeError, type Html5QrcodeResult, type CameraDevice } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MapPin, CheckCircle, Clock, X, Loader2, AlertTriangle, CameraOff, CalendarOff } from 'lucide-react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, Timestamp, addDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '../../../hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { QuoteOfTheDay } from '@/components/layout/quote-of-the-day';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
}

const getCurrentPosition = (options?: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

type AttendanceStatus = 'idle' | 'loading' | 'locating' | 'success_in' | 'success_out' | 'error_radius' | 'error_time' | 'error_already_in' | 'error_not_checked_in' | 'error_already_out' | 'error_generic' | 'error_location';

export default function AbsenPage() {
  const [status, setStatus] = useState<AttendanceStatus>('idle');
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const schoolConfigRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return doc(firestore, 'schoolConfig', 'default');
  }, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const monthlyConfigId = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  const monthlyConfigRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return doc(firestore, 'monthlyConfigs', monthlyConfigId);
  }, [firestore, monthlyConfigId]);
  const { data: monthlyConfig, isLoading: isMonthlyConfigLoading } = useDoc(user, monthlyConfigRef);

  const todaysAttendanceQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    return query(
        collection(firestore, 'users', user.uid, 'attendanceRecords'),
        where('checkInTime', '>=', Timestamp.fromDate(todayStart)),
        where('checkInTime', '<', Timestamp.fromDate(todayEnd))
    );
  }, [user, firestore]);

  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
  const todaysRecord = useMemo(() => todaysAttendance?.[0], [todaysAttendance]);

  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;
    if (schoolConfig.isAttendanceActive === false) return true;
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    if (monthlyConfig?.holidays?.includes(todayStr)) return true;
    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    return offDays.includes(today.getDay());
  }, [schoolConfig, monthlyConfig]);

  const handleAttendance = useCallback(async () => {
    setStatus('loading');
    setLocationVerified(false);
    setLocationError(null);
    setShowQuote(false);
    
    if (!user || !firestore || !schoolConfig) {
        toast({ title: 'Gagal', description: 'Data pengguna atau konfigurasi tidak siap.', variant: 'destructive' });
        setStatus('error_generic');
        return;
    }

    let isCheckInTime = false;
    let isCheckOutTime = false;

    if (schoolConfig.useTimeValidation) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const [inStartH, inStartM] = schoolConfig.checkInStartTime.split(':').map(Number);
        const checkInStartTime = inStartH * 60 + inStartM;
        const [inEndH, inEndM] = schoolConfig.checkInEndTime.split(':').map(Number);
        const checkInEndTime = inEndH * 60 + inEndM;
        
        const [outStartH, outStartM] = schoolConfig.checkOutStartTime.split(':').map(Number);
        const checkOutStartTime = outStartH * 60 + outStartM;
        const [outEndH, outEndM] = schoolConfig.checkOutEndTime.split(':').map(Number);
        const checkOutEndTime = outEndH * 60 + outEndM;
        
        isCheckInTime = currentTime >= checkInStartTime && currentTime <= checkInEndTime;
        isCheckOutTime = currentTime >= checkOutStartTime && currentTime <= checkOutEndTime;

        if (!isCheckInTime && !isCheckOutTime) {
            setStatus('error_time');
            return;
        }
    } else {
        if (todaysRecord && !todaysRecord.checkOutTime) {
            isCheckOutTime = true;
        } else {
            isCheckInTime = true;
        }
    }

    if (isCheckInTime && todaysRecord) {
        setStatus('error_already_in');
        return;
    }
    if (isCheckOutTime && !todaysRecord) {
        setStatus('error_not_checked_in');
        return;
    }
    if (isCheckOutTime && todaysRecord?.checkOutTime) {
        setStatus('error_already_out');
        return;
    }
    
    try {
        let latitude: number | null = null;
        let longitude: number | null = null;

        if (schoolConfig.useLocationValidation) {
            setStatus('locating');
            try {
                const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
                latitude = position.coords.latitude;
                longitude = position.coords.longitude;

                if (schoolConfig.radius && schoolConfig.latitude && schoolConfig.longitude) {
                    const distance = getDistance(latitude, longitude, schoolConfig.latitude, schoolConfig.longitude);
                    if (distance > schoolConfig.radius) {
                        setStatus('error_radius');
                        return;
                    }
                    setLocationVerified(true);
                }
            } catch (error: any) {
                console.error("Location error:", error);
                setStatus('error_location');
                let specificError = 'Gagal mendapatkan data lokasi Anda.';
                if (error.code === 1) { specificError = 'Akses lokasi ditolak. Izinkan lokasi di pengaturan browser.'; }
                if (error.code === 2) { specificError = 'Informasi lokasi tidak tersedia.'; }
                if (error.code === 3) { specificError = 'Waktu habis saat mencari lokasi.'; }
                setLocationError(specificError);
                toast({ variant: 'destructive', title: 'Gagal Lokasi', description: specificError });
                return;
            }
        }
        
        setStatus('loading');

        const now = new Date();
        if (isCheckInTime) {
            await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), {
                userId: user.uid,
                checkInTime: now,
                checkInLatitude: latitude,
                checkInLongitude: longitude,
                checkOutTime: null,
            });
            setStatus('success_in');
            toast({ title: "Absensi berhasil direkam" });
            if (userData?.role !== 'admin') {
                setShowQuote(true);
            }
        } else if (isCheckOutTime) {
            const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord!.id);
            await updateDoc(recordRef, {
                checkOutTime: now,
                checkOutLatitude: latitude,
                checkOutLongitude: longitude,
            });
            setStatus('success_out');
            toast({ title: "Absensi berhasil direkam" });
            if (userData?.role !== 'admin') {
                setShowQuote(true);
            }
        }
    } catch (error: any) {
        console.error("Firestore write error:", error);
        setStatus('error_generic');
        toast({ title: 'Gagal Menyimpan Data', description: 'Terjadi kesalahan sistem.', variant: 'destructive' });
    }
  }, [user, firestore, schoolConfig, todaysRecord, toast, userData]);
  
    const statusRef = useRef(status);
  statusRef.current = status;
  const handleAttendanceRef = useRef(handleAttendance);
  handleAttendanceRef.current = handleAttendance;

  useEffect(() => {
    let isMounted = true;
    Html5Qrcode.getCameras()
      .then((devices: CameraDevice[]) => {
        if (isMounted) {
          if (devices && devices.length) {
            setHasCameraPermission(true);
          } else {
            setHasCameraPermission(false);
          }
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setHasCameraPermission(false);
          if (err?.name === "NotAllowedError") {
              console.warn("Camera permission denied by user.");
          } else {
              console.error("Camera permission error:", err);
          }
        }
      });
    return () => { isMounted = false; }
  }, []);

  const onScanSuccess = useCallback((decodedText: string, decodedResult: Html5QrcodeResult) => {
    if (statusRef.current === 'idle' && schoolConfig?.qrCodeValue) {
        if (decodedText === schoolConfig.qrCodeValue) {
            toast({ title: 'QR Code Terdeteksi', description: 'Memproses absensi Anda...' });
            handleAttendanceRef.current();
        } else {
            toast({ variant: 'destructive', title: 'QR Code Tidak Valid', description: 'Pastikan Anda memindai kode QR yang benar.' });
        }
    }
  }, [schoolConfig, toast]);

  useEffect(() => {
    const shouldScan = hasCameraPermission && status === 'idle' && !isHoliday;
    if (shouldScan) {
        let qrCode: Html5Qrcode;
        if (html5QrCodeRef.current) {
            qrCode = html5QrCodeRef.current;
        } else if (document.getElementById('reader')) {
            qrCode = new Html5Qrcode('reader', false);
            html5QrCodeRef.current = qrCode;
        } else {
            return;
        }

        const state = qrCode.getState();
        if (state !== 2 /* SCANNING */) {
            const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
            qrCode.start({ facingMode: 'environment' }, config, onScanSuccess, () => {})
              .catch((err: any) => {
                if (err?.name === 'NotReadableError') {
                  toast({
                    variant: 'destructive', title: 'Kamera Error',
                    description: 'Tidak dapat memulai kamera. Pastikan tidak ada aplikasi lain yang sedang menggunakannya.',
                    duration: 7000,
                  });
                } else if (err.name !== 'NotAllowedError') {
                  console.error('Could not start QR scanner', err);
                }
              });
        }
    } 
    return () => {
        const scanner = html5QrCodeRef.current;
        if (scanner && scanner.isScanning) {
            scanner.stop().catch((err: any) => {
                if (err.name !== 'NotAllowedError') {
                    console.warn("QR scanner failed to stop cleanly.", err);
                }
            });
        }
    };
  }, [hasCameraPermission, status, isHoliday, onScanSuccess, toast]);
  
  const StatusFeedbackCard = ({ status, locationVerified, locationError, onClose }: { status: AttendanceStatus, locationVerified: boolean, locationError: string | null, onClose: () => void }) => {
    let icon, title, description, cardClassName, titleClassName, descriptionClassName;

    switch (status) {
        case 'success_in':
            icon = <CheckCircle className="h-16 w-16 text-green-500" />;
            title = 'Absen Masuk Berhasil';
            description = 'Kehadiran Anda telah terekam.' + (locationVerified ? ' Lokasi terverifikasi.' : '') + ' Selamat beraktivitas!';
            cardClassName = 'bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-800';
            titleClassName = 'text-green-900 dark:text-green-200';
            descriptionClassName = 'text-green-700 dark:text-green-400';
            break;
        case 'success_out':
            icon = <CheckCircle className="h-16 w-16 text-blue-500" />;
            title = 'Absen Pulang Berhasil';
            description = 'Absen pulang terekam.' + (locationVerified ? ' Lokasi terverifikasi.' : '') + ' Hati-hati di jalan!';
            cardClassName = 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800';
            titleClassName = 'text-blue-900 dark:text-blue-200';
            descriptionClassName = 'text-blue-700 dark:text-blue-400';
            break;
        case 'error_radius':
            icon = <MapPin className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Di Luar Radius';
            description = 'Anda harus berada di dalam area sekolah untuk melakukan absensi.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        case 'error_time':
            icon = <Clock className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Di Luar Jam Absen';
            description = 'Waktu absensi belum dibuka atau sudah ditutup.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        case 'error_already_in':
            icon = <X className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Sudah Absen Masuk';
            description = 'Anda sudah melakukan absensi masuk untuk hari ini.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        case 'error_not_checked_in':
            icon = <X className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Belum Absen Masuk';
            description = 'Anda harus melakukan absensi masuk terlebih dahulu sebelum absen pulang.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        case 'error_already_out':
            icon = <X className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Sudah Absen Pulang';
            description = 'Anda sudah melakukan absensi pulang untuk hari ini.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        case 'error_location':
            icon = <MapPin className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Lokasi Tidak Ditemukan';
            description = locationError || 'Pastikan GPS aktif dan berikan izin akses.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        case 'error_generic':
            icon = <AlertTriangle className="h-16 w-16 text-destructive" />;
            title = 'Gagal: Terjadi Kesalahan';
            description = 'Terjadi kesalahan yang tidak diketahui. Silakan coba lagi.';
            cardClassName = 'bg-destructive/10 border-destructive';
            titleClassName = 'text-destructive';
            descriptionClassName = 'text-destructive/80';
            break;
        default:
            return null;
    }

    return (
        <Card className={cn("w-full max-w-md text-center transition-all relative", cardClassName)}>
             <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-current/60 hover:text-current/90" onClick={onClose}>
                <X className="h-5 w-5" />
                <span className="sr-only">Tutup</span>
            </Button>
            <CardHeader className="items-center pt-8">
                <div className="mb-4">{icon}</div>
                <CardTitle className={cn("text-2xl font-bold", titleClassName)}>{title}</CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
                <p className={cn("text-muted-foreground", descriptionClassName)}>{description}</p>
            </CardContent>
        </Card>
    );
  };

  const isLoading = isUserLoading || isUserDataLoading || isConfigLoading || isAttendanceLoading || hasCameraPermission === null || isMonthlyConfigLoading;

  const renderContent = () => {
    if (todaysRecord?.checkOutTime) {
        return (
            <Card className="w-full max-w-md text-center">
                <CardHeader className="items-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 mb-4">
                        <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <CardTitle>Absensi Selesai</CardTitle>
                    <CardDescription>Anda telah menyelesaikan absensi untuk hari ini.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-left p-3 bg-muted rounded-md">
                            <p className="font-semibold">Absen Masuk</p>
                            <p className="text-lg font-mono">{format(todaysRecord.checkInTime.toDate(), 'HH:mm:ss')}</p>
                        </div>
                        <div className="text-left p-3 bg-muted rounded-md">
                            <p className="font-semibold">Absen Pulang</p>
                            <p className="text-lg font-mono">{format(todaysRecord.checkOutTime.toDate(), 'HH:mm:ss')}</p>
                        </div>
                    </div>
                    <Button variant="outline" asChild className="w-full">
                        <a href="/dashboard">Kembali ke Dasbor</a>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (isHoliday) {
        return <Card className="w-full max-w-md text-center"><CardHeader className="items-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 mb-4"><CalendarOff className="h-8 w-8 text-blue-600 dark:text-blue-400" /></div><CardTitle>Hari Libur</CardTitle><CardDescription>Sistem absensi tidak aktif.</CardDescription></CardHeader><CardContent><p>Nikmati hari libur Anda.</p></CardContent></Card>;
    }
    if (!hasCameraPermission) {
        return <Card className="w-full max-w-md text-center"><CardHeader className="items-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4"><CameraOff className="h-8 w-8 text-destructive" /></div><CardTitle>Akses Kamera Dibutuhkan</CardTitle></CardHeader><CardContent><p>Aktifkan izin kamera di pengaturan browser Anda, lalu segarkan halaman.</p></CardContent></Card>;
    }
    if (status === 'loading' || status === 'locating') {
        return <Card className="w-full max-w-md"><CardHeader className="text-center"><CardTitle>Memproses Absensi</CardTitle><CardDescription>Mohon tunggu...</CardDescription></CardHeader><CardContent style={{ height: '300px' }} className="flex flex-col items-center justify-center gap-4"><Loader2 className="h-12 w-12 animate-spin" /><p>{status === 'locating' ? 'Mendapatkan lokasi...' : 'Memvalidasi data...'}</p></CardContent></Card>;
    }
    if (status.startsWith('success_') || status.startsWith('error_')) {
        return <StatusFeedbackCard status={status} locationVerified={locationVerified} locationError={locationError} 
            onClose={() => {
                setStatus('idle');
                setLocationError(null);
                setShowQuote(false);
            }} 
        />;
    }
    if (status === 'idle') {
        return (
            <div className="w-full flex flex-col text-center">
                <div className="pt-16 pb-8 px-4">
                    <h1 className="text-2xl font-bold tracking-tight">Pindai QR Code Absensi</h1>
                    <p className="text-muted-foreground mt-2">Arahkan kamera ke QR Code yang ditampilkan oleh Admin.</p>
                </div>
                <div className="relative w-full aspect-square bg-muted">
                    <div id="reader" className="w-full h-full" />
                    <div className="absolute inset-0 border-4 border-black/10 dark:border-white/10 pointer-events-none" />
                    <div className="absolute left-0 w-full h-0.5 bg-red-500 shadow-[0_0_10px_2px_theme(colors.red.500)] animate-scan-line" />
                </div>
            </div>
        );
    }
    return null;
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {isLoading ? (
          <div className="flex flex-col items-center justify-center w-full min-h-[550px]">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
      ) : <div className="w-full">{renderContent()}</div>}
      {showQuote && userData?.role !== 'admin' && (
          <div className="w-full max-w-md mt-2 px-4 mx-auto">
              <QuoteOfTheDay category={userData.role} />
          </div>
      )}
    </div>
  );
}
