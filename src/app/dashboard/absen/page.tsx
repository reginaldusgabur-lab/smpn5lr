'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { X, Loader2, CameraOff, CalendarOff } from 'lucide-react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, addDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import QuoteOfTheDay from '@/components/layout/quote-of-the-day';

// --- Helper Functions ---
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // in metres
}

const getCurrentPosition = (options?: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));

// --- Types ---
type FeedbackStatus = 'idle' | 'processing' | 'locating' | 'success_in' | 'success_out' | 'error_radius' | 'error_time' | 'error_already_in' | 'error_already_out' | 'error_generic' | 'error_location' | 'info_holiday' | 'info_checked_out' | 'info_no_camera';

// --- Main Component ---
export default function AbsenPage() {
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader-fullscreen";

  // --- Firestore Data Hooks ---
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData } = useDoc(user, userDocRef);
  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig } = useDoc(user, schoolConfigRef);
  const monthlyConfigId = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  const monthlyConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'monthlyConfigs', monthlyConfigId) : null, [firestore, monthlyConfigId]);
  const { data: monthlyConfig } = useDoc(user, monthlyConfigRef);
  
  const todaysAttendanceQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', todayStr));
  }, [user, firestore]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
  const todaysRecord = useMemo(() => todaysAttendance?.[0], [todaysAttendance]);

  // --- Derived State ---
  const isDataLoading = isUserLoading || isAttendanceLoading;
  const isCameraInitializing = hasCameraPermission === null;
  const isHoliday = useMemo(() => {
    if (!schoolConfig) return false;
    if (schoolConfig.isAttendanceActive === false) return true;
    const today = new Date(), todayStr = format(today, 'yyyy-MM-dd');
    if (monthlyConfig?.holidays?.includes(todayStr)) return true;
    const offDays: number[] = schoolConfig.offDays ?? [0, 6];
    return offDays.includes(today.getDay());
  }, [schoolConfig, monthlyConfig]);
  const hasCompletedAttendance = useMemo(() => !!(todaysRecord?.checkInTime && todaysRecord?.checkOutTime), [todaysRecord]);

  const effectiveStatus: FeedbackStatus = useMemo(() => {
      if (status !== 'idle') return status;
      if (isDataLoading) return 'idle';
      if (hasCompletedAttendance) return 'info_checked_out';
      if (isHoliday) return 'info_holiday';
      if (hasCameraPermission === false) return 'info_no_camera';
      return 'idle';
  }, [status, isDataLoading, hasCompletedAttendance, isHoliday, hasCameraPermission]);

  const showScanner = !isDataLoading && hasCameraPermission && !isHoliday && !hasCompletedAttendance;
  const showLoader = isDataLoading || isCameraInitializing || (showScanner && !isScannerReady);

  // --- Core Functions ---
  const handleAttendance = useCallback(async () => {
    setLocationError(null);
    if (!user || !firestore || !schoolConfig) {
        setStatus('error_generic');
        return;
    }
    setStatus('processing');

    let isCheckInTime = false, isCheckOutTime = false;
    if (schoolConfig.useTimeValidation) {
        const now = new Date(), currentTime = now.getHours() * 60 + now.getMinutes();
        const [inStartH, inStartM] = schoolConfig.checkInStartTime.split(':').map(Number), checkInStartTime = inStartH * 60 + inStartM;
        const [inEndH, inEndM] = schoolConfig.checkInEndTime.split(':').map(Number), checkInEndTime = inEndH * 60 + inEndM;
        const [outStartH, outStartM] = schoolConfig.checkOutStartTime.split(':').map(Number), checkOutStartTime = outStartH * 60 + outStartM;
        const [outEndH, outEndM] = schoolConfig.checkOutEndTime.split(':').map(Number), checkOutEndTime = outEndH * 60 + outEndM;
        isCheckInTime = currentTime >= checkInStartTime && currentTime <= checkInEndTime;
        isCheckOutTime = currentTime >= checkOutStartTime && currentTime <= checkOutEndTime;
        if (!isCheckInTime && !isCheckOutTime) return setStatus('error_time');
    } else {
        if (todaysRecord && !todaysRecord.checkOutTime) isCheckOutTime = true; else isCheckInTime = true;
    }

    try {
        let latitude: number | null = null, longitude: number | null = null;
        if (schoolConfig.useLocationValidation) {
            setStatus('locating');
            try {
                const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
                latitude = pos.coords.latitude; longitude = pos.coords.longitude;
                if (schoolConfig.radius && schoolConfig.latitude && schoolConfig.longitude) {
                    if (getDistance(latitude, longitude, schoolConfig.latitude, schoolConfig.longitude) > schoolConfig.radius) return setStatus('error_radius');
                }
            } catch (error: any) {
                let specificError = 'Gagal mendapatkan lokasi.';
                if (error.code === 1) specificError = 'Akses lokasi ditolak.';
                setLocationError(specificError); return setStatus('error_location');
            }
        }

        setStatus('processing');
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');

        if (isCheckInTime) {
            if (todaysRecord) {
                if (todaysRecord.checkInTime) return setStatus('error_already_in');
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord.id);
                await updateDoc(recordRef, { date: todayStr, checkInTime: now, checkInLatitude: latitude, checkInLongitude: longitude });
                setStatus('success_in');
            } else {
                await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), { userId: user.uid, date: todayStr, checkInTime: now, checkInLatitude: latitude, checkInLongitude: longitude, checkOutTime: null });
                setStatus('success_in');
            }
        } else if (isCheckOutTime) {
            if (todaysRecord) {
                if (todaysRecord.checkOutTime) return setStatus('error_already_out');
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord.id);
                await updateDoc(recordRef, { date: todayStr, checkOutTime: now, checkOutLatitude: latitude, checkOutLongitude: longitude });
                setStatus('success_out');
            } else {
                await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), { userId: user.uid, date: todayStr, checkInTime: null, checkOutTime: now, checkOutLatitude: latitude, checkOutLongitude: longitude });
                setStatus('success_out');
            }
        }
    } catch (error) {
        console.error("Attendance Error:", error);
        setStatus('error_generic');
    }
}, [user, firestore, schoolConfig, todaysRecord]);
  
  const statusRef = useRef(status); statusRef.current = status;
  const handleAttendanceRef = useRef(handleAttendance); handleAttendanceRef.current = handleAttendance;

  useEffect(() => {
    let isMounted = true;
    Html5Qrcode.getCameras().then(devices => isMounted && setHasCameraPermission(!!(devices && devices.length))).catch(() => isMounted && setHasCameraPermission(false));
    return () => { isMounted = false; };
  }, []);

  const onScanSuccess = useCallback((decodedText: string) => {
    if (statusRef.current === 'idle' && schoolConfig?.qrCodeValue) {
        if (decodedText === schoolConfig.qrCodeValue) {
            handleAttendanceRef.current();
        } else {
            toast({ variant: 'destructive', title: 'QR Code tidak valid' });
        }
    }
  }, [schoolConfig, toast]);

  useEffect(() => {
    if (showScanner && status === 'idle') {
        const qrCode = html5QrCodeRef.current || new Html5Qrcode(readerId, { verbose: false });
        html5QrCodeRef.current = qrCode;

        if (qrCode.getState() !== 2) {
            setIsScannerReady(false);
            const config: Html5QrcodeCameraScanConfig = { fps: 10 };
            qrCode.start({ facingMode: 'environment' }, config, onScanSuccess, undefined)
            .then(() => { if (html5QrCodeRef.current) setIsScannerReady(true); })
            .catch(err => console.error('Scanner error', err));
        }
    } 
    return () => {
        if (html5QrCodeRef.current?.isScanning) {
            html5QrCodeRef.current.stop().then(() => setIsScannerReady(false)).catch(err => console.warn("Stop error", err));
            html5QrCodeRef.current = null;
        }
    };
  }, [showScanner, status, onScanSuccess]);

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-hidden">
        {(showScanner || isCameraInitializing) && (
            <div className="absolute inset-0">
                <div id={readerId} className="w-full h-full" />
                <style>{`
                    #${readerId} > video { width: 100% !important; height: 100% !important; object-fit: cover !important; opacity: ${isScannerReady ? 1 : 0.5}; transition: opacity 0.5s ease-in-out; }
                    #${readerId}__scan_region, #${readerId}__dashboard_section_csr { display: none !important; }
                `}</style>
            </div>
        )}

        <div className="absolute top-8 left-0 right-0 z-50 px-8 text-center pointer-events-none transition-all">
            <h2 className="text-white text-2xl font-black mb-1 drop-shadow-md">Arahkan kamera</h2>
            <p className="text-white/80 text-xs font-bold">Dekatkan QR Code ke area pemindaian</p>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none pb-20">
            <div className="relative w-full aspect-square max-w-[280px]">
                {/* Garis Pemindai Bercahaya (Glow Scan Line) */}
                {isScannerReady && (
                    <div className={cn(
                        "absolute left-2 right-2 h-0.5 transition-all duration-500 animate-scan-line z-20",
                        status === 'idle' 
                            ? "bg-primary shadow-[0_0_20px_rgba(63,81,181,0.8)]" 
                            : "bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.9)]"
                    )} />
                )}

                <div className={cn("absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 rounded-tl-2xl transition-colors", isScannerReady ? 'border-primary' : 'border-white/40')} />
                <div className={cn("absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 rounded-tr-2xl transition-colors", isScannerReady ? 'border-primary' : 'border-white/40')} />
                <div className={cn("absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 rounded-bl-2xl transition-colors", isScannerReady ? 'border-primary' : 'border-white/40')} />
                <div className={cn("absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 rounded-br-2xl transition-colors", isScannerReady ? 'border-primary' : 'border-white/40')} />

                {showLoader && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl">
                        <Loader2 className="h-10 w-10 animate-spin text-white" />
                    </div>
                )}
            </div>
        </div>

        {effectiveStatus !== 'idle' && (
            <StatusFeedbackOverlay 
                status={effectiveStatus} 
                locationError={locationError} 
                onClose={() => effectiveStatus.startsWith('success') || effectiveStatus.startsWith('info') ? router.push('/dashboard') : setStatus('idle')} 
                userData={userData} 
            />
        )}
    </div>
  );
}

