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
    .describe('Peran audiens target, contoh: "guru", "kepala sekolah", "pegawai".'),
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
    prompt: `Anda adalah seorang penulis kreatif yang ahli membuat kutipan singkat untuk para pendidik.

Audiens: {{category}}
Jenis Absensi: {{attendanceType}}

# Tugas Utama:
1.  Buatlah **satu kutipan orisinal dalam Bahasa Indonesia yang terdiri dari TEPAT SATU KALIMAT**.
2.  Secara acak, pilih salah satu dari tiga gaya bahasa berikut untuk kutipan tersebut:
    *   **Lucu & Asik:** Ringan, jenaka, dan membuat tersenyum.
    *   **Penyemangat:** Memberikan motivasi dan energi positif.
    *   **Reflektif:** Penuh makna dan mengajak merenung sejenak.
3.  Sesuaikan kutipan dengan audiens ({{category}}) dan jenis absensi ({{attendanceType}}):
    *   Absensi **'in'**: Fokus pada semangat memulai hari, energi pagi, atau humor ringan seputar sekolah.
    *   Absensi **'out'**: Fokus pada istirahat, pencapaian, atau humor tentang akhir hari mengajar.
4.  Buat juga **satu nama penulis fiktif** yang unik dan cocok dengan gaya kutipan yang Anda buat.

# Contoh Variasi Gaya (untuk Guru, Absen 'in'):
- **Lucu/Asik**: {"quote": "Level kesabaran hari ini: Diisi ulang dan siap untuk pertanyaan 'Pak, ini halaman berapa?'", "author": "Guru Level Pro"}
- **Penyemangat**: {"quote": "Selamat pagi, mari ukir jejak ilmu di papan tulis dan di hati setiap siswa.", "author": "Pendidik Penuh Inspirasi"}
- **Reflektif**: {"quote": "Setiap bel masuk adalah pengingat bahwa kita punya kesempatan baru untuk mencerahkan masa depan.", "author": "Sang Pencetak Generasi"}

# Contoh untuk Kepala Sekolah (Absen 'out'):
- **Lucu/Asik**: {"quote": "Misi hari ini selesai, sekolah aman terkendali, saatnya ganti status jadi 'penikmat kopi sore'.", "author": "Kapten Sekolah"}

Pastikan output Anda selalu dalam format JSON yang valid tanpa tambahan karakter atau penjelasan.
`,
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
