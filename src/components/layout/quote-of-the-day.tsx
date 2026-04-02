import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface QuoteOfTheDayProps {
  category: string | null;
}

interface Quote {
  content: string;
  author: string;
}

const QuoteOfTheDay = ({ category }: QuoteOfTheDayProps) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const lastShown = localStorage.getItem('quoteLastShown');
        const today = new Date().toISOString().split('T')[0];
        if (lastShown === today) {
          return; // Jangan tampilkan jika sudah ditampilkan hari ini
        }

        const response = await fetch(`/api/quote?category=${category || 'default'}`);
        
        if (!response.ok) {
          // Coba parse JSON error dari backend
          const errorData = await response.json().catch(() => ({ error: 'Gagal mengambil data error dari server' }));
          // Gunakan pesan error dari backend jika ada, jika tidak, gunakan pesan default
          throw new Error(errorData.error || 'Gagal mengambil kutipan dari API');
        }

        const data = await response.json();
        if (data.content && data.author) {
          setQuote(data);
          localStorage.setItem('quoteLastShown', today);
        }
      } catch (e: any) {
        console.error('Error di dalam komponen QuoteOfTheDay:', e.message);
        setError(e.message);
      }
    };

    if (category) { // Hanya panggil jika kategori tersedia
        fetchQuote();
    }
  }, [category]);

  if (!quote && !error) {
    // Jangan tampilkan apa-apa selagi loading atau jika sudah ditampilkan hari ini
    return null;
  }

  if (error) {
    // Secara development, kita bisa tampilkan error di UI untuk debugging
    // Di production, mungkin lebih baik log saja tanpa merusak UI
    if (process.env.NODE_ENV === 'development') {
      return (
        <Card className="bg-red-100 border-red-500 text-red-900">
            <CardHeader>
                <CardTitle>Error Fetching Quote</CardTitle>
            </CardHeader>
            <CardContent>
                <p>{error}</p>
            </CardContent>
        </Card>
      )
    }
    return null; // Di production, sembunyikan saja jika error
  }

  return (
    <Card className="bg-green-50 border-green-200">
      <CardHeader>
        <CardTitle className="text-lg">Kutipan Hari Ini</CardTitle>
        <CardDescription>Semoga harimu menyenangkan!</CardDescription>
      </CardHeader>
      <CardContent>
        <blockquote className="italic text-gray-700">
          <p>"{quote?.content}"</p>
        </blockquote>
        <cite className="block text-right mt-2 text-gray-500">- {quote?.author}</cite>
      </CardContent>
    </Card>
  );
};

export default QuoteOfTheDay;
