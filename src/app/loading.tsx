import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function Loading() {
  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground gap-6">
      
    </div>
  );
}
