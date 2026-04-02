import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi GoogleGenerativeAI dengan kunci API dari environment variables
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// Helper untuk membuat prompt yang lebih bervariasi dan spesifik berdasarkan peran
function getPromptForCategory(category: string | null): string {
  // Pilih tema secara acak: motivasi atau lucu
  const themes = {
    motivasi: 'motivasi yang inspiratif dan kuat',
    lucu: 'lelucon singkat atau kutipan jenaka yang relevan'
  };
  const randomTheme = Math.random() < 0.7 ? themes.motivasi : themes.lucu; // 70% motivasi, 30% lucu

  const baseInstruction = `Tolong berikan satu ${randomTheme}. Kutipan harus singkat (sekitar 100-150 karakter). Langsung berikan kutipannya dalam format: \"Isi Kutipan\" - Nama Tokoh atau Sumber. Jangan tambahkan teks pembuka atau judul.`;

  let personaAndContext = '';

  switch (category) {
    case 'siswa':
      personaAndContext = 'Anda adalah seorang mentor gaul yang memahami kehidupan siswa SMP. Buat kutipan yang cocok untuk mereka, bisa tentang semangat belajar, pertemanan, atau candaan sekolah.';
      break;
    case 'guru':
    case 'pegawai':
      personaAndContext = 'Anda adalah seorang rekan kerja yang bijak dan humoris di lingkungan sekolah. Buat kutipan yang relevan untuk seorang guru atau pegawai, bisa tentang semangat mengajar, kesabaran, atau lelucon tentang kopi dan rapat.';
      break;
    case 'kepala-sekolah':
    case 'admin':
      personaAndContext = 'Anda adalah seorang penasihat berpengalaman untuk para pemimpin pendidikan. Buat kutipan yang berwibawa namun tetap menyentuh, bisa tentang kepemimpinan, dampak pendidikan, atau humor bijak tentang tanggung jawab besar.';
      break;
    default:
      personaAndContext = 'Anda adalah seorang motivator ulung. Buat kutipan umum tentang semangat, produktivitas, dan pengembangan diri.';
      break;
  }

  return `${personaAndContext} ${baseInstruction}`;
}

export async function GET(request: Request) {
  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'Google API Key not configured' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = getPromptForCategory(category);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Membersihkan teks dan memformat
    text = text.replace(/\*\*/g, '').replace(/^\"|\"$/g, '').trim();
    const parts = text.split('-');
    let content = text;
    let author = 'AI Generated';

    if (parts.length > 1) {
      author = parts.pop()?.trim() || author;
      content = parts.join('-').trim();
    }
    
    if (content.endsWith('-')) {
        content = content.slice(0, -1).trim();
    }

    return NextResponse.json({ content, author });

  } catch (error) {
    console.error("Error calling Google AI API:", error);
    // Fallback ke API lama jika AI gagal
    try {
      const fallbackResponse = await fetch('https://api.quotable.io/random?maxLength=150&tags=inspirational|work', { cache: 'no-store' });
      if (!fallbackResponse.ok) {
        return NextResponse.json({ error: 'Internal Server Error and Fallback Failed' }, { status: 500 });
      }
      const fallbackData = await fallbackResponse.json();
      return NextResponse.json(fallbackData);
    } catch (fallbackError) {
      return NextResponse.json({ error: 'Internal Server Error after Fallback' }, { status: 500 });
    }
  }
}
