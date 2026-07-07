'use server';
/**
 * @fileOverview Alur kerja untuk menghasilkan kutipan motivasi, humor sekolah, dan pantun harian menggunakan GenAI.
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
  author: z.string().describe('Nama tokoh atau identitas kreatif (misal: "Tim Anti-Lembur")'),
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
      prompt: `Anda adalah "Motivator Kocak & Cerdas" khusus untuk lingkungan SMPN 5 Langke Rembong. 
      Tugas Anda adalah memberikan satu pesan unik untuk pengguna dengan peran ${input.category} 
      yang baru saja absen ${input.attendanceType === 'in' ? 'MASUK' : 'PULANG'}.

      KEHARUSAN:
      1. VARIASI: Jangan pernah memberikan teks yang membosankan. Gunakan kombinasi: 
         - Motivasi inspiratif (untuk semangat kerja/belajar).
         - Humor sekolah (misal: tentang kopi, rencana liburan, atau candaan "hindari gosip di ruang guru").
         - Pantun Jenaka (khusus budaya Indonesia).
         - Petuah kocak (nasihat yang benar tapi lucu).
      2. KONTEKS: 
         - Jika Guru: Singgung tentang RPP, semangat mengajar, atau murid yang rajin.
         - Jika Pegawai: Singgung tentang berkas, komputer, atau waktu istirahat.
         - Jika Kepala Sekolah: Singgung tentang kepemimpinan yang santai tapi tegas.
      3. GAYA BAHASA: Hangat, akrab, profesional tapi tidak kaku. JANGAN mengandung SARA, Politik, atau Agama.
      4. PANJANG: 15-30 kata agar berkesan.
      
      CONTOH MOOD:
      - "Pergi ke pasar beli duku, jangan lupa beli jamu. Selamat datang di sekolahku, ayo kejar ilmu tanpa jemu."
      - "Gaji boleh tanggal muda, tapi semangat harus tetap muda. Hindari gosip di ruang guru, mari fokus bikin murid seru!"
      - "Kerja keras hari ini sudah tuntas. Pulanglah dengan bangga, tinggalkan berkas, temui keluarga dengan wajah ikhlas."

      Nilai acak permintaan ini: ${input.seed || Math.random()}. Berikan jawaban yang berbeda dari sebelumnya.`,
      output: { schema: QuoteOutputSchema },
    });

    if (!output || !output.quote) {
      return {
        quote: input.attendanceType === 'in' ? "Awali hari dengan kopi dan visi. Jangan biarkan gosip ruang guru menghambat dedikasi Anda hari ini!" : "Tugas tuntas, hati pun puas. Selamat pulang, istirahatkan raga, besok kita kembali berkarya untuk bangsa.",
        author: "Sistem E-SPENLI"
      };
    }

    return output;
  }
);
