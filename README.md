# Aplikasi Absensi SMPN 5 Langke Rembong (E-SPENLI)

Selamat datang di dokumentasi resmi E-SPENLI, sebuah aplikasi absensi digital modern yang dirancang khusus untuk SMPN 5 Langke Rembong. Aplikasi ini dibangun untuk mengotomatiskan dan meningkatkan akurasi proses absensi bagi seluruh warga sekolah.

## Latar Belakang
Di era digital, proses manual pencatatan kehadiran rentan terhadap kesalahan, memakan waktu, dan sulit untuk dianalisis. E-SPENLI hadir sebagai solusi untuk mengatasi tantangan ini dengan menyediakan platform yang efisien, transparan, dan mudah diakses.

## Tujuan
- **Otomatisasi**: Mengurangi pekerjaan administrasi manual terkait pencatatan absensi.
- **Akurasi**: Memastikan data kehadiran yang akurat dengan validasi QR code, lokasi (GPS), dan waktu.
- **Transparansi**: Memberikan akses laporan real-time bagi Kepala Sekolah dan Admin.
- **Efisiensi**: Mempermudah proses pengajuan izin/sakit secara online.
- **Modernisasi**: Membawa sistem administrasi sekolah ke tingkat yang lebih modern dan digital.

## Alur Kerja Aplikasi

### 1. Admin
- **Manajemen Pengguna**: Dapat menambah, mengedit, dan menghapus data semua pengguna (Kepala Sekolah, Guru, Pegawai, Siswa).
- **Konfigurasi Absensi**: Mengatur parameter vital seperti lokasi sekolah, radius absensi, jam masuk/pulang, dan mengelola jadwal hari libur.
- **Generate QR Code**: Membuat dan mengunduh QR Code absensi yang akan digunakan untuk proses scan.
- **Pemantauan**: Memiliki akses penuh ke dasbor utama dan semua modul laporan.

### 2. Kepala Sekolah
- **Pemantauan**: Dapat melihat dasbor ringkasan kehadiran seluruh staf dan riwayat absensi terbaru.
- **Persetujuan Izin**: Menyetujui atau menolak pengajuan izin/sakit yang diajukan oleh guru dan pegawai.
- **Akses Laporan**: Memiliki akses penuh untuk melihat dan meninjau semua data laporan kehadiran.
- **Absensi Pribadi**: Melakukan absensi masuk dan pulang seperti pengguna lainnya.

### 3. Guru & Pegawai
- **Login & Registrasi**: Dapat mendaftar dan login ke sistem dengan verifikasi email.
- **Dasbor Pribadi**: Melihat ringkasan kehadiran pribadi, jam masuk/pulang, dan aktivitas terkini.
- **Absensi**: Melakukan absensi dengan memindai QR Code yang disediakan admin.
- **Pengajuan Izin/Sakit**: Mengajukan ketidakhadiran secara online melalui formulir.
- **Laporan Pribadi**: Melihat riwayat lengkap absensi dan status pengajuan izin pribadi.

### 4. Siswa
- **Login**: Siswa didaftarkan oleh Admin dan dapat login dengan akun yang telah dibuat.
- **Dasbor Pribadi**: Sama seperti guru, siswa dapat melihat ringkasan dan riwayat kehadiran pribadinya.
- **Absensi**: Melakukan absensi dengan memindai QR Code.
- **Pengajuan Izin/Sakit**: Mengajukan ketidakhadiran secara online.

## Fitur Utama
- **Absensi QR Code**: Proses check-in dan check-out yang cepat dan aman.
- **Validasi Berlapis**: Sistem memvalidasi absensi berdasarkan kecocokan QR Code, radius lokasi sekolah (GPS), dan rentang waktu yang telah ditetapkan.
- **Dasbor Real-time**: Menyajikan data statistik kehadiran secara langsung.
- **Manajemen Pengguna Komprehensif**: Pengelolaan data untuk semua peran dengan hak akses yang berbeda.
- **Pengajuan Izin/Sakit Online**: Proses pengajuan dan persetujuan yang paperless dan terdokumentasi.
- **Laporan Kehadiran Dinamis**: Filter laporan berdasarkan bulan dan tahun, serta unduh rekapitulasi atau detail per pengguna dalam format PDF dan Excel.
- **Pengaturan Fleksibel**: Admin dapat dengan mudah menyesuaikan jam kerja, lokasi, hingga mengaktifkan mode libur.
- **Kutipan Motivasi AI**: Setelah berhasil absen, pengguna disambut dengan kutipan penyemangat yang dihasilkan oleh AI untuk memulai hari dengan positif.

## Teknologi yang Digunakan
- **Frontend**: Next.js (App Router), React, TypeScript
- **Styling**: Tailwind CSS, Shadcn/UI
- **Backend & Database**: Firebase (Authentication, Firestore)
- **Fitur AI**: Google Genkit

## Struktur Proyek
- `src/app/`: Direktori utama untuk semua halaman dan komponen aplikasi.
- `src/app/dashboard/`: Halaman-halaman yang memerlukan autentikasi.
- `src/app/dashboard/(roles)`: Halaman spesifik untuk peran tertentu (admin, guru, dll).
- `src/components/`: Komponen UI yang dapat digunakan kembali.
- `src/firebase/`: Konfigurasi dan hooks untuk interaksi dengan Firebase.
- `src/ai/`: Konfigurasi dan flow untuk fitur Genkit AI.

## Instalasi dan Menjalankan Proyek

1.  **Clone repositori:**
    ```bash
    git clone [URL_REPOSITORI_ANDA]
    cd [NAMA_DIREKTORI]
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Setup Environment Variables:**
    Buat file `.env` di root proyek dan isi dengan kredensial Firebase dan API Key Gemini Anda.
    ```env
    # Firebase Client Config
    NEXT_PUBLIC_FIREBASE_API_KEY=...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
    NEXT_PUBLIC_FIREBASE_APP_ID=...

    # Genkit AI Config
    GEMINI_API_KEY=...
    ```

4.  **Jalankan aplikasi:**
    ```bash
    npm run dev
    ```
    Aplikasi akan berjalan di `http://localhost:3000`.