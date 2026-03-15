import React from 'react';
import { AppSidebar } from './app-sidebar';
import { Header } from './header';
import { AppFooter } from './app-footer';

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    // Wrapper div is hidden on small screens, and flex container on medium screens and up
    <div className="hidden bg-muted/40 sm:flex sm:h-screen sm:w-full">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="w-full">{children}</div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
