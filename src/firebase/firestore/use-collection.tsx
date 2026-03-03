'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { getAuth, type User } from 'firebase/auth';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    },
    collectionGroup: string | null;
  }
}

export function useCollection<T = any>(
    userForSubscription: User | null,
    memoizedTargetRefOrQuery: CollectionReference<DocumentData> | Query<DocumentData> | null | undefined,
): UseCollectionResult<T> {
  const [result, setResult] = useState<UseCollectionResult<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    setResult({ data: null, isLoading: true, error: null });
    let isMounted = true; // Flag to track mount status

    if (!memoizedTargetRefOrQuery) {
      if (isMounted) {
        setResult({ data: null, isLoading: false, error: null });
      }
      return;
    }
    
    // Capture the UID for which this subscription is being made.
    const subscriptionUid = userForSubscription?.uid;

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (!isMounted) return; // Prevent state update on unmounted component

        // Before processing the data, ensure the user hasn't changed.
        const currentAuthUser = getAuth().currentUser;
        if (currentAuthUser?.uid !== subscriptionUid) {
            // This is a stale result from a previous user's subscription. Ignore it.
            return;
        }
        
        const results: WithId<T>[] = snapshot.docs.map(doc => ({ ...(doc.data() as T), id: doc.id }));
        setResult({ data: results, isLoading: false, error: null });
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

        // Do not throw a permission error for CollectionGroup queries, as they might just need an index.
        const internalQuery = (memoizedTargetRefOrQuery as unknown as InternalQuery)._query;
        if (internalQuery?.collectionGroup) {
          setResult({ data: null, isLoading: false, error });
          return;
        }


        let path: string;
        if (memoizedTargetRefOrQuery.type === 'collection') {
          path = (memoizedTargetRefOrQuery as CollectionReference).path;
        } else if (internalQuery) {
          path = internalQuery.path.canonicalString();
        } else {
          path = '[unknown path]';
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: path,
        });
        
        setResult({ data: null, isLoading: false, error: contextualError });
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [memoizedTargetRefOrQuery, userForSubscription]);

  return result;
}
