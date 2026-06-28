
"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Sparkles } from 'lucide-react';

/**
 * PwaUpdater mendeteksi jika Service Worker baru (versi logo/manifest baru) tersedia.
 * Saat diklik, notifikasi langsung hilang dan pembaruan berjalan di latar belakang.
 */
const PwaUpdater = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const sw = navigator.serviceWorker;

      // Event ini terpicu saat SW baru mengambil alih kontrol (setelah skipWaiting)
      sw.addEventListener('controllerchange', () => {
        // Melakukan reload hanya jika sudah dipicu oleh tombol
        if (isHiding) {
            window.location.reload();
        }
      });

      const checkUpdate = async () => {
        const registration = await sw.getRegistration();
        if (registration) {
          // Listen untuk event updatefound
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                // Jika SW baru sudah terinstal dan ada SW lama yang sedang berjalan
                if (newWorker.state === 'installed' && sw.controller) {
                  setUpdateAvailable(true);
                }
              });
            }
          });

          // Cek juga saat load apakah sudah ada yang waiting
          if (registration.waiting) {
            setUpdateAvailable(true);
          }
        }
      };

      checkUpdate();
    }
  }, [isHiding]);

  const handleUpdate = () => {
    // Langsung sembunyikan UI agar terasa "berjalan di latar belakang"
    setIsHiding(true);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          // Kirim pesan ke SW baru untuk melompati fase waiting (skipWaiting)
          // Ini akan memastikan manifest dan logo baru diterapkan
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            // Jika tidak ada yang waiting, tetap reload untuk memastikan aset segar
            window.location.reload();
        }
      });
    }
  };

  // Jangan tampilkan jika tidak ada update, atau sedang diproses di latar belakang
  if (!updateAvailable || isHiding) return null;

  return (
    <div className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 z-[110] animate-in fade-in slide-in-from-top-10 duration-700">
      <div className="bg-primary text-primary-foreground border border-white/20 shadow-2xl rounded-3xl p-4 flex items-center gap-4 max-w-md ml-auto backdrop-blur-md">
        <div className="bg-white/20 p-2.5 rounded-2xl shrink-0">
            <RefreshCw className="h-5 w-5 animate-spin" style={{ animationDuration: '3s' }} />
        </div>
        
        <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                Versi Baru Tersedia
                <Sparkles className="h-3 w-3 text-amber-300" />
            </h4>
            <p className="text-[10px] opacity-90 font-medium leading-tight mt-0.5">
                Pembaruan sistem dan logo telah siap. Klik perbarui untuk sinkronisasi.
            </p>
        </div>

        <Button 
            onClick={handleUpdate} 
            size="sm"
            variant="secondary"
            className="h-9 px-5 rounded-xl font-bold text-[11px] shadow-lg active:scale-95 transition-all"
        >
            Perbarui
        </Button>
      </div>
    </div>
  );
};

export default PwaUpdater;
