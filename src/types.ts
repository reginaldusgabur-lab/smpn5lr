import type { User as FirebaseUser } from 'firebase/auth';

/**
 * Represents the user profile data structure stored in the 'users' collection in Firestore.
 */
export interface UserProfile {
  name: string;
  email: string; // This can override the optional email from FirebaseUser if present
  role: 'admin' | 'kepala_sekolah' | 'guru' | 'pegawai' | 'siswa';
  nip?: string;
  nisn?: string;
  position?: string;
  createdAt: any; // Firestore Timestamp
}

/**
 * Represents the complete application user, combining Firebase Auth information
 * with the custom user profile data from Firestore. The 'id' will come from the doc id, which is the user's uid.
 */
export type AppUser = FirebaseUser & UserProfile & { id: string };

/**
 * A generic user type that can be used throughout the application.
 * For now, it aliases to AppUser.
 */
export type User = AppUser;
