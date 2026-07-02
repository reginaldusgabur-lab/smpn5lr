
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { X, Loader2, CameraOff, CalendarOff, MapPin, Clock as ClockIcon, CheckCircle, Lock, FileText, Sparkles } from 'lucide-react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, addDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import QuoteOfTheDay from '@/components/layout/quote-of-the-day';
import { useAttendanceWindow } from '@/hooks/use-attendance-window';

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
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

// --- Types ---
type FeedbackStatus = 'idle' | 'processing' | 'locating' | 'success_in' | 'success_out' | 'error_radius' | 'error_time' | 'error_already_in' | 'error_already_out' | 'error_generic' | 'error_location' | 'info_holiday' | 'info_checked_out' | 'info_no_camera' | 'info_disabled' | 'info_leave';

// --- Main Component ---
export default function AbsenPage() {
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const { status: windowStatus, config: schoolConfig } = useAttendanceWindow();
  
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const readerId = "qr-reader-fullscreen";

  // --- Firestore Data Hooks ---
  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userData } = useDoc(user, userDocRef);
  
  const todaysAttendanceQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return query(collection(firestore, 'users', user.uid, 'attendanceRecords'), where('date', '==', todayStr));
  }, [user, firestore]);
  const { data: todaysAttendance, isLoading: isAttendanceLoading } = useCollection(user, todaysAttendanceQuery);
  const todaysRecord = useMemo(() => todaysAttendance?.[0], [todaysAttendance]);

  // Check today's active approved leave
  const todayLeaveQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(
        collection(firestore, 'users', user.uid, 'leaveRequests'),
        where('status', '==', 'approved')
    );
  }, [user, firestore]);
  const { data: activeLeaves, isLoading: isLeaveLoading } = useCollection(user, todayLeaveQuery);

  const currentActiveLeave = useMemo(() => {
      if (!activeLeaves) return null;
      const now = new Date();
      return activeLeaves.find(l => isWithinInterval(now, { start: startOfDay(l.startDate.toDate()), end: endOfDay(l.endDate.toDate()) }));
  }, [activeLeaves]);

  // --- Derived State ---
  const isDataLoading = isUserLoading || isAttendanceLoading || isLeaveLoading || windowStatus === 'LOADING';
  const isCameraInitializing = hasCameraPermission === null;
  const isHoliday = windowStatus === 'SESSION_INACTIVE';
  const isManualDisabled = windowStatus === 'DISABLED';
  const hasCompletedAttendance = useMemo(() => !!(todaysRecord?.checkInTime && todaysRecord?.checkOutTime), [todaysRecord]);

  const effectiveStatus: FeedbackStatus = useMemo(() => {
      if (status !== 'idle') return status;
      if (isDataLoading) return 'idle';
      if (currentActiveLeave) return 'info_leave';
      if (hasCompletedAttendance) return 'info_checked_out';
      if (isManualDisabled) return 'info_disabled';
      if (isHoliday) return 'info_holiday';
      if (windowStatus === 'BEFORE_IN' || windowStatus === 'AFTER_IN' || windowStatus === 'CLOSED') return 'error_time';
      if (hasCameraPermission === false) return 'info_no_camera';
      return 'idle';
  }, [status, isDataLoading, currentActiveLeave, hasCompletedAttendance, isHoliday, isManualDisabled, windowStatus, hasCameraPermission]);

  const showScanner = !isDataLoading && hasCameraPermission && !isHoliday && !isManualDisabled && !hasCompletedAttendance && !currentActiveLeave && (windowStatus === 'CHECK_IN_OPEN' || windowStatus === 'CHECK_OUT_OPEN');
  const showLoader = isDataLoading || isCameraInitializing || (showScanner && !isScannerReady);

  // --- Core Functions ---
  const handleAttendance = useCallback(async () => {
    setLocationError(null);
    if (!user || !firestore || !schoolConfig) {
        setStatus('error_generic');
        return;
    }

    if (windowStatus !== 'CHECK_IN_OPEN' && windowStatus !== 'CHECK_OUT_OPEN') {
        setStatus('error_time');
        return;
    }

    setStatus('processing');

    try {
        let latitude: number | null = null, longitude: number | null = null;
        if (schoolConfig.useLocationValidation) {
            setStatus('locating');
            try {
                const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
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

        if (windowStatus === 'CHECK_IN_OPEN') {
            if (todaysRecord?.checkInTime) return setStatus('error_already_in');
            
            if (todaysRecord) {
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord.id);
                await updateDoc(recordRef, { date: todayStr, checkInTime: now, checkInLatitude: latitude, checkInLongitude: longitude });
                setStatus('success_in');
            } else {
                await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), { userId: user.uid, date: todayStr, checkInTime: now, checkInLatitude: latitude, checkInLongitude: longitude, checkOutTime: null });
                setStatus('success_in');
            }
        } else if (windowStatus === 'CHECK_OUT_OPEN') {
            if (todaysRecord?.checkOutTime) return setStatus('error_already_out');
            
            if (!todaysRecord) {
                 await addDoc(collection(firestore, 'users', user.uid, 'attendanceRecords'), { 
                    userId: user.uid, 
                    date: todayStr, 
                    checkInTime: null, 
                    checkOutTime: now, 
                    checkOutLatitude: latitude, 
                    checkOutLongitude: longitude,
                    reasonForUpdate: 'Absen pulang (Tanpa masuk)'
                });
            } else {
                const recordRef = doc(firestore, 'users', user.uid, 'attendanceRecords', todaysRecord.id);
                await updateDoc(recordRef, { checkOutTime: now, checkOutLatitude: latitude, checkOutLongitude: longitude });
            }
            setStatus('success_out');
        }
    } catch (error) {
        console.error("Attendance Error:", error);
        setStatus('error_generic');
    }
}, [user, firestore, schoolConfig, todaysRecord, windowStatus]);
  
  const statusRef = useRef(status); statusRef.current = status;
  const handleAttendanceRef = useRef(handleAttendance); handleAttendanceRef.current = handleAttendance;

  useEffect(() => {
    let isMounted = true;
    const checkCameras = async () => {
        try {
            const devices = await Html5Qrcode.getCameras();
            if (isMounted) setHasCameraPermission(!!(devices && devices.length));
        } catch (e) {
            if (isMounted) setHasCameraPermission(false);
        }
    }
    checkCameras();
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
            const config: Html5QrcodeCameraScanConfig = { fps: 30 }; 
            qrCode.start({ facingMode: 'environment' }, config, onScanSuccess, undefined)
            .then(() => { if (html5QrCodeRef.current) setIsScannerReady(true); })
            .catch(err => {
                console.error('Scanner start error', err);
                setIsScannerReady(false);
            });
        }
    } 
    return () => {
        if (html5QrCodeRef.current) {
            if (html5QrCodeRef.current.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.warn("Stop error", err));
            }
            html5QrCodeRef.current = null;
            setIsScannerReady(false);
        }
    };
  }, [showScanner, status, onScanSuccess]);

  return (
    <div className="fixed inset-0 z-40 bg-[#0a0a0b] overflow-hidden" style={{ touchAction: 'none' }}>
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
            <h2 className="text-white text-2xl font-bold mb-1 drop-shadow-md">Pindai QR Code</h2>
            <p className="text-white/60 text-xs font-medium">Tempatkan kamera tepat di depan QR Code</p>
        </div>

        <button 
            onClick={() => router.push('/dashboard')}
            className="absolute top-6 right-6 z-[60] p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors"
        >
            <X className="h-6 w-6" />
        </button>

        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none pb-20">
            <div className="relative w-full h-full">
                {isScannerReady && (
                    <div className={cn(
                        "absolute left-0 right-0 h-20 transition-all duration-700 animate-scan-line z-20 pointer-events-none",
                        status === 'idle' 
                            ? "bg-gradient-to-b from-transparent via-primary/40 to-transparent shadow-[0_0_15px_rgba(63,81,181,0.2)]" 
                            : "bg-gradient-to-b from-transparent via-green-500/40 to-transparent shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                    )} />
                )}

                {showLoader && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                        <Loader2 className="h-10 w-10 animate-spin text-white" />
                    </div>
                )}
            </div>
        </div>

        {effectiveStatus !== 'idle' && (
            <StatusFeedbackOverlay 
                status={effectiveStatus} 
                locationError={locationError} 
                leaveType={currentActiveLeave?.type}
                onClose={() => effectiveStatus.startsWith('success') || effectiveStatus.startsWith('info') || effectiveStatus === 'error_time' || effectiveStatus === 'info_holiday' || effectiveStatus === 'info_disabled' || effectiveStatus === 'info_leave' ? router.push('/dashboard') : setStatus('idle')} 
                userData={userData} 
            />
        )}
    </div>
  );
}

