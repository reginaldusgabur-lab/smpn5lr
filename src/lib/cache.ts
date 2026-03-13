'use client';

/**
 * Sederhana, cache di memori sisi klien untuk menyimpan hasil query Firestore.
 * Ini membantu mengurangi panggilan database yang tidak perlu untuk data yang tidak sering berubah,
 * membuat navigasi lebih cepat dan lebih hemat biaya.
 */

interface CacheEntry {
  data: any;
  timestamp: number;
}

// Peta untuk menampung entri cache.
const cache = new Map<string, CacheEntry>();

// Time-To-Live (TTL) untuk entri cache dalam milidetik. Data yang lebih tua dari ini akan dianggap usang.
// Diatur ke 2 menit, keseimbangan yang baik antara kesegaran data dan penghematan panggilan DB.
const TTL = 2 * 60 * 1000; // 2 Menit

/**
 * Mengambil data dari cache jika ada dan masih segar.
 * @param key Kunci unik untuk entri cache (misalnya, path koleksi + filter query).
 * @returns Data yang di-cache atau null jika tidak ada atau sudah usang.
 */
export const getFromCache = (key: string): any | null => {
  const entry = cache.get(key);

  // Periksa apakah entri ada dan apakah belum melewati TTL.
  if (entry && (Date.now() - entry.timestamp < TTL)) {
    // console.log(`[CACHE HIT] Mengambil data untuk kunci: ${key}`);
    return entry.data;
  }

  // console.log(`[CACHE MISS] Tidak ada data segar untuk kunci: ${key}`);
  return null;
};

/**
 * Menyimpan data ke dalam cache.
 * @param key Kunci unik untuk entri cache.
 * @param data Data yang akan disimpan.
 */
export const setInCache = (key: string, data: any): void => {
  // console.log(`[CACHE SET] Menyimpan data untuk kunci: ${key}`);
  cache.set(key, { data, timestamp: Date.now() });
};

/**
 * Menghapus entri tertentu dari cache, atau membersihkan seluruh cache.
 * Ini berguna ketika mutasi data terjadi (misalnya, setelah memperbarui dokumen).
 * @param key Kunci spesifik yang akan dihapus. Jika tidak disediakan, seluruh cache akan dibersihkan.
 */
export const invalidateCache = (key?: string): void => {
  if (key) {
    // console.log(`[CACHE INVALIDATE] Menghapus kunci: ${key}`);
    cache.delete(key);
  } else {
    // console.log('[CACHE CLEAR] Membersihkan semua entri cache.');
    cache.clear();
  }
};
