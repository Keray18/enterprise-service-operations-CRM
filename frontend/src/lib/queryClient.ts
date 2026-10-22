import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './apiClient';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // If an authenticated query fails with 401 Unauthorized (and it is not the background /auth/me probe)
        if (
          error instanceof ApiClientError &&
          error.statusCode === 401 &&
          JSON.stringify(query.queryKey) !== JSON.stringify(['auth', 'me'])
        ) {
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            const returnUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
            window.location.href = `/login?sessionExpired=true&redirect=${returnUrl}`;
          }
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Do not retry 4xx client errors
          if (error instanceof ApiClientError && error.statusCode >= 400 && error.statusCode < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
