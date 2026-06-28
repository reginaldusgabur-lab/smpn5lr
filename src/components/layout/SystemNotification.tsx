'use client';

import { useState, useEffect } from 'react';
import { useDoc, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { BellRing, X, CheckCircle2, Sparkles } from 'lucide-react';
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

  const isQuote = config.notificationTitle?.toLowerCase().includes('kutipan') || 
                  config.notificationTitle?.toLowerCase().includes('motivasi');

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center p-4 pointer-events-none">
      <div 
        className={cn(
          "w-full max-w-lg bg-card border border-primary/10 shadow-2xl rounded-3xl p-6 pointer-events-auto",
          "animate-in fade-in slide-in-from-top-full duration-700 ease-out"
        )}
      >
        <div className="flex items-start gap-4">
          <div className={cn(
            "p-3 rounded-2xl shrink-0",
            isQuote ? "bg-amber-500/10" : "bg-primary/10"
          )}>
            {isQuote ? (
              <Sparkles className="h-6 w-6 text-amber-600" />
            ) : (
              <BellRing className="h-6 w-6 text-primary" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-bold text-foreground tracking-tight leading-tight">
              {config.notificationTitle}
            </h3>
            <p className={cn(
              "text-sm font-medium leading-relaxed",
              isQuote ? "italic text-foreground/80" : "text-muted-foreground"
            )}>
              {isQuote ? `"${config.notificationContent}"` : config.notificationContent}
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
            className={cn(
              "rounded-xl font-bold px-6 h-10 shadow-lg active:scale-95 transition-all",
              isQuote 
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20" 
                : "bg-primary hover:bg-primary/90 text-white shadow-primary/20"
            )}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Saya mengerti
          </Button>
        </div>
      </div>
    </div>
  );
}
