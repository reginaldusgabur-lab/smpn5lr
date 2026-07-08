'use server';
/**
 * @fileOverview Alur kerja untuk menghasilkan kutipan motivasi, humor sekolah, dan pantun harian menggunakan GenAI.
 * Memastikan output unik, kreatif, dan tidak repetitif.
 */

import { ai } from '../genkit';
import { z } from 'genkit';

const QuoteInputSchema = z.object({
  category: z.string().describe('Peran pengguna (kepala_sekolah, guru, pegawai, admin)'),
  attendanceType: z.enum(['in', 'out']).describe('Tipe absensi (in untuk masuk, out untuk pulang)'),
  seed: z.number().optional().describe('Nilai acak untuk memastikan variasi output'),
});

const QuoteOutputSchema = z.object({
  quote: z.string().describe('Teks motivasi, humor, atau pantun'),
  author: z.string().describe('Nama tokoh atau identitas kreatif (misal: "Tim Anti-Gosip", "Guru Senior")'),
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
      prompt: `Anda adalah asisten cerdas yang sangat kreatif untuk SMPN 5 Langke Rembong.
      Tugas Anda adalah memberikan SATU kutipan unik untuk pengguna dengan peran ${input.category} 
      yang baru saja absen ${input.attendanceType === 'in' ? 'MASUK / SELAMAT DATANG' : 'PULANG / SELESAI TUGAS'}.

      ATURAN KETAT:
      1. JANGAN PERNAH MENGGUNAKAN TEMPLATE. Setiap permintaan harus menghasilkan teks yang benar-benar baru.
      2. PILIH SALAH SATU GAYA BERIKUT SECARA ACAK (Gunakan seed ${input.seed || Math.random()} sebagai panduan variasi):
         - Pantun Jenaka (Khas Indonesia)
         - Humor sekolah (Tentang kopi, RPP, atau murid bandel)
         - Motivasi Pagi/Sore (Semangat kerja/istirahat)
         - Candaan guru (Misal: "RPP setebal kamus, gaji selembut tisu")
         - Candaan pegawai (Tentang berkas atau komputer)
         - Kutipan tokoh dunia yang relevan
         - Petuah lucu (Nasihat benar tapi bikin senyum)
         - Dialog singkat imajiner
         - Peribahasa modern (Plesetan peribahasa)
         - Sindiran halus (Misal: "Hindari gosip di ruang guru, lebih baik ngopi dulu")

      3. KONTEKS:
         - Jika absen MASUK: Berikan semangat, humor pagi, atau motivasi memulai hari.
         - Jika absen PULANG: Berikan apresiasi, humor tentang rumah, atau selamat istirahat.
      
      4. PANJANG TEKS: Maksimal 25 kata. Singkat, padat, dan nendang.
      5. NILAI ACAK (SEED): ${input.seed}. Berikan jawaban yang BERBEDA DRASTIS dari permintaan sebelumnya untuk menjamin keunikan.`,
      output: { schema: QuoteOutputSchema },
    });

    if (!output || !output.quote) {
      return {
        quote: input.attendanceType === 'in' ? "Satu cangkir kopi lebih baik daripada seribu gosip di koridor sekolah. Selamat bertugas!" : "Tugas tuntas, hati pun puas. Pulanglah, kasur sudah merindukan dedikasi Anda.",
        author: "Tim E-SPENLI"
      };
    }

    return output;
  }
);
