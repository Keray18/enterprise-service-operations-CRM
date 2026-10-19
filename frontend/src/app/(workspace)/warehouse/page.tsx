'use client';

import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Button from '@mui/material/Button';
import Link from 'next/link';
import React from 'react';
import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { WorkspaceShell } from '../../../components/layout/WorkspaceShell';

export default function WarehousePage() {
  return (
    <WorkspaceShell>
      <ProtectedRoute requiredPermission="inventory:read">
        <PageHeader
          title="Warehouse & Logistics Workspace"
          subtitle="PNA part allocation, GST Tax Invoices, Delivery Challans, and inbound Security Gate Entry."
          badge={<StatusBadge status="PENDING_SPARE_PART" label="Scheduled for Phase 3" />}
        />

        <EmptyState
          icon={<LocalShippingIcon sx={{ fontSize: '3.5rem', color: 'primary.main', opacity: 0.6 }} />}
          title="Warehouse & Logistics Scheduled for Phase 3"
          description="The PNA Dispatch Console (SCR-WH-02), Invoices/Challans Archive (SCR-WH-03), and Gate Entry/GRN Hub (SCR-WH-05) will be built in Phase 3."
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
