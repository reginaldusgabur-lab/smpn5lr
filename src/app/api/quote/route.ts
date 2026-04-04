import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'in') {
    return NextResponse.json({ content: "Selamat datang!", author: "Sistem" });
  }

  if (type === 'out') {
    return NextResponse.json({ content: "Selamat jalan!", author: "Sistem" });
  }

  return NextResponse.json({ error: 'Invalid type parameter. Use "in" or "out".' }, { status: 400 });
}
