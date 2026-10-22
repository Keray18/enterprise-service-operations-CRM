'use client';

import LockPersonIcon from '@mui/icons-material/LockPerson';
import LogoutIcon from '@mui/icons-material/Logout';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';
import { resolveDefaultWorkspace } from '../lib/workspaceResolver';
import { useAuth } from '../providers/AuthProvider';

/**
 * Root Application Entrypoint (/)
 *
 * This page serves purely as an authentication-aware traffic controller:
 * 1. Unauthenticated users are redirected immediately to /login.
 * 2. Authenticated users are routed to their role-authorized default workspace:
 *    - ADMIN -> /admin
 *    - CALL_CENTER -> /call-center
 *    - ASF / ENGINEER -> /asf
 *    - WAREHOUSE -> /warehouse
 * 3. Users with no authorized roles receive a controlled access message with a sign-out action.
 *
 * The public System Overview has been moved to /admin/diagnostics under administrative protection.
 */
export default function RootEntrypointPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    const targetWorkspace = resolveDefaultWorkspace(user);
    if (targetWorkspace) {
      router.replace(targetWorkspace);
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Loading state while checking backend session validity
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          gap: 2.5,
        }}
      >
        <CircularProgress size={44} color="primary" />
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
          Connecting to Enterprise After-Sales CRM...
        </Typography>
      </Box>
    );
  }

  // If authenticated but no workspace mapping matches the user's role
  if (isAuthenticated && !resolveDefaultWorkspace(user)) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          p: 3,
        }}
      >
        <Card variant="outlined" sx={{ maxWidth: 480, width: '100%', textAlign: 'center', p: 3, borderRadius: 2 }}>
          <CardContent>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: 'warning.light',
                color: 'warning.dark',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <LockPersonIcon sx={{ fontSize: 32 }} />
            </Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              No Workspace Assigned
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Your account (<strong>{user?.username}</strong>) is active, but does not currently have access to any
              operational workspace.
            </Typography>
            <Typography variant="caption" color="text.muted" sx={{ display: 'block', mb: 3 }}>
              Roles: {user?.roles?.length ? user.roles.join(', ') : 'None'}
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<LogoutIcon />}
              onClick={() => logout()}
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // During redirect transition
  return null;
}
