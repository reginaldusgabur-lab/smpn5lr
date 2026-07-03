'use client';

export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-[9999] w-full h-full pointer-events-none">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
        <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
      </div>
    </div>
  );
}
