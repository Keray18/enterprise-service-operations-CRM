'use client';

import SettingsIcon from '@mui/icons-material/Settings';
import Button from '@mui/material/Button';
import Link from 'next/link';
import React from 'react';
import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { WorkspaceShell } from '../../../components/layout/WorkspaceShell';

export default function AdminPage() {
  return (
    <WorkspaceShell>
      <ProtectedRoute requiredPermission="users:read">
        <PageHeader
          title="Head Office Administration & Governance"
          subtitle="Universal Master Data, User & Franchise Directory, Approvals, and Financial Wallets."
          badge={<StatusBadge status="REGISTERED" label="Scheduled for Phase 1 & 4" />}
        />

        <EmptyState
          icon={<SettingsIcon sx={{ fontSize: '3.5rem', color: 'primary.main', opacity: 0.6 }} />}
          title="Admin & Governance Scheduled for Phase 1 & 4"
          description="The Universal Master Data Console (SCR-ADM-02), User Directory (SCR-ADM-03), and Financial Wallets (SCR-ADM-05) will be built in Phase 1 and Phase 4."
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
