'use client';

import Box from '@mui/material/Box';
import React from 'react';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { ReplacementWorkbench } from '../../../../components/replacements/ReplacementWorkbench';

export default function ReplacementsPage() {
  return (
    <ProtectedRoute requiredRole={['WAREHOUSE','ADMIN']} requiredPermission="inventory:read">
      <Box>
        <PageHeader title="Replacement Dispatch" subtitle="Allocate, barcode-verify and dispatch replacement units; close verified installations" />
        <ReplacementWorkbench scope="warehouse" />
      </Box>
    </ProtectedRoute>
  );
}
