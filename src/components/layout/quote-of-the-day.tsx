
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

interface QuoteOfTheDayProps {
  category: string | null | undefined;
  attendanceType: 'in' | 'out' | null;
}

interface Quote {
  quote: string;   // DIUBAH: dari content menjadi quote
  author: string;
}

const QuoteOfTheDay = ({ category, attendanceType }: QuoteOfTheDayProps) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Jangan lakukan apa-apa jika data penting tidak ada
    if (!category || !attendanceType) {
      setIsLoading(false);
      return;
    }

    const fetchQuote = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // DIUBAH: Menggunakan metode POST dengan body JSON
        const response = await fetch('/api/quote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            category: category,
            attendanceType: attendanceType,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error("API Error Response:", errorData);
          throw new Error(errorData.message || 'Gagal mengambil kutipan dari server.');
        }

        const data: Quote = await response.json();

        // DIUBAH: Validasi field `quote` dan `author`
        if (data.quote && data.author) {
          setQuote(data);
        } else {
          throw new Error('Respon API tidak mengandung kutipan yang valid.');
        }
      } catch (e: any) {
        console.error('Error fetching quote:', e.message);
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();

  }, [category, attendanceType]);

  // Render logic tetap sama, hanya variabel yang disesuaikan
  return (
    <div className="mt-6 pt-4 border-t border-current/20">
      <div className="flex items-center justify-center text-sm font-semibold mb-2">
        <Sparkles className="h-4 w-4 mr-2" />
        Kutipan Hari Ini
      </div>
      <div className="text-center text-sm min-h-[60px] flex items-center justify-center px-4">
        {isLoading && (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Memuat kutipan inspirasi...
          </div>
        )}
        {!isLoading && error && (
            <p className="text-destructive/80">Gagal memuat kutipan saat ini.</p>
        )}
        {!isLoading && !error && quote && (
          <div>
            <blockquote className="italic">
              <p>"{quote.quote}"</p>  // DIUBAH: dari quote.content menjadi quote.quote
            </blockquote>
            <cite className="block text-right mt-1 text-current/60">- {quote.author}</cite>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteOfTheDay;
