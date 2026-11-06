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
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
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
import CancelIcon from '@mui/icons-material/Cancel';
import CategoryIcon from '@mui/icons-material/Category';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HistoryIcon from '@mui/icons-material/History';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import StorefrontIcon from '@mui/icons-material/Storefront';
import EngineeringIcon from '@mui/icons-material/Engineering';
import TimerIcon from '@mui/icons-material/Timer';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import VerifiedIcon from '@mui/icons-material/Verified';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';
import { useAdminDashboard } from '../../../lib/reportingApi';
import { formatNumber, formatPercentage } from '../../../lib/formatters';

export default function AdminPage() {
  const { user } = useAuth();
  const permissions = user?.permissions || [];
  const canViewFinance = permissions.includes('finance:read') || permissions.includes('finance:claims');

  const [preset, setPreset] = useState<'today' | '7d' | '30d' | '90d' | 'custom'>('7d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

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
  const serviceCenterWorkload = data?.serviceCenterWorkload || [];

  return (
    <ProtectedRoute requiredPermission="users:read">
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1600, mx: 'auto' }}>
        {/* Page Header with Real-Time Period Selector */}
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
                  <Typography variant="body2" color="text.secondary">to</Typography>
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
                onClick={() => refetch()}
                disabled={isFetching}
              >
                Refresh
              </Button>
            </Box>
          }
        />

        {/* Loading / Error State Handling */}
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
            {/* Section 1: Operational Health & Network Capacity Overview */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}>
              Operational Health & Network Capacity Metrics
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              {/* 1. Total Active Service Centers */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: 'primary.main' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Active Service Centers
                    </Typography>
                    <StorefrontIcon fontSize="small" color="primary" />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5 }}>
                    {formatNumber(operationalNetwork?.totalActiveServiceCenters ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Authorized ASF franchise network locations
                  </Typography>
                </Paper>
              </Grid>

              {/* 2. Total Active Technicians */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: 'info.main' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Active Field Technicians
                    </Typography>
                    <EngineeringIcon fontSize="small" color="info" />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5, color: 'info.dark' }}>
                    {formatNumber(operationalNetwork?.totalActiveTechnicians ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Certified engineers deployed for field visits
                  </Typography>
                </Paper>
              </Grid>

              {/* 3. Requests Currently Assigned */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: 'secondary.main' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Assigned Across Centers
                    </Typography>
                    <AssignmentIcon fontSize="small" color="secondary" />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5 }}>
                    {formatNumber(operationalNetwork?.assignedRequests ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total jobs assigned to franchise locations
                  </Typography>
                </Paper>
              </Grid>

              {/* 4. Active in Diagnosis / Repair */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: 'warning.main' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Active In Diagnosis / Repair
                    </Typography>
                    <BuildIcon fontSize="small" color="warning" />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5, color: 'warning.dark' }}>
                    {formatNumber(operationalNetwork?.activeJobs ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Technician checked in & actively resolving
                  </Typography>
                </Paper>
              </Grid>

              {/* 5. Awaiting Service Center Ack */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: (operationalNetwork?.awaitingAck || 0) > 0 ? 'warning.main' : 'success.main' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Awaiting Service Center Ack
                    </Typography>
                    <SpeedIcon fontSize="small" color={(operationalNetwork?.awaitingAck || 0) > 0 ? 'warning' : 'success'} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5, color: (operationalNetwork?.awaitingAck || 0) > 0 ? 'warning.dark' : 'text.primary' }}>
                    {formatNumber(operationalNetwork?.awaitingAck ?? kpis?.awaitingAck ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Franchise intake pending SLA acceptance
                  </Typography>
                </Paper>
              </Grid>

              {/* 6. Open Network Backlog */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: 'info.dark' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Open Backlog (Network)
                    </Typography>
                    <HourglassEmptyIcon fontSize="small" color="info" />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5 }}>
                    {formatNumber(operationalNetwork?.openBacklog ?? kpis?.openBacklog ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total incomplete cases in after-sales pipeline
                  </Typography>
                </Paper>
              </Grid>

              {/* 7. Parts-Dependent Backlog (PNA) */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: (operationalNetwork?.pendingParts || 0) > 0 ? 'secondary.main' : 'text.disabled' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Parts-Dependent Backlog
                    </Typography>
                    <InventoryIcon fontSize="small" color="secondary" />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5 }}>
                    {formatNumber(operationalNetwork?.pendingParts ?? kpis?.pendingParts ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Jobs blocked awaiting spare parts dispatch
                  </Typography>
                </Paper>
              </Grid>

              {/* 8. Dispatches In-Transit */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: (operationalNetwork?.dispatchesAwaitingAck || 0) > 0 ? 'warning.dark' : 'success.main' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                      Dispatches In-Transit
                    </Typography>
                    <LocalShippingIcon fontSize="small" color={(operationalNetwork?.dispatchesAwaitingAck || 0) > 0 ? 'warning' : 'success'} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, my: 0.5 }}>
                    {formatNumber(operationalNetwork?.dispatchesAwaitingAck ?? 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Parts shipped, awaiting arrival confirmation
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Section 2: Service Center Workload & Capacity Table */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}>
              Service Center Network Workload & Operational Capacity
            </Typography>

            <Paper variant="outlined" sx={{ mb: 3.5, overflow: 'hidden' }}>
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Service Center / Franchise</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Location Code</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Active Techs</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Open Jobs</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Awaiting Ack</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">In Progress</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Parts Pending</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Completed ({preset})</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">48h Overdue</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Capacity Configuration</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {serviceCenterWorkload.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            No service centers currently configured in franchise master.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      serviceCenterWorkload.map((sc) => (
                        <TableRow key={sc.locationId} hover>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {sc.locationName}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={sc.locationCode} variant="outlined" />
                          </TableCell>
                          <TableCell align="center">
                            <Chip size="small" label={sc.activeTechnicians} color={sc.activeTechnicians > 0 ? 'info' : 'default'} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {sc.assignedOpenJobs}
                          </TableCell>
                          <TableCell align="right">
                            {sc.awaitingAck > 0 ? (
                              <Chip size="small" label={sc.awaitingAck} color="warning" sx={{ height: 20 }} />
                            ) : (
                              <Typography variant="body2" color="text.secondary">0</Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{sc.inProgress}</TableCell>
                          <TableCell align="right">{sc.pendingParts}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                            {sc.completedInPeriod}
                          </TableCell>
                          <TableCell align="right">
                            {sc.overdueJobs > 0 ? (
                              <Chip size="small" label={sc.overdueJobs} color="error" sx={{ height: 20 }} />
                            ) : (
                              <Typography variant="body2" color="text.secondary">0</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Tooltip title="Fixed capacity threshold is unconfigured in Oracle database master. Operations utilize dynamic capacity scheduling based on active technician roster.">
                              <Chip
                                size="small"
                                label="Capacity unconfigured"
                                variant="outlined"
                                color="default"
                                sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}
                              />
                            </Tooltip>
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
              </TableContainer>
            </Paper>

            {/* Section 3: Primary Visual Analytics & Trends */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}>
              Operational Performance & Workflow Trajectory
            </Typography>

            <Grid container spacing={3} sx={{ mb: 3.5 }}>
              {/* Chart A: Service Volume Trend (Registered vs Closed) */}
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
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Registered</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: 'success.main', borderRadius: '2px' }} />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>Closed</Typography>
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
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{maxVal}</Typography>
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>{midVal}</Typography>
                              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>0</Typography>
                            </Box>

                            {/* Chart Bars Area */}
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: { xs: 0.5, sm: 1 }, px: 1, borderLeft: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
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

              {/* Chart B: SLA Compliance with Clear Denominators */}
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
                      <Typography variant="h6" sx={{ fontWeight: 700, color: (charts?.slaCompliance.ack48h.rate || 0) >= 95 ? 'success.main' : 'warning.main' }}>
                        {formatPercentage(charts?.slaCompliance.ack48h.rate)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(charts?.slaCompliance.ack48h.rate || 0, 100)}
                      color={(charts?.slaCompliance.ack48h.rate || 0) >= 95 ? 'success' : 'warning'}
                      sx={{ height: 8, borderRadius: 4, mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary', flexWrap: 'wrap', gap: 0.5 }}>
                      <span>
                        On-time: <strong>{charts?.slaCompliance.ack48h.onTime}</strong> / {charts?.slaCompliance.ack48h.totalEligible} eligible
                      </span>
                      <span>
                        Breached: <strong style={{ color: (charts?.slaCompliance.ack48h.breached || 0) > 0 ? '#d32f2f' : 'inherit' }}>{charts?.slaCompliance.ack48h.breached}</strong>
                      </span>
                      {(charts?.slaCompliance.ack48h.inFlight || 0) > 0 && (
                        <span>
                          In-flight: <strong style={{ color: '#0288d1' }}>{charts?.slaCompliance.ack48h.inFlight}</strong> (within 48h)
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
                      <Typography variant="h6" sx={{ fontWeight: 700, color: (charts?.slaCompliance.resolution168h.rate || 0) >= 90 ? 'success.main' : 'warning.main' }}>
                        {formatPercentage(charts?.slaCompliance.resolution168h.rate)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(charts?.slaCompliance.resolution168h.rate || 0, 100)}
                      color={(charts?.slaCompliance.resolution168h.rate || 0) >= 90 ? 'success' : 'warning'}
                      sx={{ height: 8, borderRadius: 4, mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary' }}>
                      <span>
                        On-time: <strong>{charts?.slaCompliance.resolution168h.onTime}</strong> / {charts?.slaCompliance.resolution168h.totalClosed} closed
                      </span>
                      <span>
                        Breached: <strong style={{ color: (charts?.slaCompliance.resolution168h.breached || 0) > 0 ? '#d32f2f' : 'inherit' }}>{charts?.slaCompliance.resolution168h.breached}</strong>
                      </span>
                    </Box>
                  </Box>

                  {/* Customer Verification Rate */}
                  <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, mt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <VerifiedIcon fontSize="small" color="primary" />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Happy Code Verification
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {formatPercentage(charts?.customerOutcomes.happyCodeVerificationRate)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Average Resolution TAT: <strong>{charts?.customerOutcomes.avgResolutionTatHours || 0} hrs</strong>
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* Section 3: Workflow Distribution & Aging Bottlenecks */}
            <Grid container spacing={3} sx={{ mb: 3.5 }}>
              {/* Chart C: Current Workflow Distribution */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2.5, height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 0.5 }}>
                    Current Workflow Status Distribution
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Active and completed tickets by lifecycle state
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
                          <LinearProgress
                            variant="determinate"
                            value={item.percentage}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
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

              {/* Chart D: Open Backlog Aging Breakdown */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2.5, height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 0.5 }}>
                    Open Backlog Aging & Delays
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Age of active open tickets from registration timestamp
                  </Typography>

                  <Grid container spacing={1.5} sx={{ mb: 2 }}>
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

                  {/* Top Brands / Products Summary */}
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Top Brands by Demand (Period)
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
                </Paper>
              </Grid>
            </Grid>

            {/* Section 4: Actionable Operational Exceptions & Pending Actions */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}>
              Actionable Operational Exceptions & Pending Work
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3.5 }}>
              {/* Overdue SLA Exceptions */}
              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <ErrorOutlineIcon color={(pendingActions?.overdueAckCount || 0) > 0 ? 'error' : 'disabled'} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        SLA Breaches Pending
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5, color: (pendingActions?.overdueAckCount || 0) > 0 ? 'error.main' : 'text.primary' }}>
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

              {/* Replacement & Cancellation Approvals */}
              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <VerifiedIcon color={(pendingActions?.pendingReplacementCount || 0) + (pendingActions?.pendingCancellationCount || 0) > 0 ? 'warning' : 'disabled'} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Pending Approvals
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>
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

              {/* Warehouse PNA Stock Queue */}
              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <InventoryIcon color={(pendingActions?.pendingPnaCount || 0) > 0 ? 'warning' : 'disabled'} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Spare Parts Queue (PNA)
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>
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

              {/* Notifications Dead Letter / Alerts */}
              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <NotificationsActiveIcon color={(pendingActions?.deadLetterNotificationCount || 0) > 0 ? 'error' : 'disabled'} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Dead-Letter Alerts
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5, color: (pendingActions?.deadLetterNotificationCount || 0) > 0 ? 'error.main' : 'text.primary' }}>
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

              {/* Financial Claims Review (Conditional on Finance Permission) */}
              {canViewFinance && pendingActions?.pendingClaimsAuditCount !== undefined && (
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: 4, borderColor: 'primary.main' }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <ReceiptIcon color="primary" />
                        <Typography variant="subtitle2" fontWeight={700}>
                          Claims Pending Audit
                        </Typography>
                      </Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>
                        {pendingActions.pendingClaimsAuditCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Submitted warranty claims awaiting review
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

            {/* Section 5: Recent Operational Activity Stream */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}>
              Recent Operational Activity & State Transitions
            </Typography>

            <Paper sx={{ mb: 3.5, overflow: 'hidden' }}>
              {recentActivity.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell><strong>Job Number</strong></TableCell>
                        <TableCell><strong>Action / Event</strong></TableCell>
                        <TableCell><strong>Workflow Transition</strong></TableCell>
                        <TableCell><strong>Triggered By</strong></TableCell>
                        <TableCell><strong>Remarks / Context</strong></TableCell>
                        <TableCell align="right"><strong>Timestamp</strong></TableCell>
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
                              {new Date(ev.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
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

            {/* Section 6: Administrative Masters & Governance Hub */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase', mb: 1.5 }}>
              Enterprise Master Data & Governance Administration
            </Typography>

            <Grid container spacing={2}>
              {/* Catalog Master Console */}
              <Grid item xs={12} sm={6} md={3}>
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

              {/* User & Security Governance */}
              <Grid item xs={12} sm={6} md={3}>
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
                  <Button
                    variant="outlined"
                    size="small"
                    disabled
                    sx={{ mt: 2 }}
                  >
                    Active via Backend API
                  </Button>
                </Paper>
              </Grid>

              {/* Finance & Claims Hub */}
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <AccountBalanceWalletIcon color="success" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Finance & Wallets
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Brand prepaid reserves, warranty claim settlements, and double-entry ledger.
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
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <AssessmentIcon color="secondary" />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Analytics & Telemetry
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Call register, parts consumption, claims audit, stock valuation, and CSV exports.
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
