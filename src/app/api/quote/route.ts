import { NextResponse } from 'next/server';
import { getQuote } from '@/ai/flows/quoteFlow';
import { z } from 'zod';

/**
 * @swagger
 * /api/quote:
 *   get:
 *     summary: Mendapatkan kutipan motivasi.
 *     description: Mengambil kutipan motivasi yang dihasilkan AI untuk pendidik.
 *     responses:
 *       200:
 *         description: Sukses mendapatkan kutipan.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   example: "Pendidikan adalah kunci untuk membuka potensi tak terbatas dalam setiap siswa."
 *                 author:
 *                   type: string
 *                   example: "Seorang Guru Bijak"
 *       500:
 *         description: Terjadi kesalahan pada server.
 */

export const dynamic = 'force-dynamic';

const QuoteApiResponseSchema = z.object({
  content: z.string(),
  author: z.string(),
});

export async function GET() {
  try {
    const aiResponse = await getQuote({ category: 'pendidik dan tenaga kependidikan' });

    const parsedResponse = {
      content: aiResponse.quote,
      author: aiResponse.author,
    };

    // Validasi akhir sebelum mengirim ke klien
    QuoteApiResponseSchema.parse(parsedResponse);

    return NextResponse.json(parsedResponse);
  } catch (error) {
    console.error("[API_QUOTE_ERROR]", error);
    return new NextResponse('Gagal menghasilkan kutipan.', { status: 500 });
  }
}
