import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase-admin";

// Fungsi untuk mendapatkan kutipan acak
const getRandomQuote = (quotes: any[]) => quotes[Math.floor(Math.random() * quotes.length)];

// --- Daftar Kutipan Cadangan (Fallback) ---
const fallbackQuotes = {
   in: [
     { content: "Semangat pagi! Jangan lupa sarapan, karena pura-pura bahagia juga butuh tenaga.", author: "Energi Pagi" },
     { content: "Hari ini adalah halaman baru. Mari kita isi dengan tulisan yang lebih baik dari kemarin.", author: "Resolusi Harian" },
     { content: "Kopi dan senyuman adalah kombinasi ampuh untuk memulai hari.", author: "Kafein & Optimisme" },
     { content: "Pendidikan adalah senjata paling mematikan di dunia, karena dengan itu Anda dapat mengubah dunia.", author: "Nelson Mandela" },
     { content: "Mulailah dari mana Anda berada. Gunakan apa yang Anda miliki. Lakukan apa yang Anda bisa.", author: "Arthur Ashe" },
   ],
   out: [
     { content: "Pekerjaan selesai! Terima kasih atas usahanya. Saatnya pulang dan beristirahat.", author: "Mode Istirahat" },
     { content: "Waktu pulang adalah pengingat bahwa baterai kita juga perlu di-charge. Sampai jumpa besok!", author: "Pengingat Sore" },
     { content: "Hati-hati di jalan! Semoga perjalanan pulangmu menyenangkan.", author: "Doa Sore Hari" },
     { content: "Satu hari lagi selesai, satu langkah lagi lebih dekat dengan tujuan. Kerja bagus!", author: "Motivasi Pulang" },
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
      limit(20) // Ambil 20 kutipan untuk dipilih di sisi server
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
