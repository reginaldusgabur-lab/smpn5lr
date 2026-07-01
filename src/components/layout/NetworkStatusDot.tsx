'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Komponen titik indikator status jaringan.
 * Memantau koneksi internet secara real-time dan memberikan feedback warna:
 * Hijau (Kuat), Kuning (Lemah), Merah (Buruk), Abu-abu (Offline).
 */
export function NetworkStatusDot() {
  const [status, setStatus] = useState<'strong' | 'weak' | 'bad' | 'offline'>('strong');
  const [label, setLabel] = useState('Sinyal Kuat');

  useEffect(() => {
    const updateStatus = () => {
      // 1. Cek apakah perangkat sedang offline sepenuhnya
      if (!navigator.onLine) {
        setStatus('offline');
        setLabel('Offline');
        return;
      }

      // 2. Cek API Network Information (didukung di Chrome, Edge, Android)
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;
      
      if (connection) {
        const { effectiveType, rtt } = connection;
        
        // Penentuan kualitas berdasarkan tipe jaringan dan estimasi latensi (RTT)
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
        // Fallback untuk browser yang tidak mendukung API Network (seperti Safari)
        setStatus('strong');
        setLabel('Online');
      }
    };

    // Jalankan pengecekan saat komponen dimuat
    updateStatus();

    // Pasang listener untuk event online/offline
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    // Pasang listener untuk perubahan kualitas jaringan (jika API didukung)
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

  // Definisi warna dan shadow berdasarkan status
  const colorClass = {
    strong: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]',
    weak: 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]',
    bad: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    offline: 'bg-gray-400 grayscale shadow-none',
  }[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-3 w-3 items-center justify-center rounded-full bg-background ring-1 ring-border/50 shrink-0">
          <div className={cn(
            "h-full w-full rounded-full transition-all duration-700 ease-in-out", 
            colorClass,
            status === 'offline' ? "animate-pulse" : ""
          )} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-lg border-none shadow-2xl bg-card text-foreground">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
