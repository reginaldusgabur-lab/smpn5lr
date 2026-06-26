'''
import { getQuote, QuoteInput } from '@/ai/flows/quoteFlow';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Skema validasi yang sama dengan di quoteFlow untuk memastikan konsistensi
const QuoteAPISchema = z.object({
  category: z.string().min(1, "Kategori tidak boleh kosong"),
  attendanceType: z.enum(['in', 'out']),
});

export async function POST(request: NextRequest) {
  console.log('\n--- [START] Memulai POST request ke /api/quote ---');
  let requestBody;

  try {
    // Langkah 1 & 4: Membaca dan me-log request body
    requestBody = await request.json();
    console.log('[INFO] Request body diterima:', requestBody);

    // Langkah 2 & 6: Validasi input dengan Zod. Jika gagal, error akan dilempar dan ditangkap oleh blok catch.
    const validatedInput: QuoteInput = QuoteAPISchema.parse(requestBody);
    console.log('[INFO] Input berhasil divalidasi.');

    // Langkah 3 & 5: Memanggil flow dengan input yang sudah divalidasi (dijamin bukan undefined/kosong)
    console.log('[INFO] Memanggil fungsi getQuote dengan input:', validatedInput);
    const quote = await getQuote(validatedInput);
    console.log('[SUCCESS] Fungsi getQuote berhasil mengembalikan hasil.');

    if (!quote || !quote.quote) {
      console.error('[ERROR] Kutipan yang dihasilkan AI kosong atau tidak valid setelah diproses.');
      throw new Error('Kutipan yang dihasilkan kosong atau tidak valid.');
    }

    console.log('[INFO] Mengirim kutipan yang berhasil ke klien...');
    return NextResponse.json(quote);

  } catch (error) {
    // Menangani semua jenis error (parsing JSON, validasi Zod, atau error dari AI)
    console.error('\n--- !!! TERJADI ERROR DI /api/quote !!! ---');
    
    if (error instanceof z.ZodError) {
      console.error('[VALIDATION_ERROR] Request body tidak valid:', error.errors);
      return new NextResponse(JSON.stringify({ message: "Input tidak valid", details: error.errors }), {
        status: 400, // HTTP 400 Bad Request
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (error instanceof SyntaxError) {
        console.error('[JSON_PARSE_ERROR] Gagal mem-parsing JSON dari request body:', error.message);
        return new NextResponse(JSON.stringify({ message: "Format JSON pada request body salah." }), {
            status: 400, 
            headers: { 'Content-Type': 'application/json' },
        });
    }

    console.error('\n[PESAN ERROR ASLI DARI SERVER]:', error);
    console.error('\n------------------------------------------\n');
    
    // Fallback untuk error lainnya (misalnya dari Genkit/AI)
    return new NextResponse(JSON.stringify({ message: 'Gagal menghasilkan kutipan di server' }), {
      status: 500, // HTTP 500 Internal Server Error
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

'''