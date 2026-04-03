'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

interface QuoteOfTheDayProps {
  category: string | null | undefined;
}

interface Quote {
  content: string;
  author: string;
}

const QuoteOfTheDay = ({ category }: QuoteOfTheDayProps) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/quote?category=${category || 'default'}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Server tidak memberikan respon error yang valid.' }));
          throw new Error(errorData.error || 'Gagal mengambil kutipan.');
        }

        const data = await response.json();
        if (data.content && data.author) {
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

  }, [category]);

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
        {!isLoading && quote && (
          <div>
            <blockquote className="italic">
              <p>"{quote.content}"</p>
            </blockquote>
            <cite className="block text-right mt-1 text-current/60">- {quote.author}</cite>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteOfTheDay;
