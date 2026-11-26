'use client';

import Box from '@mui/material/Box';
import React from 'react';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { ReplacementWorkbench } from '../../../../components/replacements/ReplacementWorkbench';

export default function ReplacementsPage() {
  return (
    <ProtectedRoute requiredRole={['ASF','ASF_MANAGER','ADMIN']} requiredPermission="asf:read">
      <Box>
        <PageHeader title="Replacement Fulfilment" subtitle="Accept escalations, manage quotations, receive units, schedule installers and hand over custody" />
        <ReplacementWorkbench scope="asf" />
      </Box>
    </ProtectedRoute>
  );
}
