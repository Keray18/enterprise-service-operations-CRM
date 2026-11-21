'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// Material Icons
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BuildIcon from '@mui/icons-material/Build';
import CategoryIcon from '@mui/icons-material/Category';
import ClearIcon from '@mui/icons-material/Clear';
import EngineeringIcon from '@mui/icons-material/Engineering';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ReceiptIcon from '@mui/icons-material/Receipt';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import StorefrontIcon from '@mui/icons-material/Storefront';
import VerifiedIcon from '@mui/icons-material/Verified';
import StarIcon from '@mui/icons-material/Star';

import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';
import { useAdminDashboard, useServiceCenterWorkload, ServiceCenterWorkloadRow } from '../../../lib/reportingApi';
import { useCities, useStates } from '../../../lib/catalogApi';
import { formatNumber, formatPercentage } from '../../../lib/formatters';

export default function AdminPage() {
  const { user } = useAuth();
  const permissions = user?.permissions || [];
  const canViewFinance = permissions.includes('finance:read') || permissions.includes('finance:claims');

  // Period state
  const [preset, setPreset] = useState<'today' | '7d' | '30d' | '90d' | 'custom'>('7d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  // Executive Dashboard Query
  const { data, isLoading, error, refetch, isFetching } = useAdminDashboard({
    period: preset,
    fromDate: preset === 'custom' ? customFrom : undefined,
    toDate: preset === 'custom' ? customTo : undefined,
  });

  const kpis = data?.kpis;
  const charts = data?.charts;
  const pendingActions = data?.pendingActions;
  const recentActivity = data?.recentActivity || [];
  const operationalNetwork = data?.operationalNetwork;

  // Section 5: Paginated Service Center Workload Table State
  const [scPage, setScPage] = useState(1);
  const [scLimit, setScLimit] = useState(10);
  const [scSearch, setScSearch] = useState('');
  const [scStateId, setScStateId] = useState('');
  const [scCityId, setScCityId] = useState('');
  const [scStatus, setScStatus] = useState('ACTIVE');
  const [scSortBy, setScSortBy] = useState('assignedOpenJobs');
  const [scSortDir, setScSortDir] = useState<'asc' | 'desc'>('desc');

  const {
    data: scData,
    isLoading: isScLoading,
    isError: isScError,
    error: scError,
    isFetching: isScFetching,
    refetch: refetchSc,
  } = useServiceCenterWorkload({
    page: scPage,
    limit: scLimit,
    search: scSearch.trim() || undefined,
    stateId: scStateId || undefined,
    cityId: scCityId || undefined,
    status: scStatus,
    sortBy: scSortBy,
    sortDir: scSortDir,
  });

  // Defensive normalization: safely handles both { items, pagination } envelope and raw array fallbacks
  const { scItems, scPagination } = React.useMemo(() => {
    if (!scData) {
      return {
        scItems: [] as ServiceCenterWorkloadRow[],
        scPagination: { page: scPage, limit: scLimit, total: 0, totalPages: 0 },
      };
    }
    if (Array.isArray(scData)) {
      return {
        scItems: scData as ServiceCenterWorkloadRow[],
        scPagination: {
          page: scPage,
          limit: scLimit,
          total: scData.length,
          totalPages: Math.ceil(scData.length / scLimit) || 1,
        },
      };
    }
    const rawItems = (scData as any).items;
    const items = Array.isArray(rawItems) ? (rawItems as ServiceCenterWorkloadRow[]) : [];
    const rawPagination = (scData as any).pagination;
    const pagination =
      rawPagination && typeof rawPagination.total === 'number'
        ? rawPagination
        : {
            page: scPage,
            limit: scLimit,
            total: items.length,
            totalPages: Math.ceil(items.length / scLimit) || 1,
          };
    return { scItems: items, scPagination: pagination };
  }, [scData, scPage, scLimit]);

  const { data: statesMaster } = useStates({ page: 1, limit: 100, isActive: 'Y' });
  const { data: citiesMaster } = useCities({
    stateId: scStateId || undefined,
    page: 1,
    limit: 100,
    isActive: 'Y',
  });

  const handleScSort = (column: string) => {
    if (scSortBy === column) {
      setScSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setScSortBy(column);
      setScSortDir('desc');
    }
    setScPage(1);
  };

  const handleResetScFilters = () => {
    setScSearch('');
    setScStateId('');
    setScCityId('');
    setScStatus('ACTIVE');
    setScSortBy('assignedOpenJobs');
    setScSortDir('desc');
    setScPage(1);
  };

  return (
    <ProtectedRoute requiredPermission="users:read">
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1600, mx: 'auto' }}>
        {/* ========================================================================= */}
        {/* SECTION 1: EXECUTIVE OVERVIEW & OPERATIONAL KPIS                          */}
        {/* ========================================================================= */}
        <PageHeader
          title="Enterprise Operations & Executive Administration"
          subtitle="Real-time service request workload, SLA compliance, operational bottlenecks, and administrative governance."
          badge={<StatusBadge status="ACTIVE" label="Enterprise Operations Hub" />}
          actions={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <ToggleButtonGroup
                size="small"
                value={preset}
                exclusive
                onChange={(_, val) => val && setPreset(val)}
                aria-label="reporting period"
              >
                <ToggleButton value="today">Today</ToggleButton>
                <ToggleButton value="7d">Last 7 Days</ToggleButton>
                <ToggleButton value="30d">Last 30 Days</ToggleButton>
                <ToggleButton value="90d">Last 90 Days</ToggleButton>
                <ToggleButton value="custom">Custom</ToggleButton>
              </ToggleButtonGroup>

              {preset === 'custom' && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    type="date"
                    size="small"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    sx={{ width: 140 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    to
                  </Typography>
                  <TextField
                    type="date"
                    size="small"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    sx={{ width: 140 }}
                  />
                </Box>
              )}

              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon sx={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />}
                onClick={() => {
                  refetch();
                  refetchSc();
                }}
                disabled={isFetching || isScFetching}
              >
                Refresh
              </Button>
            </Box>
          }
        />

        {/* Global Loading / Error */}
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Aggregating operational analytics and queue telemetry from Oracle DB...
            </Typography>
          </Box>
        ) : error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
            sx={{ mb: 3 }}
          >
            Failed to load operations dashboard: {(error as Error).message}
          </Alert>
        ) : (
          <>
            {/* 4 Prominent Operational KPI Cards */}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}
            >
              1. Executive Operational KPIs
            </Typography>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              {/* KPI 1: Open Backlog */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  sx={{
                    p: 2.5,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: 5,
                    borderColor: 'info.main',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Open Backlog (Network)
                    </Typography>
                    <HourglassEmptyIcon fontSize="small" color="info" />
                  </Box>
                  <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: 'text.primary' }}>
                    {formatNumber(operationalNetwork?.openBacklog ?? kpis?.openBacklog ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total active, incomplete complaints in service pipeline
                  </Typography>
                </Paper>
              </Grid>

              {/* KPI 2: Awaiting Service Center Ack */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  sx={{
                    p: 2.5,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: 5,
                    borderColor: (operationalNetwork?.awaitingAck || 0) > 0 ? 'warning.main' : 'success.main',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Awaiting Acknowledgment
                    </Typography>
                    <SpeedIcon fontSize="small" color={(operationalNetwork?.awaitingAck || 0) > 0 ? 'warning' : 'success'} />
                  </Box>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 800,
                      my: 0.5,
                      color: (operationalNetwork?.awaitingAck || 0) > 0 ? 'warning.dark' : 'success.main',
                    }}
                  >
                    {formatNumber(operationalNetwork?.awaitingAck ?? kpis?.awaitingAck ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Registered calls awaiting Service Center SLA intake
                  </Typography>
                </Paper>
              </Grid>

              {/* KPI 3: Parts Pending (PNA) */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  sx={{
                    p: 2.5,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: 5,
                    borderColor: (operationalNetwork?.pendingParts || 0) > 0 ? 'secondary.main' : 'text.disabled',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Parts Pending (PNA)
                    </Typography>
                    <InventoryIcon fontSize="small" color="secondary" />
                  </Box>
                  <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: 'secondary.dark' }}>
                    {formatNumber(operationalNetwork?.pendingParts ?? kpis?.pendingParts ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Requests blocked waiting for warehouse spare parts dispatch
                  </Typography>
                </Paper>
              </Grid>

              {/* KPI 4: Dispatches In Transit */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper
                  sx={{
                    p: 2.5,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: 5,
                    borderColor: (operationalNetwork?.dispatchesAwaitingAck || 0) > 0 ? 'warning.dark' : 'success.main',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Dispatches In Transit
                    </Typography>
                    <LocalShippingIcon
                      fontSize="small"
                      color={(operationalNetwork?.dispatchesAwaitingAck || 0) > 0 ? 'warning' : 'success'}
                    />
                  </Box>
                  <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: 'text.primary' }}>
                    {formatNumber(operationalNetwork?.dispatchesAwaitingAck ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Dispatches en route, awaiting Service Center arrival confirmation
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Compact Secondary Statistics Bar */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <StorefrontIcon color="primary" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Active Service Centers
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {formatNumber(operationalNetwork?.totalActiveServiceCenters ?? 0)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <EngineeringIcon color="info" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Active Field Technicians
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.dark' }}>
                        {formatNumber(operationalNetwork?.totalActiveTechnicians ?? 0)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <AssignmentIcon color="secondary" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Assigned Requests
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {formatNumber(operationalNetwork?.assignedRequests ?? 0)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <BuildIcon color="warning" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Active Diagnosis / Repair
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                        {formatNumber(operationalNetwork?.activeJobs ?? 0)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

            {/* ========================================================================= */}
            {/* SECTION 2: PRIORITY OPERATIONAL EXCEPTIONS                                */}
            {/* ========================================================================= */}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}
            >
              2. Priority Operational Exceptions & Actionable Queues
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3.5 }}>
              {/* Exception 1: Overdue SLA Breaches */}
              <Grid item xs={12} sm={6} md={canViewFinance ? 2.4 : 3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <ErrorOutlineIcon color={(pendingActions?.overdueAckCount || 0) > 0 ? 'error' : 'disabled'} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        SLA Breaches
                      </Typography>
                    </Box>
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 800,
                        my: 0.5,
                        color: (pendingActions?.overdueAckCount || 0) > 0 ? 'error.main' : 'text.primary',
                      }}
                    >
                      {(pendingActions?.overdueAckCount || 0) + (pendingActions?.overdueResolutionCount || 0)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {pendingActions?.overdueAckCount || 0} ack overdue, {pendingActions?.overdueResolutionCount || 0} resolution overdue
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 1.5 }}>
                    <Button component={Link} href="/call-center" size="small" endIcon={<ArrowForwardIcon />}>
                      Review in Intake
                    </Button>
                  </CardActions>
                </Card>
              </Grid>

              {/* Exception 2: Pending Approvals */}
              <Grid item xs={12} sm={6} md={canViewFinance ? 2.4 : 3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <VerifiedIcon
                        color={
                          (pendingActions?.pendingReplacementCount || 0) + (pendingActions?.pendingCancellationCount || 0) > 0
                            ? 'warning'
                            : 'disabled'
                        }
                      />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Pending Approvals
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, my: 0.5 }}>
                      {(pendingActions?.pendingReplacementCount || 0) + (pendingActions?.pendingCancellationCount || 0)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {pendingActions?.pendingReplacementCount || 0} replacements, {pendingActions?.pendingCancellationCount || 0} cancellations
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 1.5 }}>
                    <Button component={Link} href="/call-center" size="small" endIcon={<ArrowForwardIcon />}>
                      Open Workflows
                    </Button>
                  </CardActions>
                </Card>
              </Grid>

              {/* Exception 3: Spare Parts PNA Queue */}
              <Grid item xs={12} sm={6} md={canViewFinance ? 2.4 : 3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <InventoryIcon color={(pendingActions?.pendingPnaCount || 0) > 0 ? 'warning' : 'disabled'} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Spare Parts (PNA)
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, my: 0.5 }}>
                      {pendingActions?.pendingPnaCount || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Cases blocked waiting for part shipment
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 1.5 }}>
                    <Button component={Link} href="/warehouse" size="small" endIcon={<ArrowForwardIcon />}>
                      Open Warehouse
                    </Button>
                  </CardActions>
                </Card>
              </Grid>

              {/* Exception 4: Dead-Letter Notification Alerts */}
              <Grid item xs={12} sm={6} md={canViewFinance ? 2.4 : 3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <NotificationsActiveIcon
                        color={(pendingActions?.deadLetterNotificationCount || 0) > 0 ? 'error' : 'disabled'}
                      />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Dead-Letter Alerts
                      </Typography>
                    </Box>
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 800,
                        my: 0.5,
                        color: (pendingActions?.deadLetterNotificationCount || 0) > 0 ? 'error.main' : 'text.primary',
                      }}
                    >
                      {pendingActions?.deadLetterNotificationCount || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Customer SMS/Email dispatch failures
                    </Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 1.5 }}>
                    <Button component={Link} href="/reports" size="small" endIcon={<ArrowForwardIcon />}>
                      View Telemetry
                    </Button>
                  </CardActions>
                </Card>
              </Grid>

              {/* Exception 5: Warranty Claims Audit (Conditional) */}
              {canViewFinance && (
                <Grid item xs={12} sm={6} md={2.4}>
                  <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <ReceiptIcon color="primary" />
                        <Typography variant="subtitle2" fontWeight={700}>
                          Claims Audit
                        </Typography>
                      </Box>
                      <Typography variant="h4" sx={{ fontWeight: 800, my: 0.5 }}>
                        {pendingActions?.pendingClaimsAuditCount ?? 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Submitted claims awaiting audit
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 1.5 }}>
                      <Button component={Link} href="/finance" size="small" endIcon={<ArrowForwardIcon />}>
                        Finance Console
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              )}
            </Grid>

            {/* ========================================================================= */}
            {/* SECTION 3: SERVICE VOLUME & SLA TRENDS                                    */}
            {/* ========================================================================= */}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}
            >
              3. Service Volume & SLA Compliance Trends
            </Typography>

            <Grid container spacing={3} sx={{ mb: 3.5 }}>
              {/* Chart A: Service Volume Trend (SVG Bar Chart) */}
              <Grid item xs={12} lg={8}>
                <Paper sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                        Service Request Volume Trend
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Daily job intake registrations vs successful closures over selected period ({preset})
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: 'primary.main', borderRadius: '2px' }} />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Registered
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: 'success.main', borderRadius: '2px' }} />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Closed
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* SVG Bar Chart Visualization with Y-Axis Scaling */}
                  {charts?.volumeTrend && charts.volumeTrend.length > 0 ? (
                    <Box sx={{ flexGrow: 1, minHeight: 240, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pt: 2 }}>
                      {(() => {
                        const trend = charts.volumeTrend;
                        const maxVal = Math.max(...trend.map((t) => Math.max(t.registered, t.closed)), 5);
                        const midVal = Math.round(maxVal / 2);

                        return (
                          <Box sx={{ display: 'flex', height: 210 }}>
                            {/* Y-Axis Reference Labels */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pr: 1, pb: 3, textAlign: 'right', minWidth: 28 }}>
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                {maxVal}
                              </Typography>
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                {midVal}
                              </Typography>
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                0
                              </Typography>
                            </Box>

                            {/* Chart Bars Area */}
                            <Box
                              sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: { xs: 0.5, sm: 1 },
                                px: 1,
                                borderLeft: '1px solid',
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                              }}
                            >
                              {trend.map((point, idx) => {
                                const regHeight = (point.registered / maxVal) * 160;
                                const closedHeight = (point.closed / maxVal) * 160;
                                const dayLabel = point.date.slice(5); // MM-DD
                                return (
                                  <Box
                                    key={point.date}
                                    sx={{
                                      flex: 1,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      height: '100%',
                                      justifyContent: 'flex-end',
                                    }}
                                  >
                                    <Tooltip
                                      title={`${point.date} — Registered: ${point.registered}, Closed: ${point.closed}`}
                                      arrow
                                    >
                                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', width: '100%', justifyContent: 'center' }}>
                                        {/* Registered Bar */}
                                        <Box
                                          sx={{
                                            width: { xs: '45%', sm: 16 },
                                            height: Math.max(regHeight, 4),
                                            bgcolor: 'primary.main',
                                            borderRadius: '2px 2px 0 0',
                                            transition: 'all 0.2s',
                                            '&:hover': { bgcolor: 'primary.dark' },
                                          }}
                                        />
                                        {/* Closed Bar */}
                                        <Box
                                          sx={{
                                            width: { xs: '45%', sm: 16 },
                                            height: Math.max(closedHeight, 4),
                                            bgcolor: 'success.main',
                                            borderRadius: '2px 2px 0 0',
                                            transition: 'all 0.2s',
                                            '&:hover': { bgcolor: 'success.dark' },
                                          }}
                                        />
                                      </Box>
                                    </Tooltip>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        mt: 1,
                                        fontSize: '0.65rem',
                                        color: 'text.secondary',
                                        display: idx % Math.ceil(trend.length / 10) === 0 ? 'block' : { xs: 'none', sm: 'block' },
                                      }}
                                    >
                                      {dayLabel}
                                    </Typography>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        );
                      })()}
                    </Box>
                  ) : (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        No service request volume recorded in selected timeframe.
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Grid>

              {/* Chart B: SLA Compliance with Defined Denominators */}
              <Grid item xs={12} lg={4}>
                <Paper sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 0.5 }}>
                      SLA Performance Gauges
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Measured against corporate contractual service level agreements
                    </Typography>
                  </Box>

                  {/* 48h Ack SLA */}
                  <Box sx={{ my: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        48-Hour Acknowledgment SLA
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          color: (charts?.slaCompliance?.ack48h?.rate || 0) >= 95 ? 'success.main' : 'warning.main',
                        }}
                      >
                        {formatPercentage(charts?.slaCompliance?.ack48h?.rate)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(charts?.slaCompliance?.ack48h?.rate || 0, 100)}
                      color={(charts?.slaCompliance?.ack48h?.rate || 0) >= 95 ? 'success' : 'warning'}
                      sx={{ height: 8, borderRadius: 4, mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary', flexWrap: 'wrap', gap: 0.5 }}>
                      <span>
                        On-time: <strong>{charts?.slaCompliance?.ack48h?.onTime ?? 0}</strong> / {charts?.slaCompliance?.ack48h?.totalEligible ?? 0} eligible
                      </span>
                      <span>
                        Breached: <strong style={{ color: (charts?.slaCompliance?.ack48h?.breached || 0) > 0 ? '#d32f2f' : 'inherit' }}>{charts?.slaCompliance?.ack48h?.breached ?? 0}</strong>
                      </span>
                      {(charts?.slaCompliance?.ack48h?.inFlight || 0) > 0 && (
                        <span>
                          In-flight: <strong style={{ color: '#0288d1' }}>{charts?.slaCompliance?.ack48h?.inFlight ?? 0}</strong> (within 48h)
                        </span>
                      )}
                    </Box>
                  </Box>

                  <Divider sx={{ my: 1.5 }} />

                  {/* 168h Resolution SLA */}
                  <Box sx={{ my: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        168-Hour (7-Day) Resolution SLA
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          color: (charts?.slaCompliance?.resolution168h?.rate || 0) >= 90 ? 'success.main' : 'warning.main',
                        }}
                      >
                        {formatPercentage(charts?.slaCompliance?.resolution168h?.rate)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(charts?.slaCompliance?.resolution168h?.rate || 0, 100)}
                      color={(charts?.slaCompliance?.resolution168h?.rate || 0) >= 90 ? 'success' : 'warning'}
                      sx={{ height: 8, borderRadius: 4, mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary' }}>
                      <span>
                        On-time: <strong>{charts?.slaCompliance?.resolution168h?.onTime ?? 0}</strong> / {charts?.slaCompliance?.resolution168h?.totalClosed ?? 0} closed
                      </span>
                      <span>
                        Breached: <strong style={{ color: (charts?.slaCompliance?.resolution168h?.breached || 0) > 0 ? '#d32f2f' : 'inherit' }}>{charts?.slaCompliance?.resolution168h?.breached ?? 0}</strong>
                      </span>
                    </Box>
                  </Box>

                  {/* Customer Outcome Verification */}
                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <VerifiedIcon fontSize="small" color="primary" />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Happy Code Verification
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {formatPercentage(charts?.customerOutcomes?.happyCodeVerificationRate)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Average Resolution TAT: <strong>{charts?.customerOutcomes?.avgResolutionTatHours || 0} hrs</strong>
                    </Typography>
                  </Box>

                  {/* Post-Service Customer Feedback Telemetry */}
                  <Box sx={{ p: 1.5, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 1.5, mt: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StarIcon fontSize="small" sx={{ color: '#eab308' }} />
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#166534' }}>
                          Customer Service CSAT
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={charts?.customerOutcomes?.averageCustomerRating && charts.customerOutcomes.averageCustomerRating >= 4 ? 'success' : 'warning'}
                        label={
                          charts?.customerOutcomes?.averageCustomerRating != null
                            ? `${charts.customerOutcomes.averageCustomerRating} / 5.0`
                            : 'No Ratings Yet'
                        }
                        sx={{ fontWeight: 800, height: 22 }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                      <span>
                        Received: <strong>{charts?.customerOutcomes?.feedbackReceived ?? 0}</strong> • Pending: <strong>{charts?.customerOutcomes?.feedbackPending ?? 0}</strong>
                      </span>
                      <span>
                        Low Ratings (&lt;3★): <strong style={{ color: (charts?.customerOutcomes?.lowRatingCases || 0) > 0 ? '#d32f2f' : 'inherit' }}>{charts?.customerOutcomes?.lowRatingCases ?? 0}</strong>
                      </span>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* Workflow Distribution & Aging Breakdown */}
            <Grid container spacing={3} sx={{ mb: 3.5 }}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2.5, height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 0.5 }}>
                    Current Workflow Status Distribution
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Active and completed tickets across workflow states
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    {charts?.workflowDistribution && charts.workflowDistribution.length > 0 ? (
                      charts.workflowDistribution.map((item) => (
                        <Box key={item.status}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              {item.status.replace(/_/g, ' ')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              <strong>{item.count}</strong> ({item.percentage}%)
                            </Typography>
                          </Box>
                          <LinearProgress variant="determinate" value={item.percentage} sx={{ height: 6, borderRadius: 3 }} />
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No active workflow data found.
                      </Typography>
                    )}
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2.5, height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 0.5 }}>
                    Open Backlog Aging & Critical Delays
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Age of active open tickets from registration timestamp
                  </Typography>

                  <Grid container spacing={1.5}>
                    {(charts?.agingBuckets || []).map((b) => {
                      const isCritical = b.bucket.includes('Critical') && b.count > 0;
                      return (
                        <Grid item xs={6} sm={4} key={b.bucket}>
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1.5,
                              textAlign: 'center',
                              bgcolor: isCritical ? 'error.lighter' : 'background.paper',
                              borderColor: isCritical ? 'error.main' : 'divider',
                            }}
                          >
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                              {b.bucket}
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, color: isCritical ? 'error.main' : 'text.primary' }}>
                              {b.count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {b.percentage}% of backlog
                            </Typography>
                          </Paper>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Paper>
              </Grid>
            </Grid>

            {/* ========================================================================= */}
            {/* SECTION 4: NETWORK AND WORKFORCE HEALTH                                   */}
            {/* ========================================================================= */}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}
            >
              4. Network & Workforce Health
            </Typography>

            <Grid container spacing={3} sx={{ mb: 3.5 }}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2.5, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <EngineeringIcon color="primary" />
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                      Field Technician Deployment & Allocation
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Workforce readiness and active operational assignment ratios
                  </Typography>

                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={6}>
                      <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Total Active Technicians
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'info.main' }}>
                          {formatNumber(operationalNetwork?.totalActiveTechnicians ?? 0)}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Avg Load Per Technician
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                          {operationalNetwork?.totalActiveTechnicians && operationalNetwork.totalActiveTechnicians > 0
                            ? ((operationalNetwork.assignedRequests || 0) / operationalNetwork.totalActiveTechnicians).toFixed(1)
                            : '0'}{' '}
                          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b' }}>jobs/tech</span>
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  <Typography variant="caption" color="text.secondary">
                    Technician directory is centrally managed by System Administrator under Location Masters.
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2.5, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <CategoryIcon color="secondary" />
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                      Top Brands & Products by Request Volume
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Leading brands and product categories registered in selected period ({preset})
                  </Typography>

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Top Brands:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    {(charts?.topBrands || []).map((brand) => (
                      <Chip
                        key={brand.brandName}
                        label={`${brand.brandName}: ${brand.count} calls`}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                    ))}
                  </Box>

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Top Product Lines:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {(charts?.topProducts || []).map((prod) => (
                      <Chip
                        key={prod.productName}
                        label={`${prod.productName}: ${prod.count} calls`}
                        size="small"
                        variant="outlined"
                        color="secondary"
                      />
                    ))}
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* ========================================================================= */}
            {/* SECTION 5: SERVICE CENTER WORKLOAD & CAPACITY (PAGINATED)                  */}
            {/* ========================================================================= */}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}
            >
              5. Service Center Network Workload & Capacity (Server-Side Paginated)
            </Typography>

            <Paper variant="outlined" sx={{ mb: 3.5, overflow: 'hidden', borderRadius: 2 }}>
              {/* Filter Toolbar */}
              <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider' }}>
                <Grid container spacing={1.5} alignItems="center">
                  {/* Search Input */}
                  <Grid item xs={12} sm={4} md={3}>
                    <TextField
                      placeholder="Search center name, code, or city..."
                      size="small"
                      fullWidth
                      value={scSearch}
                      onChange={(e) => {
                        setScSearch(e.target.value);
                        setScPage(1);
                      }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          </InputAdornment>
                        ),
                        endAdornment: scSearch ? (
                          <InputAdornment position="end">
                            <ClearIcon
                              fontSize="small"
                              sx={{ cursor: 'pointer', color: 'text.secondary' }}
                              onClick={() => {
                                setScSearch('');
                                setScPage(1);
                              }}
                            />
                          </InputAdornment>
                        ) : null,
                      }}
                    />
                  </Grid>

                  {/* State Filter */}
                  <Grid item xs={6} sm={2.5} md={2}>
                    <Select
                      size="small"
                      fullWidth
                      displayEmpty
                      value={scStateId}
                      onChange={(e) => {
                        setScStateId(e.target.value);
                        setScCityId('');
                        setScPage(1);
                      }}
                    >
                      <MenuItem value="">All States</MenuItem>
                      {(statesMaster?.items || []).map((s) => (
                        <MenuItem key={s.stateId} value={s.stateId}>
                          {s.stateName}
                        </MenuItem>
                      ))}
                    </Select>
                  </Grid>

                  {/* City Filter */}
                  <Grid item xs={6} sm={2.5} md={2}>
                    <Select
                      size="small"
                      fullWidth
                      displayEmpty
                      disabled={!scStateId}
                      value={scCityId}
                      onChange={(e) => {
                        setScCityId(e.target.value);
                        setScPage(1);
                      }}
                    >
                      <MenuItem value="">All Cities</MenuItem>
                      {(citiesMaster?.items || []).map((c) => (
                        <MenuItem key={c.cityId} value={c.cityId}>
                          {c.cityName}
                        </MenuItem>
                      ))}
                    </Select>
                  </Grid>

                  {/* Status Filter */}
                  <Grid item xs={6} sm={2} md={2}>
                    <Select
                      size="small"
                      fullWidth
                      value={scStatus}
                      onChange={(e) => {
                        setScStatus(e.target.value);
                        setScPage(1);
                      }}
                    >
                      <MenuItem value="ACTIVE">Active Centers Only</MenuItem>
                      <MenuItem value="INACTIVE">Inactive Centers</MenuItem>
                      <MenuItem value="ALL">All Centers</MenuItem>
                    </Select>
                  </Grid>

                  {/* Reset Filters & Refetch */}
                  <Grid item xs={6} sm={1} md={3} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <Button variant="outlined" size="small" onClick={handleResetScFilters}>
                      Reset
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<RefreshIcon sx={{ animation: isScFetching ? 'spin 1s linear infinite' : 'none' }} />}
                      onClick={() => refetchSc()}
                      disabled={isScFetching}
                    >
                      Filter
                    </Button>
                  </Grid>
                </Grid>
              </Box>

              {/* Paginated Table */}
              <TableContainer sx={{ minHeight: 280 }}>
                {isScError ? (
                  <Box sx={{ p: 3 }}>
                    <Alert
                      severity="error"
                      action={
                        <Button color="inherit" size="small" onClick={() => refetchSc()}>
                          Retry
                        </Button>
                      }
                    >
                      Failed to load Service Center Workload and Capacity: {scError instanceof Error ? scError.message : 'Please check your connection and try again.'}
                    </Alert>
                  </Box>
                ) : isScLoading ? (
                  <Box sx={{ p: 4 }}>
                    <Skeleton height={40} sx={{ mb: 1 }} />
                    <Skeleton height={40} sx={{ mb: 1 }} />
                    <Skeleton height={40} sx={{ mb: 1 }} />
                    <Skeleton height={40} sx={{ mb: 1 }} />
                    <Skeleton height={40} />
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell>
                          <TableSortLabel
                            active={scSortBy === 'locationName'}
                            direction={scSortBy === 'locationName' ? scSortDir : 'asc'}
                            onClick={() => handleScSort('locationName')}
                          >
                            <strong>Service Center / Franchise</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={scSortBy === 'locationCode'}
                            direction={scSortBy === 'locationCode' ? scSortDir : 'asc'}
                            onClick={() => handleScSort('locationCode')}
                          >
                            <strong>Code</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={scSortBy === 'cityName'}
                            direction={scSortBy === 'cityName' ? scSortDir : 'asc'}
                            onClick={() => handleScSort('cityName')}
                          >
                            <strong>City / State</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="center">
                          <TableSortLabel
                            active={scSortBy === 'activeTechnicians'}
                            direction={scSortBy === 'activeTechnicians' ? scSortDir : 'desc'}
                            onClick={() => handleScSort('activeTechnicians')}
                          >
                            <strong>Active Techs</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">
                          <TableSortLabel
                            active={scSortBy === 'assignedOpenJobs'}
                            direction={scSortBy === 'assignedOpenJobs' ? scSortDir : 'desc'}
                            onClick={() => handleScSort('assignedOpenJobs')}
                          >
                            <strong>Open Jobs</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">
                          <TableSortLabel
                            active={scSortBy === 'awaitingAck'}
                            direction={scSortBy === 'awaitingAck' ? scSortDir : 'desc'}
                            onClick={() => handleScSort('awaitingAck')}
                          >
                            <strong>Awaiting Ack</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">
                          <TableSortLabel
                            active={scSortBy === 'inProgress'}
                            direction={scSortBy === 'inProgress' ? scSortDir : 'desc'}
                            onClick={() => handleScSort('inProgress')}
                          >
                            <strong>In Progress</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">
                          <TableSortLabel
                            active={scSortBy === 'pendingParts'}
                            direction={scSortBy === 'pendingParts' ? scSortDir : 'desc'}
                            onClick={() => handleScSort('pendingParts')}
                          >
                            <strong>Parts Pending</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">
                          <TableSortLabel
                            active={scSortBy === 'overdueJobs'}
                            direction={scSortBy === 'overdueJobs' ? scSortDir : 'desc'}
                            onClick={() => handleScSort('overdueJobs')}
                          >
                            <strong>Overdue</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="center">
                          <strong>Status</strong>
                        </TableCell>
                        <TableCell align="center">
                          <strong>Action</strong>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {!scItems || scItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              No service centers match the specified search or filter criteria.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        scItems.map((sc) => (
                          <TableRow key={sc.locationId} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{sc.locationName}</TableCell>
                            <TableCell>
                              <Chip size="small" label={sc.locationCode} variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {sc.cityName ? `${sc.cityName}, ${sc.stateName || ''}` : sc.stateName || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                size="small"
                                label={sc.activeTechnicians}
                                color={sc.activeTechnicians > 0 ? 'info' : 'default'}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {sc.assignedOpenJobs}
                            </TableCell>
                            <TableCell align="right">
                              {sc.awaitingAck > 0 ? (
                                <Chip size="small" label={sc.awaitingAck} color="warning" sx={{ height: 20 }} />
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  0
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">{sc.inProgress}</TableCell>
                            <TableCell align="right">{sc.pendingParts}</TableCell>
                            <TableCell align="right">
                              {sc.overdueJobs > 0 ? (
                                <Chip size="small" label={sc.overdueJobs} color="error" sx={{ height: 20 }} />
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  0
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                size="small"
                                label={sc.isActive ? 'Active' : 'Inactive'}
                                color={sc.isActive ? 'success' : 'default'}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Button
                                component={Link}
                                href="/service-center"
                                size="small"
                                variant="outlined"
                                sx={{ textTransform: 'none', py: 0.2, fontSize: '0.75rem' }}
                              >
                                View Queue
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </TableContainer>

              {/* Table Pagination */}
              {!isScError && !isScLoading && (
                <TablePagination
                  rowsPerPageOptions={[10, 25, 50]}
                  component="div"
                  count={scPagination.total}
                  rowsPerPage={scLimit}
                  page={Math.max(0, scPage - 1)}
                  onPageChange={(_, newPage) => setScPage(newPage + 1)}
                  onRowsPerPageChange={(e) => {
                    setScLimit(parseInt(e.target.value, 10));
                    setScPage(1);
                  }}
                />
              )}
            </Paper>

            {/* ========================================================================= */}
            {/* SECTION 6: RECENT OPERATIONAL ACTIVITY & GOVERNANCE SHORTCUTS             */}
            {/* ========================================================================= */}
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}
            >
              6. Recent Operational Activity & Governance Administration
            </Typography>

            {/* Activity Stream */}
            <Paper sx={{ mb: 3.5, overflow: 'hidden', borderRadius: 2 }}>
              {recentActivity.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell>
                          <strong>Job Number</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Action / Event</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Workflow Transition</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Triggered By</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Remarks / Context</strong>
                        </TableCell>
                        <TableCell align="right">
                          <strong>Timestamp</strong>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recentActivity.map((ev) => (
                        <TableRow key={ev.eventId} hover>
                          <TableCell>
                            <strong>{ev.jobNumber}</strong>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={ev.eventType.replace(/_/g, ' ')} variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {ev.fromState !== 'NONE' ? ev.fromState : '—'} &rarr; <strong>{ev.toState}</strong>
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="body2">{ev.triggeredByUsername}</Typography>
                              <Chip size="small" label={ev.triggeredByRole} sx={{ height: 18, fontSize: '0.65rem' }} />
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {ev.remarks || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="caption" color="text.secondary">
                              {new Date(ev.createdAt).toLocaleString('en-IN', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No recent service events recorded yet.
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* Governance Hub Quick-Links */}
            <Grid container spacing={2}>
              {/* Catalog Master Console */}
              <Grid item xs={12} sm={6} md={2.4}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <CategoryIcon color="primary" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Catalog Masters
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Brands, Product Taxonomy, Model Matrices, and SLA durations.
                    </Typography>
                  </Box>
                  <Button
                    component={Link}
                    href="/admin/masters"
                    variant="outlined"
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ mt: 2 }}
                  >
                    Open Masters
                  </Button>
                </Paper>
              </Grid>

              {/* Field Engineer Management */}
              <Grid item xs={12} sm={6} md={2.4}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <EngineeringIcon color="warning" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Field Engineers
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Technician accounts, Service Center assignments, and passwords.
                    </Typography>
                  </Box>
                  <Button
                    component={Link}
                    href="/admin/engineers"
                    variant="outlined"
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ mt: 2 }}
                  >
                    Manage Technicians
                  </Button>
                </Paper>
              </Grid>

              {/* User & Security Governance */}
              <Grid item xs={12} sm={6} md={2.4}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <SecurityIcon color="info" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        User & RBAC Security
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Enterprise RBAC matrix, sessions, and Argon2id password security.
                    </Typography>
                  </Box>
                  <Button variant="outlined" size="small" disabled sx={{ mt: 2 }}>
                    Active via Backend API
                  </Button>
                </Paper>
              </Grid>

              {/* Finance & Wallets */}
              <Grid item xs={12} sm={6} md={2.4}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <AccountBalanceWalletIcon color="success" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Finance & Wallets
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Brand prepaid reserves, warranty claim settlements, and ledger.
                    </Typography>
                  </Box>
                  <Button
                    component={Link}
                    href="/finance"
                    variant="outlined"
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ mt: 2 }}
                  >
                    Open Finance
                  </Button>
                </Paper>
              </Grid>

              {/* Reports & Analytics */}
              <Grid item xs={12} sm={6} md={2.4}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <AssessmentIcon color="secondary" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Analytics & Telemetry
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Call register, parts consumption, claims audit, and stock valuation.
                    </Typography>
                  </Box>
                  <Button
                    component={Link}
                    href="/reports"
                    variant="outlined"
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ mt: 2 }}
                  >
                    Open Reports
                  </Button>
                </Paper>
              </Grid>
            </Grid>
          </>
        )}
      </Box>
    </ProtectedRoute>
  );
}
