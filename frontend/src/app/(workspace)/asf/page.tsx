'use client';

import AssignmentIcon from '@mui/icons-material/Assignment';
import Button from '@mui/material/Button';
import Link from 'next/link';
import React from 'react';
import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { WorkspaceShell } from '../../../components/layout/WorkspaceShell';

export default function AsfFranchisePage() {
  return (
    <WorkspaceShell>
      <ProtectedRoute requiredPermission="asf:read">
        <PageHeader
          title="Authorized Service Franchise (ASF) Console"
          subtitle="48-hour call acknowledgment queue, 1-click appointment dispatch, and on-site OTP check-in."
          badge={<StatusBadge status="ACKNOWLEDGED" label="Scheduled for Phase 2" />}
        />

        <EmptyState
          icon={<AssignmentIcon sx={{ fontSize: '3.5rem', color: 'primary.main', opacity: 0.6 }} />}
          title="Service Franchise Console Scheduled for Phase 2"
          description="The Franchise Call Queue (SCR-ASF-02) and Unified Job 360 Workspace (SCR-ASF-03) with OTP verification and Happy Code closure will be built in Phase 2."
          action={
            <Button component={Link} href="/" variant="outlined" size="small">
              Return to Foundation Overview
            </Button>
          }
        />
      </ProtectedRoute>
    </WorkspaceShell>
  );
}
