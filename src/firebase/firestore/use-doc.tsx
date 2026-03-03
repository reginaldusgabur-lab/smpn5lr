'use client';
    
import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
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

  useEffect(() => {
    setResult({ data: null, isLoading: true, error: null });
    let isMounted = true; // Flag to track mount status

    if (!memoizedDocRef) {
      if (isMounted) {
        setResult({ data: null, isLoading: false, error: null });
      }
      return;
    }
    
    // Capture the UID for which this subscription is being made.
    const subscriptionUid = userForSubscription?.uid;

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (!isMounted) return; // Prevent state update on unmounted component

        // Before processing the data, ensure the user hasn't changed.
        const currentAuthUser = getAuth().currentUser;
        if (currentAuthUser?.uid !== subscriptionUid) {
            // This is a stale result from a previous user's subscription. Ignore it.
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
        if (!isMounted) return; // Prevent state update on unmounted component
        
        // In the error callback, we explicitly check if the user has changed since
        // the subscription was created. This is the core of the race condition fix.
        const currentAuthUser = getAuth().currentUser;
        if (currentAuthUser?.uid !== subscriptionUid) {
            console.warn('Ignoring stale Firestore error after user change.', {
                subscriptionUid,
                currentUid: currentAuthUser?.uid,
            });
            // If the user has changed, this is not a "real" error for the current session.
            // We can safely ignore it to prevent the app from crashing.
            return;
        }

        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: memoizedDocRef.path,
        })
        
        setResult({ data: null, isLoading: false, error: contextualError });
      }
    );

    return () => {
        isMounted = false;
        unsubscribe();
    };
  }, [memoizedDocRef, userForSubscription]);

  return result;
}
