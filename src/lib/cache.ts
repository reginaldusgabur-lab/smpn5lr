'use client';

/**
 * Hybrid Caching System: In-Memory + Session Storage.
 * Membantu mengurangi panggilan database Firestore secara drastis dengan menyimpan 
 * hasil query selama sesi berlangsung.
 */

interface CacheEntry {
  data: any;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();

// TTL (Time-To-Live) dinaikkan menjadi 5 menit untuk stabilitas lebih baik.
const TTL = 5 * 60 * 1000; 

/**
 * Mengambil data dari cache hybrid.
 */
export const getFromCache = (key: string): any | null => {
  if (typeof window === 'undefined') return null;

  // 1. Cek Memori (Sangat Cepat)
  let entry = memoryCache.get(key);

  // 2. Cek SessionStorage jika di memori tidak ada (Standby/Refresh recovery)
  if (!entry) {
    try {
      const stored = sessionStorage.getItem(`espenli_cache_${key}`);
      if (stored) {
        entry = JSON.parse(stored);
        // Masukkan kembali ke memori untuk akses lebih cepat berikutnya
        if (entry) memoryCache.set(key, entry);
      }
    } catch (e) {
      return null;
    }
  }

  // Periksa kesegaran data
  if (entry && (Date.now() - entry.timestamp < TTL)) {
    return entry.data;
  }

  // Jika usang, hapus
  if (entry) invalidateCache(key);
  return null;
};

/**
 * Menyimpan data ke dalam cache hybrid.
 */
export const setInCache = (key: string, data: any): void => {
  if (typeof window === 'undefined') return;

  const entry: CacheEntry = { data, timestamp: Date.now() };
  
  // Simpan di Memori
  memoryCache.set(key, entry);

  // Simpan di SessionStorage agar tahan refresh ringan
  try {
    sessionStorage.setItem(`espenli_cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    // Abaikan jika quota penuh
  }
};

/**
 * Menghapus entri cache.
 */
export const invalidateCache = (key?: string): void => {
  if (typeof window === 'undefined') return;

  if (key) {
    memoryCache.delete(key);
    sessionStorage.removeItem(`espenli_cache_${key}`);
  } else {
    // Jika tidak ada key, hapus semua cache yang berkaitan dengan statistik dan daily stats
    memoryCache.clear();
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('espenli_cache_')) sessionStorage.removeItem(k);
    });
  }
};
