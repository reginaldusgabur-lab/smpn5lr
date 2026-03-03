'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, X } from 'lucide-react';

interface Quote {
  content: string;
  author: string;
}

// Komponen sekarang menerima `category` sebagai sebuah properti (prop)
export function QuoteOfTheDay({ category }: { category: string | null | undefined }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Jangan lakukan apa-apa jika category belum siap
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
      try {
        // Gunakan category yang diterima dari prop untuk membuat request
        const response = await fetch(`/api/quote?category=${category}`);
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
      } catch (error) {
        console.error("Error fetching quote:", error);
        setIsVisible(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [category]); // Efek ini hanya akan berjalan jika `category` berubah

  if (isLoading || !isVisible || !quote) {
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
