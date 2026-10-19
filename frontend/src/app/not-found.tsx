'use client';

import Button from '@mui/material/Button';
import Link from 'next/link';
import React from 'react';
import { EmptyState } from '../components/data-display/EmptyState';
import { PageHeader } from '../components/data-display/PageHeader';
import { WorkspaceShell } from '../components/layout/WorkspaceShell';

export default function NotFoundPage() {
  return (
    <WorkspaceShell>
      <PageHeader title="404 — Page Not Found" subtitle="The requested operational screen does not exist." />
      <EmptyState
        title="Resource Not Located"
        description="The URL you navigated to does not correspond to an authorized CRM workspace screen. Please verify the URL or return to the overview."
        action={
          <Button component={Link} href="/" variant="contained" size="small">
            Return to Overview
          </Button>
        }
      />
    </WorkspaceShell>
  );
}