const StatusFeedbackOverlay = ({ status, locationError, onClose, userData }: { status: FeedbackStatus, locationError: string | null, onClose: () => void, userData: any }) => {
    const feedback = useMemo(() => {
        switch (status) {
            case 'processing': return { icon: <Loader2 className="h-16 w-16 animate-spin text-primary" />, title: 'Memproses...', desc: 'Sedang memvalidasi absensi Anda.', cardClass: 'bg-background' };
            case 'locating': return { icon: <Loader2 className="h-16 w-16 animate-spin text-primary" />, title: 'Mencari lokasi...', desc: 'Mohon tunggu, sedang mendapatkan data lokasi.', cardClass: 'bg-background' };
            case 'success_in': return { icon: <CheckCircle className="h-16 w-16 text-green-500" />, title: 'Absen masuk berhasil', desc: 'Kehadiran Anda telah terekam. Selamat beraktivitas!', cardClass: 'bg-green-50 dark:bg-green-950/50' };
            case 'success_out': return { icon: <CheckCircle className="h-16 w-16 text-blue-500" />, title: 'Absen pulang berhasil', desc: 'Absen pulang terekam. Hati-hati di jalan!', cardClass: 'bg-blue-50 dark:bg-blue-950/50' };
            case 'error_radius': return { icon: <MapPin className="h-16 w-16 text-destructive" />, title: 'Di luar radius', desc: 'Anda harus berada di dalam area sekolah untuk absensi.', cardClass: 'bg-destructive/10' };
            case 'error_time': return { icon: <ClockIcon className="h-16 w-16 text-destructive" />, title: 'Di luar jam absen', desc: 'Waktu absensi belum dibuka atau sudah ditutup.', cardClass: 'bg-destructive/10' };
            case 'error_already_in': return { icon: <X className="h-16 w-16 text-destructive" />, title: 'Sudah absen masuk', desc: 'Anda sudah melakukan absensi masuk hari ini.', cardClass: 'bg-destructive/10' };
            case 'error_already_out': return { icon: <X className="h-16 w-16 text-destructive" />, title: 'Sudah absen pulang', desc: 'Anda sudah melakukan absensi pulang hari ini.', cardClass: 'bg-destructive/10' };
            case 'error_location': return { icon: <MapPin className="h-16 w-16 text-destructive" />, title: 'Lokasi error', desc: locationError || 'Pastikan GPS aktif and berikan izin akses.', cardClass: 'bg-destructive/10' };
            case 'info_holiday': return { icon: <CalendarOff className="h-16 w-16 text-blue-500" />, title: 'Hari libur', desc: 'Sistem absensi tidak aktif hari ini.', cardClass: 'bg-blue-50 dark:bg-blue-950/50' };
            case 'info_checked_out': return { icon: <CheckCircle className="h-16 w-16 text-green-500" />, title: 'Absensi selesai', desc: 'Anda telah menyelesaikan absensi untuk hari ini.', cardClass: 'bg-green-50 dark:bg-green-950/50' };
            case 'info_no_camera': return { icon: <CameraOff className="h-16 w-16 text-destructive" />, title: 'Kamera tidak tersedia', desc: 'Izinkan akses kamera di pengaturan browser.', cardClass: 'bg-destructive/10' };
            default: return { icon: <X className="h-16 w-16 text-destructive" />, title: 'Gagal', desc: 'Terjadi kesalahan sistem. Silakan coba lagi.', cardClass: 'bg-destructive/10' };
        }
    }, [status, locationError]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className={cn("w-full max-sm text-center p-8 rounded-3xl shadow-2xl relative", feedback.cardClass)} onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-4">
                    <div className="mb-2">{feedback.icon}</div>
                    <h3 className="text-2xl font-bold">{feedback.title}</h3>
                    <p className="text-muted-foreground text-sm">{feedback.desc}</p>
                    {(status.startsWith('success')) && <QuoteOfTheDay category={userData?.role} attendanceType={status === 'success_in' ? 'in' : 'out'} />}
                    <Button className="mt-6 w-full font-bold" onClick={onClose}>Tutup</Button>
                </div>
            </div>
        </div>
    );
};

const CheckCircle = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const MapPin = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
);
const ClockIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
