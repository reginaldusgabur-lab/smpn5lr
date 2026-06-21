
import { NextResponse, NextRequest } from 'next/server';
import { genkit, z } from 'genkit'; // IMPOR YANG BENAR
import { googleAI } from '@genkit-ai/google-genai';
import { defineFlow, renderPrompt } from 'genkit/flow';

// Memberitahu Next.js untuk selalu menjalankan rute ini secara dinamis
export const dynamic = 'force-dynamic';

// 1. Inisialisasi Genkit AI langsung di dalam file rute API
// Ini adalah cara yang BENAR untuk mengonfigurasi Genkit dan memastikan ini hanya berjalan di server.
const ai = genkit({
  plugins: [googleAI()], // Menggunakan plugin Google AI
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});

// 2. Definisikan Skema Input dan Output yang Jelas
const QuoteInputSchema = z.object({
  category: z.string().describe('Peran audiens target'),
  attendanceType: z.enum(['in', 'out']).describe('Jenis absensi'),
});

const QuoteOutputSchema = z.object({
  quote: z.string().describe('Teks kutipan yang dihasilkan.'),
  author: z.string().describe('Nama penulis fiktif.'),
});

// 3. Definisikan Prompt
const quotePrompt = `Anda adalah seorang penulis kreatif yang ahli membuat kutipan singkat untuk para pendidik.

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

Pastikan output Anda selalu dalam format JSON yang valid tanpa tambahan karakter atau penjelasan.`;


// 4. Definisikan Flow Langsung di Dalam Rute
const quoteFlow = defineFlow(
  {
    name: 'quoteApiFlow',
    inputSchema: QuoteInputSchema,
    outputSchema: QuoteOutputSchema,
  },
  async (input) => {
    const prompt = await renderPrompt({ prompt: quotePrompt, input });

    const llmResponse = await ai.generate({ // PANGGILAN GENERATE YANG BENAR
      model: googleAI.model('gemini-1.5-flash-latest'),
      prompt: prompt,
      output: {
        schema: QuoteOutputSchema,
        format: 'json',
      },
      config: {
        temperature: 1.0,
      },
    });

    const output = llmResponse.output();
    if (!output) {
      throw new Error("Gagal mendapatkan output dari model AI.");
    }
    return output;
  }
);


// 5. Handler GET Utama yang Sudah Diperbaiki
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'pendidik';
    const attendanceType = searchParams.get('attendanceType');

    const validation = QuoteInputSchema.safeParse({ category, attendanceType });
    if (!validation.success) {
      return new NextResponse(
        JSON.stringify({
          message: 'Parameter tidak valid.',
          issues: validation.error.issues,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await quoteFlow.run(validation.data);

    return NextResponse.json(aiResponse);

  } catch (error) {
    console.error("[API_QUOTE_ERROR]", error);
    const errorMessage = error instanceof Error ? error.message : 'Gagal menghasilkan kutipan.';
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