const StatusFeedbackOverlay = ({ status, locationError, onClose, userData, leaveType }: { status: FeedbackStatus, locationError: string | null, onClose: () => void, userData: any, leaveType?: string }) => {
    const feedback = useMemo(() => {
        const iconSize = "h-10 w-10";
        const iconWrapper = "p-6 rounded-full border-[0.5px] transition-colors duration-500 mb-10";
        
        switch (status) {
            case 'processing': return { icon: <div className={cn(iconWrapper, "border-primary/20")}><Loader2 className={cn(iconSize, "animate-spin text-primary")} /></div>, title: 'Memproses...', desc: 'Sedang memvalidasi absensi Anda.' };
            case 'locating': return { icon: <div className={cn(iconWrapper, "border-primary/20")}><Loader2 className={cn(iconSize, "animate-spin text-primary")} /></div>, title: 'Mencari Lokasi...', desc: 'Mohon tunggu, sedang mendapatkan data GPS.' };
            case 'success_in': return { icon: <div className={cn(iconWrapper, "border-green-500/30")}><CheckCircle className={cn(iconSize, "text-green-500")} /></div>, title: 'Absen Masuk Berhasil', desc: 'Kehadiran Anda telah terekam. Selamat beraktivitas!' };
            case 'success_out': return { icon: <div className={cn(iconWrapper, "border-green-500/30")}><CheckCircle className={cn(iconSize, "text-green-500")} /></div>, title: 'Absen Pulang Berhasil', desc: 'Absen pulang terekam. Hati-hati di jalan!' };
            case 'error_radius': return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><MapPin className={cn(iconSize, "text-destructive")} /></div>, title: 'Di Luar Radius', desc: 'Anda harus berada di dalam area sekolah untuk absensi.' };
            case 'error_time': return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><ClockIcon className={cn(iconSize, "text-destructive")} /></div>, title: 'Waktu Habis', desc: 'Sesi absensi untuk hari ini telah ditutup.' };
            case 'error_already_in': return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><X className={cn(iconSize, "text-destructive")} /></div>, title: 'Sudah Absen Masuk', desc: 'Anda sudah melakukan absensi masuk hari ini.' };
            case 'error_already_out': return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><X className={cn(iconSize, "text-destructive")} /></div>, title: 'Sudah Absen Pulang', desc: 'Anda sudah melakukan absensi pulang hari ini.' };
            case 'error_location': return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><MapPin className={cn(iconSize, "text-destructive")} /></div>, title: 'Lokasi Error', desc: locationError || 'Pastikan GPS aktif and berikan izin akses.' };
            case 'info_disabled': return { icon: <div className={cn(iconWrapper, "border-amber-500/30")}><Lock className={cn(iconSize, "text-amber-500")} /></div>, title: 'Sistem Dinonaktifkan', desc: 'Admin telah menonaktifkan sistem absensi sementara.' };
            case 'info_holiday': return { icon: <div className={cn(iconWrapper, "border-blue-500/30")}><CalendarOff className={cn(iconSize, "text-blue-500")} /></div>, title: 'Hari Libur', desc: 'Sistem absensi tidak aktif hari ini.' };
            case 'info_checked_out': return { icon: <div className={cn(iconWrapper, "border-green-500/30")}><CheckCircle className={cn(iconSize, "text-green-500")} /></div>, title: 'Absensi Selesai', desc: 'Anda telah menyelesaikan absensi untuk hari ini.' };
            case 'info_no_camera': return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><CameraOff className={cn(iconSize, "text-destructive")} /></div>, title: 'Kamera Error', desc: 'Izinkan akses kamera di pengaturan browser.' };
            case 'info_leave': return { icon: <div className={cn(iconWrapper, "border-blue-500/30")}><FileText className={cn(iconSize, "text-blue-500")} /></div>, title: `${leaveType} Disetujui`, desc: `Anda memiliki izin/sakit sah yang berlaku hari ini.` };
            default: return { icon: <div className={cn(iconWrapper, "border-destructive/30")}><X className={cn(iconSize, "text-destructive")} /></div>, title: 'Gagal', desc: 'Terjadi kesalahan sistem. Silakan coba lagi.' };
        }
    }, [status, locationError, leaveType]);

    const isSuccess = status.startsWith('success');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-10">
            <div className={cn(
                "w-full max-w-[360px] text-center p-12 rounded-xl shadow-2xl relative",
                "bg-[#0a0f0d] border border-green-500/20 transition-all duration-700 animate-in fade-in zoom-in-95"
            )} onClick={(e) => e.stopPropagation()}>
                
                <div className="flex flex-col items-center">
                    <div className="mb-2">{feedback.icon}</div>
                    <div className="space-y-4 mb-10">
                        <h3 className="text-2xl font-black tracking-tight text-white leading-tight">{feedback.title}</h3>
                        <p className="text-zinc-500 text-xs font-bold leading-relaxed px-4">{feedback.desc}</p>
                    </div>
                    
                    {isSuccess && (
                        <div className="w-full">
                            <QuoteOfTheDay category={userData?.role} attendanceType={status === 'success_in' ? 'in' : 'out'} />
                        </div>
                    )}
                    
                    <Button 
                        className="w-full font-black rounded-2xl h-14 text-xs shadow-xl active:scale-95 transition-all bg-[#2563eb] hover:bg-[#1d4ed8] text-white border-none tracking-widest uppercase mt-4" 
                        onClick={onClose}
                    >
                        TUTUP
                    </Button>
                </div>
            </div>
        </div>
    );
};
