'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, X } from 'lucide-react';
import { getQuote, type QuoteOutput } from '@/ai/flows/quoteFlow';

interface Quote {
  content: string;
  author: string;
}

export function QuoteOfTheDay({ category }: { category: string | null | undefined }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!category) {
      setIsLoading(false);
      return;
    }

    const lastShown = localStorage.getItem('quoteLastShown');
    const today = new Date().toISOString().split('T')[0];

    if (lastShown === today) {
      setIsLoading(false);
      return;
    }

    const fetchQuote = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const quoteResult: QuoteOutput = await getQuote({ category });
        if (quoteResult && quoteResult.quote) {
          // Assuming the author is the AI for now
          setQuote({ content: quoteResult.quote, author: 'AI' });
          setIsVisible(true);
          localStorage.setItem('quoteLastShown', today);
        } else {
          throw new Error('Gagal mendapatkan kutipan dari flow');
        }
      } catch (e: any) {
        console.error("Error fetching quote:", e);
        setError(e.message || 'Gagal mengambil kutipan');
        setIsVisible(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [category]);

  if (isLoading) {
    return null; // Atau tampilkan skeleton loader
  }

  if (error) {
    return (
      <Card className="mb-6 relative bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800">
        <CardContent className="p-4">
            <p className="font-medium text-red-900 dark:text-red-200">Error: {error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!isVisible || !quote) {
    return null;
  }

  return (
    <Card className="mb-6 relative bg-sky-50 border-sky-200 dark:bg-sky-950/50 dark:border-sky-800">
      <CardContent className="p-4">
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200"
          aria-label="Tutup kutipan"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-1 flex-shrink-0" />
          <div>
            <p className="font-medium text-sky-900 dark:text-sky-200">
              \"{quote.content}\"
            </p>
            <footer className="text-xs text-sky-700 dark:text-sky-500 mt-1">- {quote.author}</footer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
