import React from 'react';
import { BottomNavigation } from './bottom-navigation';
import { Header } from './header';

export function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Header />
      {/* 
        The main content area.
        - The `pt-16` is to offset for the fixed Header.
        - The `pb-20` is to offset for the fixed BottomNavigation.
      */}
      <main className="pt-16 pb-20">
        <div className="px-4">
            {children}
        </div>
      </main>
      <BottomNavigation />
    </div>
  );
}
