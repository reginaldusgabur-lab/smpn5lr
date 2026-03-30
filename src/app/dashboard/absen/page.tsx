
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const AbsenPageClient = dynamic(
  () => import('./AbsenPageClient'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-80px)] w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    ),
  }
);

export default function AbsenPage() {
  return <AbsenPageClient />;
}
