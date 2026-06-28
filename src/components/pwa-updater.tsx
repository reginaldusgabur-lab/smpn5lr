
"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Sparkles } from 'lucide-react';

/**
 * PwaUpdater mendeteksi jika Service Worker baru telah terinstal dan menunggu untuk diaktifkan.
 * Memberikan prompt kepada pengguna untuk memuat ulang aplikasi agar logo dan aset terbaru diterapkan.
 */
const PwaUpdater = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const sw = navigator.serviceWorker;

      // Event ini terpicu saat SW baru mengambil alih kontrol
      sw.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      const checkUpdate = async () => {
        const registration = await sw.getRegistration();
        if (registration) {
          // Listen untuk event updatefound
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                // Jika SW baru sudah terinstal (installed) dan ada SW lama yang sedang berjalan (controller)
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
  }, []);

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          // Kirim pesan ke SW baru untuk melompati fase waiting (skipWaiting)
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            window.location.reload();
        }
      });
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 z-[110] animate-in fade-in slide-in-from-top-10 duration-700">
      <div className="bg-primary text-primary-foreground border border-white/20 shadow-2xl rounded-2xl p-4 flex items-center gap-4 max-w-md ml-auto backdrop-blur-md">
        <div className="bg-white/20 p-2.5 rounded-xl shrink-0">
            <RefreshCw className="h-5 w-5 animate-spin" style={{ animationDuration: '3s' }} />
        </div>
        
        <div className="flex-1 min-w-0">
            <h4 className="text-sm font-black tracking-tight flex items-center gap-1.5">
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
            className="h-9 px-4 rounded-xl font-bold text-[11px] shadow-lg active:scale-95 transition-all"
        >
            Perbarui
        </Button>
      </div>
    </div>
  );
};

export default PwaUpdater;
