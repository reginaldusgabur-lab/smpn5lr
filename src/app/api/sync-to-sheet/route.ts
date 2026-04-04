
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase';
import { google } from 'googleapis';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

// Struktur untuk mengelompokkan data per hari
interface DailyRecord {
    date: string; // YYYY-MM-DD
    name: string;
    nip: string;
    status: 'Hadir' | 'Izin' | 'Sakit' | 'Alpa';
    checkIn?: string; // HH:mm:ss
    checkOut?: string; // HH:mm:ss
    leaveReason?: string;
    attachment?: string;
}

export async function POST() {
    try {
        // --- 1. Autentikasi dengan Google Sheets API ---
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!spreadsheetId || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
            throw new Error("Konfigurasi Google Sheets (ID atau kredensial) belum diatur di environment variables.");
        }

        // --- 2. Ambil Semua Data dari Firestore ---
        console.log('Fetching all data from Firestore...');
        const [usersSnap, attendanceSnap, leavesSnap] = await Promise.all([
            adminDb.collection('users').where('role', 'in', ['guru', 'pegawai', 'kepala_sekolah']).get(),
            adminDb.collectionGroup('attendanceRecords').get(),
            adminDb.collectionGroup('leaveRequests').where('status', '==', 'disetujui').get()
        ]);

        const users = new Map(usersSnap.docs.map(doc => [doc.id, doc.data()]));
        
        // --- 3. Proses dan Kelompokkan Data ---
        console.log('Processing and grouping data...');
        const allRecords: DailyRecord[] = [];

        // Proses Absensi Hadir
        attendanceSnap.forEach(doc => {
            const data = doc.data();
            const user = users.get(data.userId);
            if (user) {
                allRecords.push({
                    date: data.date, // YYYY-MM-DD
                    name: user.name,
                    nip: user.nip || '-',
                    status: 'Hadir',
                    checkIn: data.checkIn ? format(data.checkIn.toDate(), 'HH:mm:ss') : '-',
                    checkOut: data.checkOut ? format(data.checkOut.toDate(), 'HH:mm:ss') : '-',
                });
            }
        });

        // Proses Izin/Sakit yang Disetujui
        leavesSnap.forEach(doc => {
            const data = doc.data();
            const user = users.get(data.userId);
            if (user) {
                const startDate = data.startDate.toDate();
                const endDate = data.endDate.toDate();
                // Loop dari tanggal mulai hingga selesai
                for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
                    allRecords.push({
                        date: format(d, 'yyyy-MM-dd'),
                        name: user.name,
                        nip: user.nip || '-',
                        status: data.type === 'sick' ? 'Sakit' : 'Izin',
                        leaveReason: data.reason,
                        attachment: data.attachmentUrl || '-'
                    });
                }
            }
        });

        // Kelompokkan semua record berdasarkan bulan (sheet)
        const recordsBySheet = allRecords.reduce((acc, record) => {
            const monthSheetName = format(parseISO(record.date), 'MMMM yyyy', { locale: id });
            if (!acc[monthSheetName]) {
                acc[monthSheetName] = [];
            }
            acc[monthSheetName].push(record);
            return acc;
        }, {} as Record<string, DailyRecord[]>);

        // --- 4. Interaksi dengan Google Spreadsheet ---
        console.log('Syncing to Google Sheets...');
        const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheets = spreadsheetMeta.data.sheets?.map(s => s.properties?.title) || [];

        const batchUpdateRequests = [];

        // Hapus semua sheet yang ada (kecuali yang pertama/default jika perlu)
        const sheetsToDelete = spreadsheetMeta.data.sheets?.filter(s => s.properties?.sheetId !== 0).map(s => s.properties?.sheetId);
        if(sheetsToDelete && sheetsToDelete.length > 0) {
             console.log(`Deleting ${sheetsToDelete.length} old sheets...`);
             batchUpdateRequests.push(...sheetsToDelete.map(sheetId => ({
                 deleteSheet: { sheetId }
             })));
        }
        // Hapus juga data di sheet pertama
         batchUpdateRequests.push({
            updateCells: {
                range: { sheetId: 0 },
                fields: '*',
            }
        });


        // Buat sheet baru dan tambahkan data
        for (const sheetName of Object.keys(recordsBySheet)) {
             console.log(`Preparing sheet: ${sheetName}`);
            const sheetData = recordsBySheet[sheetName];
            
            // Urutkan data berdasarkan tanggal dan nama
            sheetData.sort((a, b) => {
                if (a.date < b.date) return -1;
                if (a.date > b.date) return 1;
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return 0;
            });

            const header = ['Tanggal', 'Nama', 'NIP', 'Status Kehadiran', 'Jam Masuk', 'Jam Pulang', 'Keterangan', 'Lampiran Izin'];
            const rows = sheetData.map(r => [
                r.date,
                r.name,
                r.nip,
                r.status,
                r.checkIn || '-',
                r.checkOut || '-',
                r.leaveReason || '-',
                r.attachment || '-'
            ]);

            const newSheetId = Object.keys(recordsBySheet).indexOf(sheetName) + 1; // ID unik sementara
            
            batchUpdateRequests.push({
                addSheet: {
                    properties: { title: sheetName, sheetId: newSheetId }
                }
            });

            batchUpdateRequests.push({
                updateCells: {
                    rows: [{ values: header.map(h => ({ userEnteredValue: { stringValue: h } })) }, 
                           ...rows.map(row => ({ values: row.map(cell => ({ userEnteredValue: { stringValue: String(cell) } })) }))],
                    fields: 'userEnteredValue',
                    start: { sheetId: newSheetId, rowIndex: 0, columnIndex: 0 }
                }
            });
        }
        
        if (batchUpdateRequests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: { requests: batchUpdateRequests },
            });
             console.log('Batch update to Google Sheets successful.');
        }


        return NextResponse.json({ message: 'Sinkronisasi dan pencadangan data ke Google Sheets telah berhasil diselesaikan.' });

    } catch (error: any) {
        console.error('Error during Google Sheets sync:', error);
        return NextResponse.json(
            { error: `Terjadi kesalahan saat sinkronisasi: ${error.message}` },
            { status: 500 }
        );
    }
}
