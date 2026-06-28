
'use client';

import Image from 'next/image';

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="relative animate-pulse">
        <Image
          src="/logo-3d-v2.png"
          alt="E-SPENLI"
          width={80}
          height={80}
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}
