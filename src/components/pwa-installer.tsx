"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

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
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      
      // Cek apakah aplikasi sudah dalam mode standalone
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      
      if (!isStandalone && !isDismissed) {
         // Berikan sedikit jeda agar tidak langsung muncul saat loading
         setTimeout(() => setIsVisible(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as (e: Event) => void);

    const handleAppInstalled = () => {
      setIsVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as (e: Event) => void);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isDismissed]);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
        setIsVisible(false);
        setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
  };

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-[100] animate-in fade-in slide-in-from-bottom-10 duration-700">
      <div className="bg-card border border-primary/10 shadow-2xl rounded-3xl p-4 sm:p-5 flex items-center gap-4 max-w-md ml-auto">
        <div className="bg-primary/10 p-2 rounded-2xl shrink-0">
            <Image 
                src="/logo-3d-v2.png" 
                alt="Logo" 
                width={40} 
                height={40} 
                className="rounded-lg shadow-sm"
            />
        </div>
        
        <div className="flex-1 min-w-0">
            <h4 className="text-sm font-black tracking-tight flex items-center gap-1.5">
                Instal E-SPENLI
                <Sparkles className="h-3 w-3 text-amber-500" />
            </h4>
            <p className="text-[10px] text-muted-foreground font-medium leading-tight mt-0.5">
                Akses lebih cepat & pengalaman layar penuh.
            </p>
        </div>

        <div className="flex items-center gap-2">
            <Button 
                onClick={handleInstallClick} 
                size="sm"
                className="h-9 px-4 rounded-xl font-bold text-[11px] shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Instal
            </Button>
            <button 
                onClick={handleDismiss}
                className="text-muted-foreground hover:bg-muted p-1.5 rounded-full transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
      </div>
    </div>
  );
};

export default PwaInstaller;