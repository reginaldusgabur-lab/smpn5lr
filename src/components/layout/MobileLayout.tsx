import React from 'react';
import { BottomNavigation } from './bottom-navigation';
import { Header } from './header';

export function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-background w-full overflow-x-hidden">
      <Header />
      {/* 
        The main content area is now consistent across all pages.
        - Fixed Header (pt-16)
        - Fixed Bottom Navigation (pb-20)
        - bg-background applied to ensure no odd blocks in dark mode
      */}
      <main className="flex-1 pt-16 pb-20 w-full flex flex-col items-stretch bg-background">
        <div className="w-full p-4 flex flex-col items-stretch bg-background">
            {children}
        </div>
      </main>
      <BottomNavigation />
    </div>
  );
}
