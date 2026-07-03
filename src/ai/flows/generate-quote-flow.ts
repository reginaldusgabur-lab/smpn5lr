'use server';
/**
 * @fileOverview Alur kerja untuk menghasilkan kutipan motivasi dan humor harian menggunakan GenAI.
 */

import { ai } from '../genkit';
import { z } from 'genkit';

const QuoteInputSchema = z.object({
  category: z.string().describe('Peran pengguna (kepala_sekolah, guru, pegawai, admin)'),
  attendanceType: z.enum(['in', 'out']).describe('Tipe absensi (in untuk masuk, out untuk pulang)'),
});

const QuoteOutputSchema = z.object({
  quote: z.string().describe('Kalimat motivasi atau humor pendek'),
  author: z.string().describe('Nama tokoh, sebutan tim, atau sumber berita fiktif'),
});

export async function generateQuote(input: z.infer<typeof QuoteInputSchema>) {
  return generateQuoteFlow(input);
}

const generateQuoteFlow = ai.defineFlow(
  {
    name: 'generateQuoteFlow',
    inputSchema: QuoteInputSchema,
    outputSchema: QuoteOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: `Anda adalah motivator cerdas untuk lingkungan SMPN 5 Langke Rembong. 
      Berikan satu kutipan unik dalam Bahasa Indonesia untuk seseorang dengan peran ${input.category} 
      yang baru saja melakukan absen ${input.attendanceType === 'in' ? 'MASUK (Pagi hari)' : 'PULANG (Sore hari)'}.

      KETENTUAN KONTEN:
      1. PANJANG TEKS: Buatlah kalimat yang sedikit lebih panjang dan mengalir (antara 15 sampai 25 kata) agar memberikan kesan mendalam.
      2. TEMA: Motivasi pendidikan, inspirasi harian, apresiasi kinerja, atau humor ringan tentang semangat sekolah.
      3. GAYA: Inspiratif, hangat, dan profesional. JANGAN mengandung unsur SARA atau Politik.
      4. NETRALITAS: JANGAN mengandung unsur agama atau istilah keagamaan tertentu. Gunakan bahasa universal.
      5. KONTEKS:
         - Jika MASUK: Berikan energi positif untuk mengajar/bekerja hari ini.
         - Jika PULANG: Berikan apresiasi atas dedikasi dan waktu untuk beristirahat.

      Berikan output yang bervariasi setiap kali diminta.`,
      output: { schema: QuoteOutputSchema },
    });

    if (!output || !output.quote) {
      return {
        quote: input.attendanceType === 'in' ? "Awali hari dengan semangat dan senyuman, karena energi positif Anda adalah penggerak utama kemajuan sekolah kita hari ini." : "Terima kasih atas dedikasi dan kerja keras Anda hari ini. Selamat beristirahat dengan tenang bersama keluarga tercinta.",
        author: "Sistem E-SPENLI"
      };
    }

    return output;
  }
);
