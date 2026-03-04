'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Html5Qrcode, type Html5QrcodeError, type Html5QrcodeResult } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MapPin, CheckCircle, Clock, X, Loader2, AlertTriangle, CameraOff, CalendarOff, Sparkles } from 'lucide-react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, Timestamp, addDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '../../../hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

type AttendanceStatus = 'idle' | 'loading' | 'locating' | 'success_in' | 'success_out' | 'error_radius' | 'error_time' | 'error_already_in' | 'error_not_checked_in' | 'error_already_out' | 'error_generic' | 'error_location';

// Haversine distance function
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

// Promisified geolocation
const getCurrentPosition = (options?: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

  const StatusFeedbackCard = ({ status, locationVerified, locationError, onClose, userData }: { status: AttendanceStatus, locationVerified: boolean, locationError: string | null, onClose: () => void, userData: any }) => {
    const [quote, setQuote] = useState<string | null>(null);
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);
    let icon, title, description, cardClassName, titleClassName, descriptionClassName;

    const showQuote = status.startsWith('success_');

    useEffect(() => {
        const fetchQuote = async () => {
            if (!showQuote) return;
            setIsQuoteLoading(true);
            try {
                let category = 'seseorang di lingkungan sekolah'; // Default category
                const userRole = userData?.role;

                if (userRole === 'guru' || userRole === 'kepala_sekolah' || userRole === 'pegawai') {
                    category = Math.random() > 0.5 
                        ? 'seorang pendidik atau staf sekolah yang berdedikasi'
                        : 'humor singkat yang relevan dengan kehidupan guru atau pegawai sekolah';
                } else if (userRole === 'siswa') {
                    category = Math.random() > 0.5
                        ? 'pelajar SMP yang sedang berjuang meraih mimpi'
                        : 'semangat belajar untuk siswa';
                }
                
                const response = await fetch(`/api/quote?category=${encodeURIComponent(category)}`);
                if (!response.ok) {
                    throw new Error('Gagal memuat kutipan dari server');
                }
                const data = await response.json();
                if (data.content) {
                  setQuote(data.content);
                } else {
                  setQuote(null);
                }
            } catch (quoteError: any) {
                console.error("Failed to fetch quote:", quoteError.message);
                setQuote(null); // Clear quote on error
            } finally {
                setIsQuoteLoading(false);
            }
        };

        fetchQuote();
    }, [showQuote, userData]);

    switch (status) {
        case 'success_in':
            icon = <CheckCircle className="h-16 w-16 text-green-500" />;
            title = 'Absen Masuk Berhasil';
            description = 'Kehadiran Anda telah terekam.';
            if (locationVerified) {
                description += ' Lokasi Anda berhasil diverifikasi di dalam area sekolah.';
            }
            description += ' Selamat beraktivitas!';
            cardClassName = 'bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-800';
            titleClassName = 'text-green-900 dark:text-green-200';
            descriptionClassName = 'text-green-700 dark:text-green-400';
            break;
        case 'success_out':
            icon = <CheckCircle className="h-16 w-16 text-blue-500" />;
            title = 'Absen Pulang Berhasil';
            description = 'Absen pulang terekam.';
             if (locationVerified) {
                description += ' Lokasi Anda berhasil diverifikasi di dalam area sekolah.';
            }
            description += ' Hati-hati di jalan!';
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
            description = locationError || 'Pastikan GPS atau layanan lokasi di perangkat Anda aktif dan berikan izin akses.';
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
             <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-current/60 hover:text-current/90"
                onClick={onClose}
            >
                <X className="h-5 w-5" />
                <span className="sr-only">Tutup</span>
            </Button>
            <CardHeader className="items-center pt-8">
                <div className="mb-4">{icon}</div>
                <CardTitle className={cn("text-2xl font-bold", titleClassName)}>{title}</CardTitle>
            </CardHeader>
            <CardContent className="pb-8 space-y-6">
                <p className={cn("text-muted-foreground", descriptionClassName)}>{description}</p>
                {showQuote && (
                    <div className="border-t border-current/20 pt-4 space-y-2">
                        <p className="text-sm font-semibold flex items-center justify-center gap-2"><Sparkles className="h-4 w-4" /> Kutipan Hari Ini</p>
                        <div className="pt-1 min-h-[40px]">
                            {isQuoteLoading ? (
                                <div className="space-y-2 pt-1">
                                    <Skeleton className="h-4 w-full bg-current/20" />
                                    <Skeleton className="h-4 w-3/4 mx-auto bg-current/20" />
                                </div>
                            ) : quote ? (
                                <blockquote className="text-sm italic">\"{quote}\"</blockquote>
                            ) : null}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
  };

export default function AbsenPage() {
  const [status, setStatus] = useState<AttendanceStatus>('idle');
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
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
  
  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;

    // Check manual holiday mode first
    if (schoolConfig.isAttendanceActive === false) {
      return true;
    }
    
    const today = new Date();
    
    // Check specific holiday dates from monthly config
    const todayStr = format(today, 'yyyy-MM-dd');
    if (monthlyConfig?.holidays?.includes(todayStr)) {
        return true;
    }

    // Then check recurring off days from school config
    const offDays: number[] = schoolConfig.offDays ?? [0, 6]; // Default to Sunday & Saturday off
    if (offDays.includes(today.getDay())) {
      return true;
    }

    return false;
  }, [schoolConfig, monthlyConfig]);

  const handleAttendance = useCallback(async () => {
    setStatus('loading');
    setLocationVerified(false);
    setLocationError(null);
    
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
        const todaysRecord = todaysAttendance?.[0];
        if (todaysRecord && !todaysRecord.checkOutTime) {
            isCheckOutTime = true;
        } else {
            isCheckInTime = true;
        }
    }

    const todaysRecord = todaysAttendance?.[0];
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
                let specificError = 'Gagal mendapatkan data lokasi Anda. Periksa koneksi dan pengaturan perangkat Anda.';
                if (error.code === 1) { // PERMISSION_DENIED
                    specificError = 'Akses lokasi ditolak. Anda harus memberikan izin lokasi di pengaturan browser untuk melakukan absensi.';
                } else if (error.code === 2) { // POSITION_UNAVAILABLE
                    specificError = 'Informasi lokasi tidak tersedia saat ini. Pastikan GPS aktif dan Anda berada di area terbuka.';
                } else if (error.code === 3) { // TIMEOUT
                    specificError = 'Waktu habis saat mencoba mendapatkan lokasi. Coba lagi di tempat dengan sinyal yang lebih baik.';
                }
                setLocationError(specificError);
                toast({
                    variant: 'destructive',
                    title: 'Gagal Mendapatkan Lokasi',
                    description: specificError,
                });
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
        } else if (isCheckOutTime) {
            const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord!.id);
            await updateDoc(recordRef, {
                checkOutTime: now,
                checkOutLatitude: latitude,
                checkOutLongitude: longitude,
            });
            setStatus('success_out');
        }
    } catch (error: any) {
        console.error("Firestore write error:", error);
        setStatus('error_generic');
        toast({ title: 'Gagal Menyimpan Data', description: 'Terjadi kesalahan sistem saat menyimpan data absensi.', variant: 'destructive' });
    }
  }, [user, firestore, schoolConfig, todaysAttendance, toast]);
  
  // Create refs to hold the latest state and callback function to prevent stale closures.
  const statusRef = useRef(status);
  statusRef.current = status;
  const handleAttendanceRef = useRef(handleAttendance);
  handleAttendanceRef.current = handleAttendance;

  useEffect(() => {
    let isMounted = true;
    Html5Qrcode.getCameras()
      .then(devices => {
        if (isMounted) {
          if (devices && devices.length) {
            setHasCameraPermission(true);
          } else {
            setHasCameraPermission(false);
          }
        }
      })
      .catch(err => {
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
    // Only process scan if idle and QR code value is available
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
    // This effect handles the lifecycle of the QR code scanner.
    const shouldScan = hasCameraPermission && status === 'idle' && !isHoliday;

    if (shouldScan) {
        let qrCode: Html5Qrcode;
        if (html5QrCodeRef.current) {
            qrCode = html5QrCodeRef.current;
        } else if (document.getElementById('reader')) {
            qrCode = new Html5Qrcode('reader', false);
            html5QrCodeRef.current = qrCode;
        } else {
            // If reader div is not ready, do nothing. The effect will re-run.
            return;
        }
        
        // Only start if it's not already scanning.
        if (qrCode.getState() !== 2 /* SCANNING */) {
            const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
            qrCode.start({ facingMode: 'environment' }, config, onScanSuccess, () => { /* ignore errors */ })
              .catch((err) => {
                if (err?.name === 'NotReadableError') {
                  toast({
                    variant: 'destructive',
                    title: 'Kamera Error',
                    description: 'Tidak dapat memulai kamera. Pastikan tidak ada aplikasi lain yang sedang menggunakannya atau coba segarkan halaman.',
                    duration: 7000,
                  });
                  console.warn('QR Scanner failed to start: Camera might be in use by another application.');
                } else if (err.name !== 'NotAllowedError') {
                  console.error('Could not start QR scanner', err);
                }
              });
        }
    }
    
    // The cleanup function is the single, reliable place to stop the scanner.
    // It runs whenever the dependencies change or the component unmounts.
    return () => {
        const scanner = html5QrCodeRef.current;
        // Check if scanner exists and is actually scanning before trying to stop.
        if (scanner && scanner.getState() === 2 /* SCANNING */) {
            scanner.stop().catch((err) => {
                // "NotAllowedError" can happen on fast navigation, it's safe to ignore.
                if (err.name !== 'NotAllowedError') {
                    console.warn("QR scanner failed to stop cleanly.", err);
                }
            });
        }
    };
  }, [hasCameraPermission, status, isHoliday, onScanSuccess, toast]);
  
  const isLoading = isUserLoading || isUserDataLoading || isConfigLoading || isAttendanceLoading || hasCameraPermission === null || isMonthlyConfigLoading;

  const renderContent = () => {
    if (isLoading) {
      return (
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Absensi Kehadiran</CardTitle>
          </CardHeader>
          <CardContent style={{ height: '350px' }} className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin" />
            <p className="text-muted-foreground">Mempersiapkan kamera & konfigurasi...</p>
          </CardContent>
        </Card>
      );
    }

    if (isHoliday) {
      return (
        <Card className="w-full max-w-md text-center">
          <CardHeader className="items-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 mb-4"><CalendarOff className="h-8 w-8 text-blue-600 dark:text-blue-400" /></div><CardTitle>Hari Libur</CardTitle><CardDescription>Sistem absensi sedang tidak aktif.</CardDescription></CardHeader>
          <CardContent><p className="text-muted-foreground">Nikmati hari libur Anda. Absensi tidak diperlukan hari ini.</p></CardContent>
        </Card>
      );
    }
    
    if (!hasCameraPermission) {
        return (
            <Card className="w-full max-w-md text-center">
                <CardHeader className="items-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4"><CameraOff className="h-8 w-8 text-destructive" /></div><CardTitle>Akses Kamera Dibutuhkan</CardTitle><CardDescription>Aplikasi ini memerlukan izin untuk menggunakan kamera Anda agar dapat memindai QR code absensi.</CardDescription></CardHeader>
                <CardContent><p className="text-muted-foreground text-sm">Silakan aktifkan izin kamera untuk situs ini di pengaturan browser Anda, lalu segarkan halaman ini.</p></CardContent>
            </Card>
        );
    }

    if (status === 'loading' || status === 'locating') {
        return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Memproses Absensi</CardTitle>
                <CardDescription>Mohon tunggu sebentar...</CardDescription>
            </CardHeader>
            <CardContent style={{ height: '300px' }} className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin" />
                <p className="text-muted-foreground">
                    {status === 'locating' ? 'Mendapatkan lokasi Anda...' : 'Memvalidasi & menyimpan data...'}
                </p>
            </CardContent>
        </Card>
        );
    }

    if (status.startsWith('success_') || status.startsWith('error_')) {
        return <StatusFeedbackCard 
            status={status} 
            locationVerified={locationVerified} 
            locationError={locationError} 
            userData={userData}
            onClose={() => {
                setStatus('idle');
                setLocationError(null);
            }} 
        />;
    }

    if (status === 'idle') {
      return (
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Pindai QR Code Absensi</CardTitle>
            <CardDescription>Arahkan kamera ke QR Code yang ditampilkan oleh Admin.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 p-2 sm:p-6">
            <div className="relative w-full aspect-square bg-black/50 rounded-lg overflow-hidden backdrop-blur-sm">
                <div id="reader" className="w-full h-full" />

                {/* Scanner Line */}
                <div className="absolute left-0 w-full h-0.5 bg-red-500 shadow-[0_0_10px_2px_theme(colors.red.500)] animate-scan-line pointer-events-none" />

                {/* Corner Brackets */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-white/70 rounded-tl-md pointer-events-none" />
                <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-white/70 rounded-tr-md pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-white/70 rounded-bl-md pointer-events-none" />
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-white/70 rounded-br-md pointer-events-none" />
            </div>
          </CardContent>
        </Card>
      );
    }
    
    return null;
  };

  return (
    <div className="flex flex-col items-start gap-6 p-4">
      {renderContent()}
    </div>
  );
}
