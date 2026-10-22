'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect } from 'react';
import { WorkspaceShell } from '../../components/layout/WorkspaceShell';
import { useAuth } from '../../providers/AuthProvider';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // While restoring session, display clean loading screen without flashing private workspace UI
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
          gap: 2,
        }}
      >
        <CircularProgress size={42} color="primary" />
        <Typography variant="body2" color="text.secondary" fontWeight={500}>
          Validating CRM session & permissions...
        </Typography>
      </Box>
    );
  }

  // If unauthenticated, render nothing while redirect occurs
  if (!isAuthenticated || !user) {
    return null;
  }

  // Render unified WorkspaceShell for authenticated users
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
