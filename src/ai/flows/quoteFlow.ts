'use server';
/**
 * @fileOverview Flow untuk menghasilkan kutipan motivasi/lucu.
 *
 * - getQuote - Fungsi untuk mendapatkan kutipan berdasarkan kategori dan jenis absensi.
 * - QuoteInput - Tipe input untuk flow.
 * - QuoteOutput - Tipe output untuk flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const QuoteInputSchema = z.object({
  category: z
    .string()
    .describe('Audiens target untuk kutipan, contoh: "pendidik", "pelajar SMP".'),
  attendanceType: z
    .enum(['in', 'out'])
    .describe('Jenis absensi: "in" untuk masuk, "out" untuk pulang.'),
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

const QuoteOutputSchema = z.object({
  quote: z
    .string()
    .describe('Teks kutipan yang dihasilkan.'),
  author: z
    .string()
    .describe('Nama penulis fiktif yang sesuai dengan konteks kutipan.'),
});
export type QuoteOutput = z.infer<typeof QuoteOutputSchema>;

export async function getQuote(input: QuoteInput): Promise<QuoteOutput> {
  return quoteFlow(input);
}

const quotePrompt = ai.definePrompt(
  {
    name: 'quotePrompt',
    input: { schema: QuoteInputSchema },
    output: { schema: QuoteOutputSchema },
    prompt: `Anda adalah seorang ahli motivasi yang bijaksana dan terkadang humoris. Tugas Anda adalah membuat sebuah kutipan yang sangat relevan untuk audiens target berdasarkan waktu absensi mereka.

Audiens: {{category}}
Jenis Absensi: {{attendanceType}}

# Tugas:
1.  Buatlah satu kutipan orisinal dalam Bahasa Indonesia yang singkat (1-2 kalimat) dan berkesan.
2.  Kutipan harus benar-benar cocok untuk audiens dan jenis absensi:
    - Jika jenis absensi adalah "in" (masuk), buatlah kutipan yang penuh semangat, motivasi untuk memulai hari, atau inspirasi pagi.
    - Jika jenis absensi adalah "out" (pulang), buatlah kutipan yang reflektif, tentang istirahat, pencapaian hari ini, atau motivasi untuk esok hari.
3.  Hindari kutipan yang terlalu umum atau klise.
4.  Selain itu, buat juga satu nama penulis fiktif yang terdengar bijaksana atau relevan dengan kutipan dan audiens.

Contoh output untuk absensi "in":
{
  "quote": "Pagi ini, mari kita tanam benih ilmu dengan senyuman.",
  "author": "Pendidik Penuh Semangat"
}

Contoh output untuk absensi "out":
{
  "quote": "Pelajaran hari ini telah usai, biarkan ia menjadi bekal untuk esok.",
  "author": "Sang Pengajar Senja"
}

Jangan gunakan tanda kutip di awal dan akhir properti JSON atau isinya.`
  },
);

const quoteFlow = ai.defineFlow(
  {
    name: 'quoteFlow',
    inputSchema: QuoteInputSchema,
    outputSchema: QuoteOutputSchema,
  },
  async (input) => {    
    const { output } = await quotePrompt(input);
    return output!;
  }
);
