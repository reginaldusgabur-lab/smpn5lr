import React from 'react';

export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {children}
    </div>
  );
}
