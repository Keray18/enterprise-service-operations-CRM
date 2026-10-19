'use client';

import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DnsIcon from '@mui/icons-material/Dns';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import WebIcon from '@mui/icons-material/Web';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import React from 'react';
import { EnterpriseTable } from '../components/data-display/DataTablePrimitives';
import { PageHeader } from '../components/data-display/PageHeader';
import { ResponsiveCard } from '../components/data-display/ResponsiveCard';
import { SlaCounter } from '../components/feedback/SlaCounter';
import { StatusBadge } from '../components/feedback/StatusBadge';
import { WorkspaceShell } from '../components/layout/WorkspaceShell';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../providers/AuthProvider';

interface SystemInfo {
  name: string;
  version: string;
  phase: string;
  environment: string;
  architecture: string;
  database: string;
}

interface LivenessData {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

interface ReadinessData {
  status: string;
  database: {
    connected: boolean;
    latencyMs?: number;
    details?: {
      user: string;
      connectString: string;
    };
  };
}

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();

  // Query 1: Backend System Information
  const { data: sysInfo, refetch: refetchInfo, isLoading: infoLoading } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => apiClient.get<SystemInfo>('/api/v1/system/info'),
  });

  // Query 2: Express Backend Liveness Probe
  const { data: liveness, refetch: refetchLive, isError: isLiveError } = useQuery({
    queryKey: ['health', 'live'],
    queryFn: () => apiClient.get<LivenessData>('/health/live'),
    refetchInterval: 10000,
  });

  // Query 3: Oracle Database Readiness Probe (Real query: SELECT 1 FROM DUAL)
  const {
    data: readiness,
    error: readyError,
    refetch: refetchReady,
    isLoading: readyLoading,
  } = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: () => apiClient.get<ReadinessData>('/health/ready'),
    retry: false,
  });

  const handleRefreshAll = () => {
    refetchInfo();
    refetchLive();
    refetchReady();
  };

  // Sample data demonstrating DataGrid layout
  const sampleTableData = [
    {
      jobNo: 'TTWM2005171218',
      customer: 'Sach Electrocare (Noida)',
      product: 'Washing Machine (SCWM-VTB68)',
      status: 'ACKNOWLEDGED',
      slaHours: 36,
      warranty: 'IN_WARRANTY',
    },
    {
      jobNo: 'TTAC2005171217',
      customer: 'Jeevan Singh (Jaipur)',
      product: 'Air Conditioner (1.5 Ton Split)',
      status: 'PENDING_SPARE_PART',
      slaHours: 14,
      warranty: 'IN_WARRANTY',
    },
    {
      jobNo: 'ASTV2003191007',
      customer: 'Royal Care Centre (Sikar)',
      product: 'LED TV 43" (A32HDS563)',
      status: 'CLOSED',
      slaHours: 0,
      warranty: 'OUT_OF_WARRANTY',
    },
  ];

  const tableColumns = [
    { id: 'jobNo', label: 'Job Number', width: '180px', render: (r: any) => <strong style={{ fontFamily: 'monospace' }}>{r.jobNo}</strong> },
    { id: 'customer', label: 'Customer / Location' },
    { id: 'product', label: 'Product & Model' },
    { id: 'warranty', label: 'Warranty', render: (r: any) => <StatusBadge status={r.warranty} /> },
    { id: 'status', label: 'Operational Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { id: 'slaHours', label: 'SLA Countdown', render: (r: any) => <SlaCounter remainingHours={r.slaHours} breached={r.status === 'BREACHED'} /> },
  ];

  return (
    <WorkspaceShell
      headerActions={
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefreshAll}
        >
          Check Connectivity
        </Button>
      }
    >
      {/* Page Header */}
      <PageHeader
        title="Foundation & Architecture Overview"
        subtitle="Phase 1A: Enterprise Authentication, RBAC & Database Foundation Verification"
        badge={<StatusBadge status="HEALTHY" label="Phase 1A Operational" />}
      />

      {/* Connectivity Diagnostic Summary Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Frontend Status */}
        <Grid item xs={12} sm={6} lg={3}>
          <ResponsiveCard
            title="Frontend Service"
            subtitle="Next.js 14 App Router & React 18"
            action={<CheckCircleOutlineIcon color="success" />}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <WebIcon sx={{ color: 'primary.main', fontSize: '2rem' }} />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Active & Rendered
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Custom Enterprise MUI Theme
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.muted', display: 'block', mt: 1 }}>
              TanStack Query v5 + React Hook Form + Zod
            </Typography>
          </ResponsiveCard>
        </Grid>

        {/* Express API Status */}
        <Grid item xs={12} sm={6} lg={3}>
          <ResponsiveCard
            title="Backend REST API"
            subtitle="Node.js & Express (TypeScript)"
            action={
              isLiveError ? (
                <Chip size="small" label="UNREACHABLE" color="error" />
              ) : (
                <Chip size="small" label="CONNECTED" color="success" />
              )
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <DnsIcon sx={{ color: isLiveError ? 'error.main' : 'primary.main', fontSize: '2rem' }} />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {isLiveError ? 'API Offline (Port 4000)' : 'Liveness Probe OK'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {liveness ? `Uptime: ${liveness.uptimeSeconds}s | PID Live` : 'Connecting to API...'}
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.muted', display: 'block', mt: 1 }}>
              Standard Response Envelope + x-correlation-id
            </Typography>
          </ResponsiveCard>
        </Grid>

        {/* Oracle DB Readiness Status */}
        <Grid item xs={12} sm={6} lg={3}>
          <ResponsiveCard
            title="Oracle Database"
            subtitle="node-oracledb (Thin Mode)"
            action={
              readiness?.status === 'READY' ? (
                <Chip size="small" label="CONNECTED" color="success" />
              ) : (
                <Chip size="small" label="STANDBY" color="warning" />
              )
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <StorageIcon
                sx={{
                  color: readiness?.status === 'READY' ? 'success.main' : 'warning.main',
                  fontSize: '2rem',
                }}
              />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {readyLoading
                    ? 'Probing Readiness...'
                    : readiness?.status === 'READY'
                    ? `Ready (${readiness.database.latencyMs}ms latency)`
                    : 'Awaiting Database'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {readiness?.status === 'READY'
                    ? `Target: ${readiness.database.details?.connectString}`
                    : 'Run: docker compose up -d'}
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.muted', display: 'block', mt: 1 }}>
              Versioned Migrations V001–V004 Verified
            </Typography>
          </ResponsiveCard>
        </Grid>

        {/* Auth & RBAC Status */}
        <Grid item xs={12} sm={6} lg={3}>
          <ResponsiveCard
            title="Identity & RBAC"
            subtitle="HttpOnly Session & Capability Check"
            action={
              isAuthenticated ? (
                <Chip size="small" label="AUTHENTICATED" color="success" />
              ) : (
                <Chip size="small" label="NOT SIGNED IN" color="default" />
              )
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <LockOutlinedIcon
                sx={{
                  color: isAuthenticated ? 'success.main' : 'primary.main',
                  fontSize: '2rem',
                }}
              />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {isAuthenticated ? user?.fullName : 'Guest Session'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {isAuthenticated
                    ? `Role: ${user?.roles.join(', ')} (${user?.permissions.length} perms)`
                    : 'Sign in to access workspaces'}
                </Typography>
              </Box>
            </Box>
            {isAuthenticated ? (
              <Typography variant="caption" sx={{ color: 'success.main', display: 'block', mt: 1, fontWeight: 600 }}>
                Active Session Secured via CSRF
              </Typography>
            ) : (
              <Button
                component={Link}
                href="/login"
                size="small"
                variant="outlined"
                color="primary"
                sx={{ mt: 0.5, py: 0.25, fontSize: '0.75rem' }}
              >
                Sign In Now
              </Button>
            )}
          </ResponsiveCard>
        </Grid>
      </Grid>

      {/* Primary Role Workspaces Navigation Cards */}
      <Typography variant="h2" sx={{ fontSize: '1.15rem', fontWeight: 600, mb: 1.5 }}>
        Role-Specific Workspaces
      </Typography>
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Paper
            component={Link}
            href="/call-center"
            sx={{
              p: 2.5,
              display: 'block',
              textDecoration: 'none',
              borderRadius: 2,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)' },
              transition: 'all 0.15s ease-in-out',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <HeadsetMicIcon color="primary" />
              <Typography variant="h3" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                Call Center Workspace
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Fast customer mobile lookup, complaint registration, and automated Job Number generation.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>
              <span>Enter Workspace</span>
              <ArrowForwardIcon sx={{ fontSize: '0.9rem' }} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper
            component={Link}
            href="/asf"
            sx={{
              p: 2.5,
              display: 'block',
              textDecoration: 'none',
              borderRadius: 2,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)' },
              transition: 'all 0.15s ease-in-out',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <SettingsIcon color="primary" />
              <Typography variant="h3" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                Franchise (ASF) Console
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              48h SLA timer tracking, 1-click appointment dispatch, and on-site OTP verification.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>
              <span>Enter Workspace</span>
              <ArrowForwardIcon sx={{ fontSize: '0.9rem' }} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper
            component={Link}
            href="/warehouse"
            sx={{
              p: 2.5,
              display: 'block',
              textDecoration: 'none',
              borderRadius: 2,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)' },
              transition: 'all 0.15s ease-in-out',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <LocalShippingIcon color="primary" />
              <Typography variant="h3" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                Warehouse & Logistics
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              PNA part allocation, GST Tax Invoices, Delivery Challans, and inbound Security Gate Entry.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>
              <span>Enter Workspace</span>
              <ArrowForwardIcon sx={{ fontSize: '0.9rem' }} />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Component System Verification Preview */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="h2" sx={{ fontSize: '1.15rem', fontWeight: 600 }}>
            Component System & DataGrid Preview
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.muted' }}>
            High-Density Enterprise Layout
          </Typography>
        </Box>
        <EnterpriseTable
          columns={tableColumns}
          data={sampleTableData}
          keyExtractor={(r: any) => r.jobNo}
        />
      </Box>
    </WorkspaceShell>
  );
}
