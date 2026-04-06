import { NextResponse, NextRequest } from 'next/server';
import { getQuote } from '@/ai/flows/quoteFlow';
import { z } from 'zod';

// Memberitahu Next.js dan Vercel untuk selalu menjalankan rute ini secara dinamis
export const dynamic = 'force-dynamic';

const QuoteApiResponseSchema = z.object({
  content: z.string(),
  author: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'pendidik';
    const attendanceType = searchParams.get('attendanceType');

    // Validasi input
    if (attendanceType !== 'in' && attendanceType !== 'out') {
      return new NextResponse('Parameter attendanceType tidak valid. Harus \'in\' atau \'out\'.', { status: 400 });
    }

    const aiResponse = await getQuote({ 
      category: category, 
      attendanceType: attendanceType 
    });

    const parsedResponse = {
      content: aiResponse.quote,
      author: aiResponse.author,
    };

    // Validasi akhir sebelum mengirim ke klien
    QuoteApiResponseSchema.parse(parsedResponse);

    return NextResponse.json(parsedResponse);
  } catch (error) {
    console.error("[API_QUOTE_ERROR]", error);
    // Periksa apakah error adalah dari Zod validation
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify({ message: 'Struktur output AI tidak valid.', issues: error.issues }), { status: 500 });
    }
    return new NextResponse('Gagal menghasilkan kutipan.', { status: 500 });
  }
}
