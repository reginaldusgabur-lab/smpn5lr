
'use client';

import { useState, useEffect } from 'react';
import { useDoc, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { BellRing, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SystemNotification() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);

  const schoolConfigRef = useMemoFirebase(() => 
    firestore ? doc(firestore, 'schoolConfig', 'default') : null, 
    [firestore]
  );
  
  const { data: config } = useDoc<{
    notificationTitle?: string;
    notificationContent?: string;
    isNotificationActive?: boolean;
    notificationInterval?: number;
  }>(user, schoolConfigRef);

  useEffect(() => {
    // Reset dismissal status when a new notification is activated or changed
    setHasBeenDismissed(false);
    setIsVisible(false);
  }, [config?.notificationTitle, config?.notificationContent, config?.isNotificationActive]);

  useEffect(() => {
    if (config?.isNotificationActive && config?.notificationTitle && !hasBeenDismissed) {
      const delay = (config.notificationInterval || 3) * 1000;
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [config, hasBeenDismissed]);

  const handleDismiss = () => {
    setIsVisible(false);
    setHasBeenDismissed(true);
  };

  if (!config?.isNotificationActive || !isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center p-4 pointer-events-none">
      <div 
        className={cn(
          "w-full max-w-lg bg-card border-2 border-primary/20 shadow-2xl rounded-3xl p-6 pointer-events-auto",
          "animate-in fade-in slide-in-from-top-full duration-700 ease-out"
        )}
      >
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 p-3 rounded-2xl shrink-0">
            <BellRing className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-black text-foreground tracking-tight leading-tight">
              {config.notificationTitle}
            </h3>
            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
              {config.notificationContent}
            </p>
          </div>
          <button 
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mt-6 flex justify-end">
          <Button 
            onClick={handleDismiss}
            className="rounded-xl font-bold bg-primary hover:bg-primary/90 px-6 h-10 shadow-lg shadow-primary/20 active:scale-95 transition-all"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Saya Mengerti
          </Button>
        </div>
      </div>
    </div>
  );
}
