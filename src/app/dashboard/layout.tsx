'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { CacheProvider } from '@/context/CacheContext';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MobileLayout } from '@/components/layout/MobileLayout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OnboardingTour } from '@/components/OnboardingTour';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const isMobile = useMediaQuery('(max-width: 640px)');

  // Onboarding states
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (!isUserLoading && !user) {
      router.replace('/');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user || !firestore) return;
      
      // SOLUSI: Gunakan sessionStorage untuk mencegah dialog muncul lagi saat refresh cepat
      if (sessionStorage.getItem('onboardingInProgress') === 'true') {
        return;
      }

      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && !userDoc.data().onboardingSelesai) {
        // Pengguna baru, mulai proses orientasi
        sessionStorage.setItem('onboardingInProgress', 'true'); // Set flag di sessionStorage
        setShowRulesDialog(true);
      }
    };

    if (user && firestore) {
      checkOnboarding();
    }
  }, [user, firestore]);

  const handleTourComplete = async () => {
    setRunTour(false);
    if (!user || !firestore) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await setDoc(userDocRef, { onboardingSelesai: true }, { merge: true });
      // Tidak perlu menghapus sessionStorage, karena akan hilang saat tab ditutup
    } catch (error) {
      console.error("Gagal menyimpan status onboarding:", error);
    }
  };
  
  const handleRulesDialogClose = () => {
      setShowRulesDialog(false);
      setTimeout(() => setRunTour(true), 300);
  };

  if (isUserLoading || !isClient || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <CacheProvider>
      <SidebarProvider>
        {isMobile ? (
          <MobileLayout>{children}</MobileLayout>
        ) : (
          <DesktopLayout>{children}</DesktopLayout>
        )}

        {/* Onboarding Dialog and Tour */}
        <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-6 w-6 text-destructive" />
                        <span>Aturan & Penegasan Absensi</span>
                    </DialogTitle>
                    <DialogDescription className="pt-4 text-left">
                        Selamat datang! Aplikasi ini adalah alat resmi untuk mencatat kehadiran. Mohon patuhi aturan berikut.
                    </DialogDescription>
                </DialogHeader>
                <div className="text-sm space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-4">
                    <div className="font-semibold">1. Kejujuran adalah Segalanya</div>
                    <p className="text-muted-foreground pl-4">
                    Setiap pengguna bertanggung jawab penuh atas kebenaran data absensinya. Manipulasi atau "titip absen" adalah pelanggaran berat.
                    </p>
                    <div className="font-semibold">2. Tepat Waktu</div>
                    <p className="text-muted-foreground pl-4">
                    Lakukan absensi sesuai rentang waktu yang ditetapkan. Keterlambatan akan tercatat oleh sistem.
                    </p>
                    <div className="font-semibold">3. QR Code Bersifat Rahasia</div>
                    <p className="text-muted-foreground pl-4">
                    Dilarang keras menyebarluaskan QR Code absensi. QR Code hanya valid untuk satu kali penggunaan di lokasi.
                    </p>
                </div>
                <div className="flex justify-end pt-4">
                    <Button onClick={handleRulesDialogClose}>Saya Mengerti & Lanjutkan</Button>
                </div>
            </DialogContent>
        </Dialog>

        {!isMobile && <OnboardingTour run={runTour} onTourComplete={handleTourComplete} />}
      </SidebarProvider>
    </CacheProvider>
  );
}
