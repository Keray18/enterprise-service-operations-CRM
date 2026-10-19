'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { makeQueryClient } from '../lib/queryClient';
import { ThemeRegistry } from '../theme/ThemeRegistry';
import { AuthProvider } from './AuthProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeRegistry>
        <AuthProvider>{children}</AuthProvider>
      </ThemeRegistry>
    </QueryClientProvider>
  );
}
