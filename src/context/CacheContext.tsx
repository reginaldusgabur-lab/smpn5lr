'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, DocumentData } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface CacheContextType {
  schoolConfig: DocumentData | null;
  userProfile: DocumentData | null;
  isCacheLoading: boolean;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export function CacheProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user, isUserLoading: isAuthLoading } = useUser();

  // --- School Config Fetching ---
  const schoolConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'schoolConfig', 'default') : null, [firestore]);
  const { data: schoolConfig, isLoading: isConfigLoading } = useDoc(user, schoolConfigRef);

  // --- User Profile Fetching ---
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, isLoading: isProfileLoading } = useDoc(user, userProfileRef);

  const isCacheLoading = isAuthLoading || isConfigLoading || isProfileLoading;

  const value = useMemo(() => ({
    schoolConfig,
    userProfile,
    isCacheLoading,
  }), [schoolConfig, userProfile, isCacheLoading]);

  if (isCacheLoading) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">Memuat konfigurasi...</p>
              </div>
          </div>
      );
  }

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}

export function useCache() {
  const context = useContext(CacheContext);
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
}
