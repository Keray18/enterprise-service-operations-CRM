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
import { EnterpriseTable } from '../../../../components/data-display/DataTablePrimitives';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ResponsiveCard } from '../../../../components/data-display/ResponsiveCard';
import { SlaCounter } from '../../../../components/feedback/SlaCounter';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { apiClient } from '../../../../lib/apiClient';
import { useAuth } from '../../../../providers/AuthProvider';

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

export default function AdminDiagnosticsPage() {
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

  return (
    <ProtectedRoute requiredRole="ADMIN">
      {/* Page Header */}
      <PageHeader
        title="Infrastructure & System Diagnostics"
        subtitle="Internal administrative console for container liveness, Oracle connection pooling, and latency metrics."
        badge={<StatusBadge status="HEALTHY" label="Administrative View Only" />}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshAll}
          >
            Check Connectivity
          </Button>
        }
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
                    : 'Check Oracle Container'}
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.muted', display: 'block', mt: 1 }}>
              Versioned Migrations V001–V013 Applied
            </Typography>
          </ResponsiveCard>
        </Grid>

        {/* Auth & RBAC Status */}
        <Grid item xs={12} sm={6} lg={3}>
          <ResponsiveCard
            title="Identity & RBAC"
            subtitle="HttpOnly Session & Security Policy"
            action={<Chip size="small" label="ACTIVE SESSION" color="success" />}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <LockOutlinedIcon sx={{ color: 'success.main', fontSize: '2rem' }} />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {user?.fullName || 'Administrator'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Roles: {user?.roles.join(', ')} ({user?.permissions.length} perms)
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: 'success.main', display: 'block', mt: 1, fontWeight: 600 }}>
              Session Authenticated via Argon2id & CSRF
            </Typography>
          </ResponsiveCard>
        </Grid>
      </Grid>
    </ProtectedRoute>
  );
}
