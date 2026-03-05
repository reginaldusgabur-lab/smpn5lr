'use client';

import { useState, useEffect } from 'react';

interface Quote {
  content: string;
  author: string;
}

interface UseQuoteProps {
  category: string | null | undefined;
  enabled?: boolean; // Keep this to control execution
}

export function useQuote({ category, enabled = true }: UseQuoteProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't run if not enabled
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // Don't run if no category is provided
    if (!category) {
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
        } else {
          // Handle case where API returns a 200 but no quote
          setQuote(null);
        }
      } catch (e: any) {
        console.error("Error fetching quote:", e);
        setError(e.message || 'Gagal mengambil kutipan');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [category, enabled]);

  return { quote, isLoading, error };
}
