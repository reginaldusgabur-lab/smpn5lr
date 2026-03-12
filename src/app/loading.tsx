import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function Loading() {
  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground gap-6">
      <div className="flex flex-col items-center gap-4">
        <Image
          src={appLogo?.imageUrl || "/logofix.png"}
          alt="Logo E-SPENLI"
          width={100}
          height={100}
          priority
          data-ai-hint={appLogo?.imageHint}
        />
        <div className="text-center">
            <h1 className="text-4xl font-bold tracking-wider">Absensi Online</h1>
            <p className="text-muted-foreground">SMPN 5 Langke Rembong</p>
        </div>
      </div>
    </div>
  );
}
