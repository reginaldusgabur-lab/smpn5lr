'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, DocumentData } from 'firebase/firestore';

interface CacheContextType {
  schoolConfig: DocumentData | null;
  isCacheLoading: boolean;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

/**
 * CacheProvider berfungsi sebagai store pusat untuk data yang sering digunakan di seluruh aplikasi.
 * Data seperti 'schoolConfig' hanya perlu dimuat sekali di sini, bukan di setiap halaman.
 */
export function CacheProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();

  // Memuat konfigurasi sekolah secara real-time satu kali untuk seluruh sesi dashboard.
  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  const value = useMemo(() => ({
    schoolConfig,
    isCacheLoading: isConfigLoading,
  }), [schoolConfig, isConfigLoading]);

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}

export function useCache() {
  const context = useContext(CacheContext);
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
}
