'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

    const today = new Date().toDateString();
    const lastShown = localStorage.getItem('quoteLastShown');

    if (lastShown === today) {
      setIsLoading(false);
      return;
    }

    const fetchQuote = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/quote?category=${encodeURIComponent(category)}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Gagal mengambil kutipan' }));
          throw new Error(errorData.message || 'Gagal mengambil kutipan');
        }
        const data = await response.json();
        if (data.content && data.author) {
            setQuote({ content: data.content, author: data.author });
            setIsVisible(true);
            localStorage.setItem('quoteLastShown', today);
        } else {
            setIsVisible(false);
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
            <p className="font-medium text-red-900 dark:text-red-200">Info: {error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!isVisible || !quote) {
    return null;
  }

  return (
    <Card className="mb-6 relative group">
         <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsVisible(false)}
        >
            <X className="h-4 w-4" />
            <span className="sr-only">Tutup kutipan</span>
        </Button>
        <CardContent className="p-4">
            <blockquote className="text-center italic text-sm text-muted-foreground">
            &ldquo;{quote.content}&rdquo;
            <footer className="mt-2 text-xs not-italic text-right">~ {quote.author}</footer>
            </blockquote>
        </CardContent>
    </Card>
  );
}
