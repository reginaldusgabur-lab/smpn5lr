
'use client';

import { createContext, useContext, ReactNode, useMemo, useEffect, useState } from 'react';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, DocumentData } from 'firebase/firestore';

interface CacheContextType {
  schoolConfig: DocumentData | null;
  isCacheLoading: boolean;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

/**
 * CacheProvider berfungsi sebagai store pusat untuk data yang sering digunakan di seluruh aplikasi.
 * Menggunakan state lokal untuk memastikan data stabil dan tidak memicu remount berlebih.
 */
export function CacheProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [config, setConfig] = useState<DocumentData | null>(null);

  // Memuat konfigurasi sekolah secara real-time satu kali
  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: fetchedConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  // Sync fetched data ke local state agar lebih stabil di standby
  useEffect(() => {
    if (fetchedConfig) {
      setConfig(fetchedConfig);
      // Simpan ke sessionStorage sebagai cadangan darurat
      sessionStorage.setItem('espenli_config_backup', JSON.stringify(fetchedConfig));
    } else if (!isConfigLoading && !fetchedConfig) {
      // Cek cadangan jika fetch gagal/kosong tapi sedang tidak loading
      const backup = sessionStorage.getItem('espenli_config_backup');
      if (backup) setConfig(JSON.parse(backup));
    }
  }, [fetchedConfig, isConfigLoading]);

  const value = useMemo(() => ({
    schoolConfig: config,
    isCacheLoading: isConfigLoading && !config,
  }), [config, isConfigLoading]);

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}

export function useCache() {
  const context = useContext(CacheContext);
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
}
