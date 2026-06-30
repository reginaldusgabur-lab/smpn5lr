'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, Sparkles, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuoteOfTheDayProps {
  category: string | null | undefined;
  attendanceType: 'in' | 'out' | null;
}

interface Quote {
  quote: string;
  author: string;
}

const QuoteOfTheDay = ({ category, attendanceType }: QuoteOfTheDayProps) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const isFetched = useRef(false);

  useEffect(() => {
    if (!category || !attendanceType || isFetched.current) {
      if (!category || !attendanceType) setIsLoading(false);
      return;
    }

    const fetchQuote = async () => {
      setIsLoading(true);
      setError(false);
      isFetched.current = true;
      try {
        const response = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, attendanceType }),
        });
        
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        if (data.quote) setQuote(data);
      } catch (e: any) {
        setError(true);
        setQuote({
          quote: attendanceType === 'in' ? "Awali hari dengan bismillah dan senyuman, karena kopi saja tidak cukup untuk menjaga semangat." : "Kerja kerasmu hari ini luar biasa. Sekarang waktunya istirahat dan berkumpul dengan keluarga.",
          author: "Tim E-SPENLI"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuote();
  }, [category, attendanceType]);

  const isNews = quote?.author.toLowerCase().includes('news') || 
                 quote?.author.toLowerCase().includes('info') || 
                 quote?.author.toLowerCase().includes('viral');

  return (
    <div className="mt-6 pt-5 border-t border-primary/10">
      <div className="flex items-center justify-center text-[10px] font-bold mb-4 text-primary/60 uppercase tracking-[0.2em]">
        {isNews ? <Newspaper className="h-3.5 w-3.5 mr-2" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
        Pesan Spesial Hari Ini
      </div>
      
      <div className="text-center min-h-[70px] flex items-center justify-center px-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Menyiapkan inspirasi...</span>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-1000 ease-out w-full">
            <div className={cn("relative px-4 py-2", isNews ? "bg-primary/5 rounded-xl border border-primary/5" : "")}>
              <blockquote className={cn("font-bold text-sm text-foreground/90 leading-relaxed", !isNews && "italic")}>
                "{quote?.quote}"
              </blockquote>
              <cite className="block text-right mt-2 text-[10px] font-black text-primary/70 not-italic uppercase">
                — {quote?.author}
              </cite>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteOfTheDay;
