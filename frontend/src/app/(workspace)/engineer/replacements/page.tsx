'use client';

import Box from '@mui/material/Box';
import React from 'react';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { ReplacementWorkbench } from '../../../../components/replacements/ReplacementWorkbench';

export default function ReplacementsPage() {
  return (
    <ProtectedRoute requiredRole={['ENGINEER']} requiredPermission="calls:checkin">
      <Box>
        <PageHeader title="My Replacement Jobs" subtitle="Collect units, verify arrival and record installations" />
        <ReplacementWorkbench scope="engineer" />
      </Box>
    </ProtectedRoute>
  );
}
