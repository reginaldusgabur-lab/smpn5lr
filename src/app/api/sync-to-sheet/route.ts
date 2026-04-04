
import { NextResponse } from 'next/server';

export async function POST() {
  // ==========================================================================
  // FITUR SINKRONISASI DINONAKTIFKAN SEMENTARA
  // Kode di bawah ini akan mengembalikan pesan bahwa fitur sedang dikembangkan
  // dan mencegah error saat build.
  // ==========================================================================
  return NextResponse.json(
    { message: 'Fitur sinkronisasi sedang dalam pengembangan.' },
    { status: 501 } // 501 Not Implemented
  );

  /*
  // KODE ASLI YANG MENYEBABKAN ERROR (JANGAN DIHAPUS, HANYA DI-COMMENT)
  
  try {
    const students = await adminDb.collection('students').get();
    const studentsData = students.docs.map(doc => doc.data());

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ auth, version: 'v4' });

    const values = studentsData.map(student => [
      student.uid,
      student.name,
      student.class,
      student.parentName,
      student.parentPhone,
      student.status,
      student.entryDate,
      student.photoUrl
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: values
      },
    });

    return NextResponse.json({ message: 'Sinkronisasi berhasil' });
  } catch (error) {
    console.error('Error during sheet sync:', error);
    return NextResponse.json({ message: 'Sinkronisasi gagal', error: (error as Error).message }, { status: 500 });
  }
  
  */
}
