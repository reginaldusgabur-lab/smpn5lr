'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Komponen titik indikator status jaringan yang diperkecil.
 * Hijau (Kuat), Kuning (Lemah), Merah (Buruk), Abu-abu (Offline).
 */
export function NetworkStatusDot() {
  const [status, setStatus] = useState<'strong' | 'weak' | 'bad' | 'offline'>('strong');
  const [label, setLabel] = useState('Sinyal Kuat');

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) {
        setStatus('offline');
        setLabel('Offline');
        return;
      }

      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;
      
      if (connection) {
        const { effectiveType, rtt } = connection;
        
        if (effectiveType === '4g' && (rtt === undefined || rtt < 200)) {
          setStatus('strong');
          setLabel('Sinyal Kuat');
        } else if (effectiveType === '3g' || (rtt !== undefined && rtt < 600)) {
          setStatus('weak');
          setLabel('Sinyal Lemah');
        } else {
          setStatus('bad');
          setLabel('Sinyal Buruk');
        }
      } else {
        setStatus('strong');
        setLabel('Online');
      }
    };

    updateStatus();

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
                      
    if (connection && connection.addEventListener) {
      connection.addEventListener('change', updateStatus);
    }

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      if (connection && connection.removeEventListener) {
        connection.removeEventListener('change', updateStatus);
      }
    };
  }, []);

  const colorClass = {
    strong: 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]',
    weak: 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]',
    bad: 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]',
    offline: 'bg-gray-400 grayscale shadow-none',
  }[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-2 w-2 items-center justify-center rounded-full bg-background ring-1 ring-border/30 shrink-0">
          <div className={cn(
            "h-full w-full rounded-full transition-all duration-700 ease-in-out", 
            colorClass,
            status === 'offline' ? "animate-pulse" : ""
          )} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[9px] font-black uppercase tracking-widest py-1 px-2 rounded-md border-none shadow-2xl bg-card text-foreground">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
