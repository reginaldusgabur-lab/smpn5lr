
'use client';

import Image from 'next/image';

export default function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-[9999] h-screen w-full">
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative w-24 h-24 animate-logo-pulse">
          <Image
            src="/logo-3d-v2.png"
            alt="E-SPENLI"
            fill
            sizes="96px"
            className="object-contain"
            priority
          />
        </div>
      </div>
      <style jsx global>{`
        @keyframes pulse-custom {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .animate-logo-pulse {
          animation: pulse-custom 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
