import React from 'react';
import { BottomNavigation } from './bottom-navigation';
import { Header } from './header';

export function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    // This layout component is now just a simple wrapper.
    // The scrolling is handled by the browser/body itself.
    <div>
      <Header />
      {/* The main content area. 
          - `pt-16` provides space for the 64px fixed Header.
          - `pb-20` provides space for the 64px fixed BottomNavigation, with extra padding.
          There are no height or overflow properties, allowing the content to flow naturally and the page to scroll. */}
      <main className="pt-16 pb-20">
        <div className="px-2 py-4">
            {children}
        </div>
      </main>
      <BottomNavigation />
    </div>
  );
}
