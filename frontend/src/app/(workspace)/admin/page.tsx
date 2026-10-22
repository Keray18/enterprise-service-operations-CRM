'use client';

import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CategoryIcon from '@mui/icons-material/Category';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SecurityIcon from '@mui/icons-material/Security';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import React from 'react';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';

export default function AdminPage() {
  const adminModules = [
    {
      title: 'Catalog Master Management',
      code: 'SCR-ADM-02',
      status: 'ACTIVE',
      statusLabel: 'Operational (Phase 1B.1)',
      icon: <CategoryIcon sx={{ fontSize: 36, color: 'primary.main' }} />,
      description:
        'Manage Brands, Product Lines, and Model Master matrices with full SLA, warranty durations, and service eligibility rules.',
      href: '/admin/masters',
      actionLabel: 'Open Catalog Console',
      available: true,
    },
    {
      title: 'System Diagnostics & Health',
      code: 'SCR-ADM-DIAG',
      status: 'ACTIVE',
      statusLabel: 'Infrastructure Live',
      icon: <SecurityIcon sx={{ fontSize: 36, color: 'success.main' }} />,
      description:
        'Internal administrative diagnostics, Oracle database connection pool latency, and Express backend liveness probes.',
      href: '/admin/diagnostics',
      actionLabel: 'Open Diagnostics',
      available: true,
    },
    {
      title: 'User & Security Governance',
      code: 'SCR-ADM-03',
      status: 'REGISTERED',
      statusLabel: 'Phase 1A Active',
      icon: <SecurityIcon sx={{ fontSize: 36, color: 'info.main' }} />,
      description:
        'RBAC roles, system permissions, active sessions, and password security policies.',
      href: '#',
      actionLabel: 'Active via Backend API',
      available: false,
    },
    {
      title: 'Service Franchise Directory',
      code: 'SCR-ADM-01',
      status: 'REGISTERED',
      statusLabel: 'Scheduled for Phase 1C',
      icon: <PeopleIcon sx={{ fontSize: 36, color: 'text.secondary' }} />,
      description:
        'Authorised Service Franchise (ASF) network, service area pincode mapping, and capacity metrics.',
      href: '#',
      actionLabel: 'Coming in Phase 1C',
      available: false,
    },
    {
      title: 'Financial Wallets & Billing',
      code: 'SCR-ADM-05',
      status: 'REGISTERED',
      statusLabel: 'Scheduled for Phase 4',
      icon: <ReceiptIcon sx={{ fontSize: 36, color: 'text.secondary' }} />,
      description:
        'Franchise advance deposits, warranty claim settlement invoices, and credit limits.',
      href: '#',
      actionLabel: 'Coming in Phase 4',
      available: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission="users:read">
        <PageHeader
          title="Head Office Administration & Governance"
          subtitle="Universal Master Data, User & Franchise Directory, Approvals, and Financial Wallets."
          badge={<StatusBadge status="ACTIVE" label="Enterprise Admin Console" />}
        />

        <Grid container spacing={3}>
          {adminModules.map((mod) => (
            <Grid item xs={12} sm={6} md={6} key={mod.title}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  p: 1,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': mod.available
                    ? {
                        transform: 'translateY(-2px)',
                        boxShadow: 4,
                      }
                    : {},
                }}
              >
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 2,
                    }}
                  >
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>{mod.icon}</Box>
                    <StatusBadge status={mod.status} label={mod.statusLabel} />
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', mb: 0.5 }}>
                    {mod.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      color: 'primary.main',
                      fontWeight: 700,
                      display: 'block',
                      mb: 1.5,
                    }}
                  >
                    {mod.code}
                  </Typography>

                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                    {mod.description}
                  </Typography>
                </CardContent>

                <CardActions sx={{ px: 2, pb: 2 }}>
                  {mod.available ? (
                    <Button
                      component={Link}
                      href={mod.href}
                      variant="contained"
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                    >
                      {mod.actionLabel}
                    </Button>
                  ) : (
                    <Button variant="outlined" size="small" disabled>
                      {mod.actionLabel}
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </ProtectedRoute>
  );
}
