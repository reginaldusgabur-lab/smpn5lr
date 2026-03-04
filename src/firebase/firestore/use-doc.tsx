'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { getAuth, type User } from 'firebase/auth';

type WithId<T> = T & { id: string };

export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

export function useDoc<T = any>(
  userForSubscription: User | null,
  memoizedDocRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  const [result, setResult] = useState<UseDocResult<T>>({
    data: null,
    isLoading: true,
    error: null,
  });
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    // If there's no doc ref, or the user logs out, clean up and reset the state.
    if (!memoizedDocRef || !userForSubscription) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setResult({ data: null, isLoading: false, error: null });
      return;
    }

    // If a listener is already active, no need to set up a new one.
    if (unsubscribeRef.current) {
      return;
    }

    setResult({ data: null, isLoading: true, error: null });

    const subscriptionUid = userForSubscription.uid;

    unsubscribeRef.current = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        const currentAuthUser = getAuth().currentUser;
        if (currentAuthUser?.uid !== subscriptionUid) {
          // Stale data from a previous user. Ignore.
          return;
        }
        
        if (snapshot.exists()) {
          const data = { ...(snapshot.data() as T), id: snapshot.id };
          setResult({ data, isLoading: false, error: null });
        } else {
          setResult({ data: null, isLoading: false, error: null });
        }
      },
      (error: FirestoreError) => {
        const currentAuthUser = getAuth().currentUser;
        if (currentAuthUser?.uid !== subscriptionUid) {
          console.warn('Ignoring stale Firestore error after user change.', {
            subscriptionUid,
            currentUid: currentAuthUser?.uid,
          });
          return;
        }

        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: memoizedDocRef.path,
        })
        
        setResult({ data: null, isLoading: false, error: contextualError });
      }
    );

    // Cleanup function for when the component unmounts or dependencies change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [memoizedDocRef, userForSubscription]);

  return result;
}
