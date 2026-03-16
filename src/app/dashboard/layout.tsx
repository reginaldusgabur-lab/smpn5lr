'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CacheProvider } from '@/context/CacheContext';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MobileLayout } from '@/components/layout/MobileLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  // Use the hook to check for mobile screen sizes (Tailwind's sm breakpoint is 640px)
  const isMobile = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    setIsClient(true);
    if (!isUserLoading && !user) {
      router.replace('/');
    }
  }, [user, isUserLoading, router]);

  // Wait until the client is mounted and user status is confirmed
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
      </SidebarProvider>
    </CacheProvider>
  );
}
