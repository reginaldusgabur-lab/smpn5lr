'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

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
          quote: attendanceType === 'in' ? "Awali hari dengan semangat dan senyuman, karena energi positif Anda adalah penggerak utama kemajuan sekolah kita hari ini." : "Terima kasih atas dedikasi dan kerja keras Anda hari ini. Selamat beristirahat dengan tenang bersama keluarga tercinta.",
          author: "Sistem E-SPENLI"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuote();
  }, [category, attendanceType]);

  return (
    <div className="mt-2 pt-4 border-t border-white/5">
      <div className="flex items-center justify-center text-[10px] font-bold mb-3 text-white/40 uppercase tracking-[0.2em]">
        <Sparkles className="h-3 w-3 mr-2" />
        Kutipan Hari Ini
      </div>
      
      <div className="text-center min-h-[60px] flex items-center justify-center px-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-white/20">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Inspirasi...</span>
          </div>
        ) : error && !quote ? (
           <p className="text-white/20 text-[11px] italic font-bold">Tetap semangat hari ini!</p>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-1000 ease-out w-full">
            <blockquote className="font-bold text-[13px] text-white/90 leading-relaxed italic">
              "{quote?.quote}"
            </blockquote>
            <cite className="block text-right mt-2 text-[9px] font-bold text-white/30 not-italic">
              - {quote?.author || 'Tim E-SPENLI'}
            </cite>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteOfTheDay;
