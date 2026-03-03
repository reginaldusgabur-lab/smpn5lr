import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Mengembalikan ke API quotable.io yang stabil
    const response = await fetch('https://api.quotable.io/random?maxLength=100&tags=technology|inspirational|work', {
      headers: {
        'Content-Type': 'application/json',
      },
      // cache: 'no-store' memastikan kutipan baru setiap kali
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch quote' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
