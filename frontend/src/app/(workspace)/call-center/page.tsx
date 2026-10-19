'use client';

import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import Button from '@mui/material/Button';
import Link from 'next/link';
import React from 'react';
import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { WorkspaceShell } from '../../../components/layout/WorkspaceShell';

export default function CallCenterPage() {
  return (
    <WorkspaceShell>
      <ProtectedRoute requiredPermission="calls:read">
        <PageHeader
          title="Call Center Workspace"
          subtitle="Inbound complaint intake, customer mobile lookup, and automated Job Number creation."
          badge={<StatusBadge status="REGISTERED" label="Scheduled for Phase 1" />}
        />

        <EmptyState
          icon={<HeadsetMicIcon sx={{ fontSize: '3.5rem', color: 'primary.main', opacity: 0.6 }} />}
          title="Call Center Module Scheduled for Phase 1"
          description="The Fast Call Registration Console (SCR-CC-02) and Customer Directory (SCR-CC-01) will be implemented in the next vertical slice following approved functional specifications."
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
