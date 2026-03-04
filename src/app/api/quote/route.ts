'''
// src/app/api/quote/route.ts
import { getQuote } from '@/ai/flows/quoteFlow';
import { NextRequest, NextResponse } from 'next/server';

// Pastikan Genkit diinisialisasi
import '@/ai/genkit';

export const dynamic = 'force-dynamic'; // Penting untuk Vercel

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  if (!category) {
    return NextResponse.json({ message: 'Category is required' }, { status: 400 });
  }

  try {
    const result = await getQuote({ category });
    
    if (result && result.quote) {
      // Menyesuaikan dengan format yang diharapkan komponen: { content, author }
      return NextResponse.json({ content: result.quote, author: 'AI' });
    } else {
      throw new Error('Failed to get a valid quote from the AI flow.');
    }
  } catch (error: any) {
    console.error(`Error in /api/quote: ${error.message}`);
    return NextResponse.json({ message: 'Failed to fetch quote', error: error.message }, { status: 500 });
  }
}
'''