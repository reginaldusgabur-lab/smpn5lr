
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi GoogleGenerativeAI dengan kunci API dari environment variables
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// --- Daftar Kutipan Cadangan (Fallback) yang Dinamis ---
const fallbackQuotes = {
  in: [
    { content: "Semangat pagi! Jangan lupa sarapan, karena pura-pura bahagia juga butuh tenaga.", author: "Energi Pagi" },
    { content: "Hari ini adalah halaman baru. Mari kita isi dengan tulisan yang lebih baik dari kemarin... atau setidaknya lebih rapi.", author: "Resolusi Harian" },
    { content: "Kopi dan senyuman adalah kombinasi ampuh untuk memulai hari. Jika tidak ada kopi, senyum saja yang kencang.", author: "Kafein & Optimisme" },
    { content: "Pendidikan adalah senjata paling mematikan di dunia, karena dengan itu Anda dapat mengubah dunia. Ayo mulai pertempuran hari ini!", author: "Nelson Mandela (Mode Semangat)" },
    { content: "Jangan biarkan pekerjaan kemarin mengambil terlalu banyak waktu hari ini. Mari mulai dengan yang baru!", author: "Will Rogers" },
  ],
  out: [
    { content: "Pekerjaan selesai! Terima kasih atas usahanya. Saatnya pulang dan menjadi kentang sofa.", author: "Mode Istirahat" },
    { content: "Waktu pulang adalah pengingat bahwa baterai sosial kita juga perlu di-charge. Sampai jumpa besok!", author: "Introvert Bahagia" },
    { content: "Hati-hati di jalan! Semoga kemacetan bersahabat denganmu hari ini.", author: "Doa Sore Hari" },
    { content: "Satu hari lagi selesai, satu langkah lagi menuju akhir pekan. Kerja bagus!", author: "Pejuang Lima Hari" },
    { content: "Beristirahatlah. Ladang yang telah beristirahat memberikan panen yang melimpah.", author: "Ovid" },
  ]
};

// --- Fungsi untuk Membuat Prompt AI yang Kontekstual ---
function getAIQuotePrompt(role: string | null, attendanceType: string | null): string {
  const baseInstruction = `Tolong berikan satu kutipan singkat (sekitar 100-150 karakter) dalam format: \"Isi Kutipan\" - Nama Tokoh atau Sumber. Jangan tambahkan teks pembuka atau judul.`;

  let persona = "Anda adalah seorang motivator yang humoris."; // Default persona
  switch (role) {
    case 'siswa': persona = "Anda adalah seorang mentor gaul yang mengerti kehidupan siswa SMP."; break;
    case 'guru': case 'pegawai': persona = "Anda adalah rekan kerja yang bijak dan suportif di lingkungan sekolah."; break;
    case 'kepala-sekolah': case 'admin': persona = "Anda adalah penasihat berpengalaman untuk para pemimpin."; break;
  }

  let context = "";
  if (attendanceType === 'in') {
    context = "Konteksnya adalah untuk menyemangati seseorang di pagi hari saat mereka baru tiba di sekolah/tempat kerja. Buatlah kutipan yang lucu, ringan, dan memotivasi untuk memulai hari.";
  } else if (attendanceType === 'out') {
    context = "Konteksnya adalah untuk memberikan ucapan penutup saat seseorang akan pulang kerja. Buatlah kutipan yang ringan, lucu, atau bijak tentang istirahat dan menyelesaikan pekerjaan.";
  } else {
    context = "Berikan kutipan motivasi umum yang singkat dan inspiratif.";
  }

  return `${persona} ${context} ${baseInstruction}`;
}

// --- Handler API (GET) yang Telah Diperbarui ---
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('category');
  const attendanceType = searchParams.get('type'); // 'in' atau 'out'

  // --- Percobaan #1: Google AI API ---
  if (process.env.GOOGLE_API_KEY) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = getAIQuotePrompt(role, attendanceType);
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

    } catch (aiError) {
      console.error("Google AI API failed. Proceeding to local fallback.", aiError);
      // Jika AI gagal, jangan panik, lanjutkan ke fallback lokal di bawah
    }
  }

  // --- Rencana Cadangan Terakhir: Kutipan Acak dari Daftar Lokal ---
  console.log("Using local fallback quote.");
  const fallbackType = (attendanceType === 'out') ? 'out' : 'in'; // Default ke 'in' jika tipe tidak valid
  const quotes = fallbackQuotes[fallbackType];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return NextResponse.json(randomQuote);
}
