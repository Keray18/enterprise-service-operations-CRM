'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { apiClient, setCsrfToken } from '../lib/apiClient';

export interface AuthUser {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  locationId?: string;
  brandId?: string;
}

interface MeResponse {
  user: AuthUser;
  csrfToken?: string;
}

interface LoginResponse {
  user: AuthUser;
  csrfToken: string;
  expiresAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { username: string; password: string }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Query /api/v1/auth/me on mount to restore active session
  const { data, isLoading } = useQuery<MeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      return apiClient.get<MeResponse>('/api/v1/auth/me');
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (data?.csrfToken) {
      setCsrfToken(data.csrfToken);
    }
  }, [data]);

  const loginMutation = useMutation<LoginResponse, Error, { username: string; password: string }>({
    mutationFn: async (credentials) => {
      const res = await apiClient.post<LoginResponse>('/api/v1/auth/login', credentials);
      return res;
    },
    onSuccess: (res) => {
      if (res.csrfToken) {
        setCsrfToken(res.csrfToken);
      }
      queryClient.setQueryData(['auth', 'me'], { user: res.user, csrfToken: res.csrfToken });
    },
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await apiClient.post('/api/v1/auth/logout');
      } catch {
        // Even if backend session already expired or unreachable, proceed with local revocation
      }
    },
    onSettled: () => {
      setCsrfToken(null);
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.clear();
      window.location.href = '/login';
    },
  });

  const user = data?.user ?? null;
  const isAuthenticated = !!user;

  const permissionSet = useMemo(() => new Set(user?.permissions || []), [user]);
  const roleSet = useMemo(() => new Set(user?.roles || []), [user]);

  const hasPermission = React.useCallback(
    (permission: string) => permissionSet.has(permission),
    [permissionSet]
  );
  const hasRole = React.useCallback(
    (role: string) => roleSet.has(role),
    [roleSet]
  );

  const login = React.useCallback(
    async (credentials: Parameters<typeof loginMutation.mutateAsync>[0]) => {
      return loginMutation.mutateAsync(credentials);
    },
    [loginMutation]
  );

  const logout = React.useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      login,
      logout,
      hasPermission,
      hasRole,
    }),
    [user, isLoading, isAuthenticated, login, logout, hasPermission, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
