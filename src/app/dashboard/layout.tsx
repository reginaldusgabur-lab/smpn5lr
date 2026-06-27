
'use client';

import { useState, useEffect } from 'react';
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

  // Onboarding state
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Hanya redirect jika pemuatan selesai dan user memang tidak ada
    if (!isUserLoading && !user) {
      router.replace('/');
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
        // Pengguna baru, mulai proses orientasi
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

  // Jika kita yakin tidak ada user, tampilkan loader sebentar sebelum redirect (biasanya cepat)
  if (!isUserLoading && !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // RENDER SHELL LANGSUNG: Sidebar dan Header tetap muncul meskipun data detail (isUserLoading) masih diproses.
  // Ini memberikan efek "Luxury" karena aplikasi terasa instan.
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
