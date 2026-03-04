'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  Unsubscribe,
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
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    // If there's no query, or the user logs out, clean up and reset the state.
    if (!memoizedTargetRefOrQuery || !userForSubscription) {
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
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const currentAuthUser = getAuth().currentUser;
        if (currentAuthUser?.uid !== subscriptionUid) {
          // Stale data from a previous user. Ignore.
          return;
        }

        const results: WithId<T>[] = snapshot.docs.map(doc => ({ ...(doc.data() as T), id: doc.id }));
        setResult({ data: results, isLoading: false, error: null });
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

    // Cleanup function for when the component unmounts or dependencies change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [memoizedTargetRefOrQuery, userForSubscription]);

  return result;
}
