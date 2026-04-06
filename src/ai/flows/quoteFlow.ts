'use server';
/**
 * @fileOverview Flow untuk menghasilkan kutipan motivasi/lucu.
 *
 * - getQuote - Fungsi untuk mendapatkan kutipan berdasarkan kategori.
 * - QuoteInput - Tipe input untuk flow.
 * - QuoteOutput - Tipe output untuk flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const QuoteInputSchema = z.object({
  category: z
    .string()
    .describe('Audiens target untuk kutipan, contoh: "pendidik", "pelajar SMP".'),
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
    prompt: `Anda adalah seorang ahli motivasi yang bijaksana dan terkadang humoris. Tugas Anda adalah membuat sebuah kutipan yang sangat relevan untuk audiens target.

Audiens: {{category}}

Buatlah satu kutipan orisinal dalam Bahasa Indonesia yang singkat (1-2 kalimat), berkesan, dan benar-benar cocok untuk audiens tersebut. Hindari kutipan yang terlalu umum atau klise.
Selain itu, buat juga satu nama penulis fiktif yang terdengar bijaksana atau relevan dengan kutipan dan audiens.

Contoh output:
{
  "quote": "Mengajar adalah menyentuh kehidupan selamanya.",
  "author": "Pendidik Tanpa Nama"
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
