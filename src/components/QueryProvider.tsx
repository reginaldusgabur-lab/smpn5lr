'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Configure cache to last for 5 minutes (300,000 ms)
        staleTime: 300000,
        // Keep data in cache for 15 minutes (900,000 ms)
        gcTime: 900000,
        // Don't refetch automatically when window is refocused
        refetchOnWindowFocus: false, 
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
