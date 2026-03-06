'use client';

import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Header } from '@/components/layout/header';
import { BottomNavigation } from '@/components/layout/bottom-navigation';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const isMobile = useIsMobile();

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData, isLoading: isUserDataLoading } = useDoc<{ role: string, hasSeenRules?: boolean }>(user, userDocRef);

  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [isUpdatingRules, setIsUpdatingRules] = useState(false);

  const isLoading = isUserLoading || (user && isUserDataLoading);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/');
    }
  }, [isUserLoading, user, router]);

  useEffect(() => {
    if (isMobile) {
      const handlePopState = () => {
        router.replace('/dashboard');
      };

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isMobile, router]);

  useEffect(() => {
    if (userData && userData.hasSeenRules === false) {
      setShowRulesDialog(true);
    }
  }, [userData]);

  const handleAcknowledgeRules = async () => {
    if (!userDocRef) return;
    setIsUpdatingRules(true);
    try {
      await updateDoc(userDocRef, { hasSeenRules: true });
      setShowRulesDialog(false);
    } catch (error) {
      console.error("Failed to update rules acknowledgement:", error);
    } finally {
      setIsUpdatingRules(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
      return null;
  }

  return (
    <SidebarProvider>
        <AlertDialog open={showRulesDialog}>
          <AlertDialogContent className="mx-4 rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Peraturan Aplikasi</AlertDialogTitle>
              <AlertDialogDescription>
                Selamat datang! Sebelum melanjutkan, harap baca dan setujui peraturan berikut:
                1. Dilarang menyalahgunakan aplikasi untuk tujuan ilegal.
                2. Data absensi Anda akan direkam dan dipantau.
                3. Jaga kerahasiaan akun Anda.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleAcknowledgeRules} disabled={isUpdatingRules}>
                {isUpdatingRules ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Saya Mengerti & Setuju
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex h-screen w-full bg-muted/40 overflow-hidden">
            <AppSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6">
                    <div className="mx-auto w-full max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
        </div>
        <BottomNavigation />
    </SidebarProvider>
  );
}
