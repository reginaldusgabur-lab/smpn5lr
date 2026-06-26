"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PwaInstaller = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      console.log("beforeinstallprompt event fired");
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Check if the app is not already installed in standalone mode
      if (!window.matchMedia('(display-mode: standalone)').matches && !(window.navigator as any).standalone) {
         setIsVisible(true);
      }
    };

    // Use a type assertion because the default Event type doesn't include `BeforeInstallPromptEvent` properties
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as (e: Event) => void);

    const handleAppInstalled = () => {
      console.log("PWA was installed");
      setIsVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as (e: Event) => void);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    if(outcome === 'accepted') {
        setIsVisible(false);
        setInstallPrompt(null);
    }
  };

  if (!isVisible) {
    return null;
  }

  // A simple, non-intrusive install button at the bottom right.
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button onClick={handleInstallClick} className="flex items-center gap-2 shadow-lg">
        <Download className="h-4 w-4" />
        Install Aplikasi
      </Button>
    </div>
  );
};

export default PwaInstaller;
