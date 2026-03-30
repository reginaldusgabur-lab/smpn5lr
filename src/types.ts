
import type { DocumentData, Timestamp } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';

// Ekspor kembali tipe User dari firebase/auth agar konsisten di seluruh aplikasi
export type { FirebaseUser };

// Tipe data untuk profil pengguna yang disimpan di Firestore
export interface UserProfile extends DocumentData {
  id: string; // Biasanya sama dengan UID pengguna
  name: string;
  email: string;
  role: 'admin' | 'kepala_sekolah' | 'guru' | 'pegawai' | 'siswa';
  employmentStatus?: string; // Contoh: 'PNS', 'GTT', 'Honor'
  photoURL?: string | null; // Izinkan null agar cocok dengan tipe Firebase
}

// Gabungkan User dari Firebase dengan UserProfile kita
export type User = FirebaseUser & UserProfile;

// Tipe data untuk dokumen permintaan izin (leave request)
export interface LeaveRequest extends DocumentData {
  id: string;
  userId: string;
  userName: string;
  startDate: Timestamp;
  endDate: Timestamp;
  type: 'Izin' | 'Sakit';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}
