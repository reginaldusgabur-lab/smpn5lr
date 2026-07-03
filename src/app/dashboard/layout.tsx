
'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CacheProvider } from '@/context/CacheContext';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { OnboardingTour } from '@/components/OnboardingTour';
import { SystemNotification } from '@/components/layout/SystemNotification';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const redirectChecked = useRef(false);

  // Onboarding state
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Cegah loop redirect dengan pengecekan isUserLoading yang lebih stabil
    if (!isUserLoading) {
      if (!user && !redirectChecked.current) {
        redirectChecked.current = true;
        router.replace('/');
      }
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user || !firestore) return;
      
      if (sessionStorage.getItem('onboardingInProgress') === 'true') {
        return;
      }

      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && !userDoc.data().onboardingSelesai) {
        sessionStorage.setItem('onboardingInProgress', 'true');
        setRunTour(true);
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
    } catch (error) {
      console.error("Gagal menyimpan status onboarding:", error);
    }
  };

  // Jangan render apapun di server untuk mencegah hydration mismatch
  if (!isClient) {
    return null;
  }

  // Jika sedang memuat status user atau redirect sedang diproses, tampilkan loader yang stabil
  // Loader diletakkan secara absolut untuk menutupi layar tanpa memicu event scroll balik
  if (isUserLoading || (!user && !redirectChecked.current)) {
    return (
      <div className="absolute inset-0 flex h-screen w-full items-center justify-center bg-background z-[9999]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Pastikan shell hanya muncul jika user sudah benar-benar ada
  if (!user) return null;

  return (
    <CacheProvider>
      <SidebarProvider>
        <SystemNotification />
        {isMobile ? (
          <MobileLayout>{children}</MobileLayout>
        ) : (
          <DesktopLayout>{children}</DesktopLayout>
        )}

        {!isMobile && <OnboardingTour run={runTour} onTourComplete={handleTourComplete} />}
      </SidebarProvider>
    </CacheProvider>
  );
}
