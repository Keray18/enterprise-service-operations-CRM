'use client';

import { LockOutlined, Security, WarningAmberOutlined } from '@mui/icons-material';
import { Box, Button, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect } from 'react';
import { useAuth } from '../../providers/AuthProvider';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
}

export function ProtectedRoute({
  children,
  requiredPermission,
  requiredRole,
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated, hasPermission, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 360,
          gap: 2,
        }}
      >
        <CircularProgress size={36} color="primary" />
        <Typography variant="body2" color="text.secondary">
          Restoring secure enterprise session...
        </Typography>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card variant="outlined" sx={{ maxWidth: 480, mx: 'auto', my: 6, p: 2, textAlign: 'center' }}>
        <CardContent>
          <LockOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 1.5 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Authentication Required
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            You must be signed in with valid CRM credentials to view this workspace.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => router.push(`/login?redirect=${encodeURIComponent(pathname)}`)}
          >
            Go to Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <Card variant="outlined" sx={{ maxWidth: 540, mx: 'auto', my: 6, p: 3 }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Box
            sx={{
              display: 'inline-flex',
              p: 1.5,
              borderRadius: '50%',
              bgcolor: 'error.main',
              color: 'error.contrastText',
              mb: 2,
            }}
          >
            <WarningAmberOutlined sx={{ fontSize: 36 }} />
          </Box>
          <Typography variant="h5" fontWeight={700} color="error.main" gutterBottom>
            403 — Access Denied
          </Typography>
          <Typography variant="body1" sx={{ mb: 1.5, fontWeight: 500 }}>
            Unauthorized Workspace Capability
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your account (<strong>{user?.username}</strong> with roles{' '}
            <strong>{user?.roles.join(', ')}</strong>) lacks the required permission:
            <code style={{ marginLeft: 6, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4 }}>
              {requiredPermission}
            </code>
          </Typography>
          <Button variant="outlined" color="primary" onClick={() => router.push('/')}>
            Return to Allowed Workspaces
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <Card variant="outlined" sx={{ maxWidth: 540, mx: 'auto', my: 6, p: 3 }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Box
            sx={{
              display: 'inline-flex',
              p: 1.5,
              borderRadius: '50%',
              bgcolor: 'error.main',
              color: 'error.contrastText',
              mb: 2,
            }}
          >
            <Security sx={{ fontSize: 36 }} />
          </Box>
          <Typography variant="h5" fontWeight={700} color="error.main" gutterBottom>
            403 — Role Restriction
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            This operational area is restricted to users with role: <strong>{requiredRole}</strong>.
          </Typography>
          <Button variant="outlined" color="primary" onClick={() => router.push('/')}>
            Return to Overview
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
