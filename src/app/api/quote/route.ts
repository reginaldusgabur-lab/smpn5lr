'''
import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-admin";

// Fungsi untuk mendapatkan kutipan acak
const getRandomQuote = (quotes: any[]) => quotes[Math.floor(Math.random() * quotes.length)];

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
     { content: "Pekerjaan selesai! Terima kasih atas usahanya. Saatnya pulang dan beristirahat.", author: "Mode Istirahat" },
     { content: "Waktu pulang adalah pengingat bahwa baterai sosial kita juga perlu di-charge. Sampai jumpa besok!", author: "Introvert Bahagia" },
     { content: "Hati-hati di jalan! Semoga kemacetan bersahabat denganmu hari ini.", author: "Doa Sore Hari" },
     { content: "Satu hari lagi selesai, satu langkah lagi menuju akhir pekan. Kerja bagus!", author: "Pejuang Lima Hari" },
     { content: "Beristirahatlah. Ladang yang telah beristirahat memberikan panen yang melimpah.", author: "Ovid" },
   ]
 };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type !== 'in' && type !== 'out') {
    return NextResponse.json({ error: 'Invalid type parameter. Use "in" or "out".' }, { status: 400 });
  }

  try {
    const q = query(
      collection(db, "quotes"),
      where("type", "==", type),
      limit(20) // Ambil 20 kutipan acak untuk dipilih di sisi server
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Jika tidak ada di database, gunakan fallback
      const fallbackQuote = getRandomQuote(fallbackQuotes[type]);
      return NextResponse.json(fallbackQuote);
    }

    const quotes = querySnapshot.docs.map(doc => doc.data());
    const randomQuote = getRandomQuote(quotes);

    return NextResponse.json(randomQuote);

  } catch (error) {
    console.error("Error fetching quote:", error);
    // Jika terjadi error saat mengambil dari Firestore, gunakan fallback
    try {
      const fallbackQuote = getRandomQuote(fallbackQuotes[type]);
      return NextResponse.json(fallbackQuote);
    } catch (fallbackError) {
      return NextResponse.json({ error: 'Failed to fetch quote from both Firestore and fallback.' }, { status: 500 });
    }
  }
}
'''