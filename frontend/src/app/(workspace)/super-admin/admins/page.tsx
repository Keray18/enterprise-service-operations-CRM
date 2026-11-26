'use client';

import Box from '@mui/material/Box';
import React from 'react';
import { AccountManagementPanel } from '../../../../components/accounts/AccountManagementPanel';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';

export default function ClientAdminsPage() {
  return (
    <ProtectedRoute requiredRole="SUPER_ADMIN" requiredPermission="admins:manage">
      <Box>
        <PageHeader title="Client Administrators" subtitle="Provision, suspend and secure client Admin accounts" />
        <AccountManagementPanel scope="super-admin" provisionableRoles={['ADMIN']} entityLabel="Client Admin" />
      </Box>
    </ProtectedRoute>
  );
}
