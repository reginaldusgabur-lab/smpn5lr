'use client';

import Image from 'next/image';

export default function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-[9999] min-h-screen w-full pointer-events-none">
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative w-32 h-32 animate-logo-pulse">
          <Image
            src="/logo-3d-v2.png"
            alt="E-SPENLI"
            fill
            className="object-contain"
            priority
            sizes="128px"
          />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <h2 className="text-2xl font-bold tracking-tight text-primary">E-SPENLI</h2>
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-40">Menyiapkan Sistem</p>
        </div>
      </div>
      <style jsx global>{`
        @keyframes pulse-custom {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        .animate-logo-pulse {
          animation: pulse-custom 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
