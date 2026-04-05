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
 *                 quote: 
 *                   type: string
 *                   example: "Pendidikan adalah kunci untuk membuka potensi tak terbatas dalam setiap siswa."
 *       500:
 *         description: Terjadi kesalahan pada server.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Menjalankan flow AI untuk mendapatkan kutipan dengan kategori spesifik.
    // Kategori "pendidik dan tenaga kependidikan" dipilih karena relevan untuk semua pengguna aplikasi ini (guru, admin, dll).
    const response = await getQuote({ category: 'pendidik dan tenaga kependidikan' });

    // Memastikan output dari AI sesuai dengan skema yang diharapkan.
    const QuoteOutputSchema = z.object({
      quote: z.string(),
    });
    
    const parsedResponse = QuoteOutputSchema.parse(response);

    return NextResponse.json(parsedResponse);
  } catch (error) {
    console.error("[API_QUOTE_ERROR]", error);

    // Jika terjadi error (misal: API key tidak valid, error jaringan), kirim response error.
    return new NextResponse('Gagal menghasilkan kutipan.', { status: 500 });
  }
}
