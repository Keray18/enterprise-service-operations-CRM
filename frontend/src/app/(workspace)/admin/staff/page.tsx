'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import React from 'react';
import { AccountManagementPanel } from '../../../../components/accounts/AccountManagementPanel';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';

export default function AdminStaffPage() {
  return (
    <ProtectedRoute requiredRole="ADMIN" requiredPermission="users:read">
      <Box>
        <PageHeader
          title="Operational Staff"
          subtitle="Provision and manage Call Center, Service Center, Field Engineer and Warehouse accounts"
        />
        <Alert severity="info" sx={{ mb: 2 }}>
          Administrator accounts are managed by your software provider. Engineers with open jobs are reassigned from Engineer Management before suspension.
        </Alert>
        <AccountManagementPanel scope="staff" provisionableRoles={['CALL_CENTER', 'ASF', 'ENGINEER', 'WAREHOUSE']} entityLabel="Staff Member" />
      </Box>
    </ProtectedRoute>
  );
}
