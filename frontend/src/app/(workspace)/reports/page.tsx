'use client';

import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

// Icons
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { PageHeader } from '../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';
import { formatCurrency } from '../../../lib/formatters';
import {
  downloadReportCsv,
  useCallRegisterReport,
  useNotificationMetrics,
  useOperationalQueues,
  usePartConsumptionReport,
  useRetryNotifications,
  useStockValuationReport,
  useWarrantyClaimsReport,
} from '../../../lib/reportingApi';
import {
  useDispatches,
  usePendingJobParts,
  useStockReturns,
  useWarehouseDashboard,
} from '../../../lib/warehouseApi';

export type ReportTabKey =
  | 'queues'
  | 'calls'
  | 'parts'
  | 'claims'
  | 'stock'
  | 'warehouse_telemetry'
  | 'notifications';

export default function ReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTabKey>('queues');

  // Role determinations
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN');
  const isFinance = roles.includes('FINANCE') || isAdmin;
  const isCallCenter = roles.includes('CALL_CENTER');
  const isWarehouse = roles.includes('WAREHOUSE');
  const isAsf = roles.includes('ASF');
  const isBrand = roles.includes('BRAND');

  // Capability flags based on strict Phase 5 Authorization Matrix
  const canViewCalls = isAdmin || isCallCenter || isFinance || isAsf || isBrand;
  const canViewParts = (isAdmin || isWarehouse || isFinance || isAsf || isBrand) && !isCallCenter;
  const canViewClaims = (isAdmin || isFinance || isBrand || isAsf) && !isCallCenter && !isWarehouse;
  const canViewStock = (isAdmin || isFinance || isWarehouse) && !isCallCenter && !isAsf && !isBrand;
  const canViewWarehouseTelemetry = isAdmin || isWarehouse;
  const canViewNotifications = isAdmin;

  // Filter States
  const [callFilter, setCallFilter] = useState({
    status: '',
    callType: '',
    fromDate: '',
    toDate: '',
  });

  const [partsFilter, setPartsFilter] = useState({
    fromDate: '',
    toDate: '',
  });

  const [claimsFilter, setClaimsFilter] = useState({
    claimYear: new Date().getFullYear(),
    claimMonth: '',
    status: '',
  });

  const [stockCategory, setStockCategory] = useState<string>('');

  // Pagination states
  const [callPage, setCallPage] = useState(0);
  const [callRowsPerPage, setCallRowsPerPage] = useState(25);

  // Queries (conditioned on tab visibility to avoid unauthorized 403s)
  const {
    data: queues,
    isLoading: loadingQueues,
    refetch: refetchQueues,
  } = useOperationalQueues({ enabled: activeTab === 'queues' });

  const {
    data: callRecords,
    isLoading: loadingCalls,
    error: callError,
    refetch: refetchCalls,
  } = useCallRegisterReport(
    {
      status: callFilter.status || undefined,
      callType: callFilter.callType || undefined,
      fromDate: callFilter.fromDate || undefined,
      toDate: callFilter.toDate || undefined,
      limit: 500,
    },
    { enabled: activeTab === 'calls' && canViewCalls }
  );

  const {
    data: partRecords,
    isLoading: loadingParts,
    error: partsError,
    refetch: refetchParts,
  } = usePartConsumptionReport(
    {
      fromDate: partsFilter.fromDate || undefined,
      toDate: partsFilter.toDate || undefined,
      limit: 500,
    },
    { enabled: activeTab === 'parts' && canViewParts }
  );

  const {
    data: claimRecords,
    isLoading: loadingClaims,
    error: claimsError,
    refetch: refetchClaims,
  } = useWarrantyClaimsReport(
    {
      claimYear: claimsFilter.claimYear ? Number(claimsFilter.claimYear) : undefined,
      claimMonth: claimsFilter.claimMonth ? Number(claimsFilter.claimMonth) : undefined,
      status: claimsFilter.status || undefined,
      limit: 500,
    },
    { enabled: activeTab === 'claims' && canViewClaims }
  );

  const {
    data: stockRecords,
    isLoading: loadingStock,
    error: stockError,
    refetch: refetchStock,
  } = useStockValuationReport(
    {
      category: stockCategory || undefined,
      limit: 500,
    },
    { enabled: activeTab === 'stock' && canViewStock }
  );

  const {
    data: notifMetrics,
    isLoading: loadingNotifs,
    refetch: refetchNotifs,
  } = useNotificationMetrics({ enabled: activeTab === 'notifications' && canViewNotifications });

  // Warehouse Telemetry Queries
  const { data: warehouseDash, refetch: refetchWarehouseDash } = useWarehouseDashboard();
  const { data: inTransitDispatches, refetch: refetchInTransit } = useDispatches({
    status: 'IN_TRANSIT',
    limit: 100,
  });
  const { data: pendingPartsPna, refetch: refetchPendingParts } = usePendingJobParts({ limit: 100 });
  const { data: stockReturnsData, refetch: refetchReturns } = useStockReturns({ limit: 100 });

  const retryNotifMutation = useRetryNotifications();

  // Tab definitions with deterministic string keys
  const visibleTabs: Array<{ key: ReportTabKey; label: string; icon: React.ReactElement }> = [
    { key: 'queues', label: 'Operational Queues', icon: <AssessmentIcon /> },
    ...(canViewCalls ? [{ key: 'calls' as const, label: 'Call Register', icon: <PhoneInTalkIcon /> }] : []),
    ...(canViewParts ? [{ key: 'parts' as const, label: 'Part Consumption', icon: <Inventory2Icon /> }] : []),
    ...(canViewClaims ? [{ key: 'claims' as const, label: 'Warranty Claims & Audit', icon: <FactCheckIcon /> }] : []),
    ...(canViewStock ? [{ key: 'stock' as const, label: 'Stock Valuation', icon: <Inventory2Icon /> }] : []),
    ...(canViewWarehouseTelemetry
      ? [{ key: 'warehouse_telemetry' as const, label: 'Warehouse Telemetry', icon: <LocalShippingIcon /> }]
      : []),
    ...(canViewNotifications
      ? [{ key: 'notifications' as const, label: 'Notification Telemetry', icon: <NotificationsActiveIcon /> }]
      : []),
  ];

  const handleRefresh = () => {
    if (activeTab === 'queues') refetchQueues();
    if (activeTab === 'calls') refetchCalls();
    if (activeTab === 'parts') refetchParts();
    if (activeTab === 'claims') refetchClaims();
    if (activeTab === 'stock') refetchStock();
    if (activeTab === 'warehouse_telemetry') {
      refetchWarehouseDash();
      refetchInTransit();
      refetchPendingParts();
      refetchReturns();
    }
    if (activeTab === 'notifications') refetchNotifs();
  };

  return (
    <ProtectedRoute requiredPermission="reports:view">
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Enterprise Reporting & Telemetry"
          subtitle="Real-time operational registers, financial claims audit, inventory valuation & logistics telemetry"
          badge={<AssessmentIcon color="primary" />}
          actions={
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh}>
              Refresh
            </Button>
          }
        />

        {/* Deterministic String-Keyed Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {visibleTabs.map((t) => (
              <Tab
                key={t.key}
                value={t.key}
                label={t.label}
                icon={t.icon}
                iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600 }}
              />
            ))}
          </Tabs>
        </Box>

        {/* ========================================================================= */}
        {/* Tab: Operational Queues Summary */}
        {/* ========================================================================= */}
        {activeTab === 'queues' && (
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Operational Queues & Live SLA Timers
            </Typography>
            {loadingQueues ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : queues ? (
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: queues.unacknowledgedCalls > 0 ? '#fff3e0' : undefined }}>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2" gutterBottom>
                        Unacknowledged Calls (48h SLA)
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight={700}
                        color={queues.unacknowledgedCalls > 0 ? 'warning.main' : 'text.primary'}
                      >
                        {queues.unacknowledgedCalls}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Tickets pending franchise acceptance
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2" gutterBottom>
                        Pending Diagnosis
                      </Typography>
                      <Typography variant="h4" fontWeight={700}>
                        {queues.pendingDiagnosis}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Technician on-site inspection pending
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2" gutterBottom>
                        Pending Spare Parts (PNA)
                      </Typography>
                      <Typography variant="h4" fontWeight={700} color="secondary.main">
                        {queues.pendingSpareParts}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Indents awaiting warehouse dispatch
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2" gutterBottom>
                        Pending Closures (168h SLA)
                      </Typography>
                      <Typography variant="h4" fontWeight={700}>
                        {queues.pendingClosures}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Repaired calls awaiting Happy Code
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                {canViewClaims && (
                  <>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card sx={{ bgcolor: queues.pendingSlaPenalties > 0 ? '#fbe9e7' : undefined }}>
                        <CardContent>
                          <Typography color="textSecondary" variant="body2" gutterBottom>
                            SLA Penalties in Review
                          </Typography>
                          <Typography
                            variant="h4"
                            fontWeight={700}
                            color={queues.pendingSlaPenalties > 0 ? 'error.main' : 'text.primary'}
                          >
                            {queues.pendingSlaPenalties}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Breaches awaiting Finance review
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" variant="body2" gutterBottom>
                            Pending Claim Batches
                          </Typography>
                          <Typography variant="h4" fontWeight={700}>
                            {queues.pendingClaimAudits}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Remuneration claims awaiting audit
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </>
                )}
              </Grid>
            ) : null}
          </Box>
        )}

        {/* ========================================================================= */}
        {/* Tab: Universal Call Register */}
        {/* ========================================================================= */}
        {activeTab === 'calls' && canViewCalls && (
          <Box>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Status"
                    value={callFilter.status}
                    onChange={(e) => setCallFilter({ ...callFilter, status: e.target.value })}
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    <MenuItem value="REGISTERED">REGISTERED</MenuItem>
                    <MenuItem value="ASSIGNED_TO_ASF">ASSIGNED_TO_ASF</MenuItem>
                    <MenuItem value="IN_PROGRESS">IN_PROGRESS</MenuItem>
                    <MenuItem value="PENDING_PARTS">PENDING_PARTS</MenuItem>
                    <MenuItem value="CLOSED">CLOSED</MenuItem>
                    <MenuItem value="CANCELLED">CANCELLED</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Call Type"
                    value={callFilter.callType}
                    onChange={(e) => setCallFilter({ ...callFilter, callType: e.target.value })}
                  >
                    <MenuItem value="">All Call Types</MenuItem>
                    <MenuItem value="INSTALLATION">INSTALLATION</MenuItem>
                    <MenuItem value="REPAIR">REPAIR</MenuItem>
                    <MenuItem value="DEMO">DEMO</MenuItem>
                    <MenuItem value="PREVENTIVE_MAINTENANCE">PREVENTIVE_MAINTENANCE</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="date"
                    fullWidth
                    size="small"
                    label="From Date"
                    InputLabelProps={{ shrink: true }}
                    value={callFilter.fromDate}
                    onChange={(e) => setCallFilter({ ...callFilter, fromDate: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="date"
                    fullWidth
                    size="small"
                    label="To Date"
                    InputLabelProps={{ shrink: true }}
                    value={callFilter.toDate}
                    onChange={(e) => setCallFilter({ ...callFilter, toDate: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadReportCsv('/api/v1/reports/calls/export', callFilter)}
                  >
                    Export Call Register (CSV)
                  </Button>
                </Grid>
              </Grid>
            </Paper>

            {loadingCalls ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : callError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => refetchCalls()}>
                    Retry
                  </Button>
                }
              >
                Failed to load Call Register: {(callError as Error).message}
              </Alert>
            ) : Array.isArray(callRecords) && callRecords.length > 0 ? (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell><strong>Job Number</strong></TableCell>
                      <TableCell><strong>Registered At</strong></TableCell>
                      <TableCell><strong>Customer</strong></TableCell>
                      <TableCell><strong>Brand / Product</strong></TableCell>
                      <TableCell><strong>Call Type</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Franchise</strong></TableCell>
                      <TableCell><strong>Engineer</strong></TableCell>
                      <TableCell><strong>48h SLA</strong></TableCell>
                      <TableCell><strong>168h SLA</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {callRecords
                      .slice(callPage * callRowsPerPage, callPage * callRowsPerPage + callRowsPerPage)
                      .map((row) => (
                        <TableRow key={row.requestId} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {row.jobNumber}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {row.serialNumber || 'No Serial'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {new Date(row.registeredAt).toLocaleDateString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{row.customerName}</Typography>
                            <Typography variant="caption" color="textSecondary">
                              {row.customerPhone} ({row.customerCity})
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{row.brandName}</Typography>
                            <Typography variant="caption" color="textSecondary">
                              {row.productName} - {row.modelName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={row.callType} variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.status}
                              color={row.status === 'CLOSED' ? 'success' : row.status === 'CANCELLED' ? 'default' : 'primary'}
                            />
                          </TableCell>
                          <TableCell>{row.assignedLocation || 'Unassigned'}</TableCell>
                          <TableCell>{row.assignedEngineer || 'Unassigned'}</TableCell>
                          <TableCell>
                            {row.slaBreached48h === 'Y' ? (
                              <Chip size="small" label="Breached" color="error" />
                            ) : (
                              <Chip size="small" label="OK" color="success" variant="outlined" />
                            )}
                          </TableCell>
                          <TableCell>
                            {row.slaBreached168h === 'Y' ? (
                              <Chip size="small" label="Breached" color="error" />
                            ) : (
                              <Chip size="small" label="OK" color="success" variant="outlined" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div"
                  count={callRecords.length}
                  page={callPage}
                  onPageChange={(_, p) => setCallPage(p)}
                  rowsPerPage={callRowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setCallRowsPerPage(parseInt(e.target.value, 10));
                    setCallPage(0);
                  }}
                />
              </TableContainer>
            ) : (
              <Alert severity="info">No service calls match the selected filters.</Alert>
            )}
          </Box>
        )}

        {/* ========================================================================= */}
        {/* Tab: Part Consumption & Defect Trends */}
        {/* ========================================================================= */}
        {activeTab === 'parts' && canViewParts && (
          <Box>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField
                    type="date"
                    fullWidth
                    size="small"
                    label="From Date"
                    InputLabelProps={{ shrink: true }}
                    value={partsFilter.fromDate}
                    onChange={(e) => setPartsFilter({ ...partsFilter, fromDate: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    type="date"
                    fullWidth
                    size="small"
                    label="To Date"
                    InputLabelProps={{ shrink: true }}
                    value={partsFilter.toDate}
                    onChange={(e) => setPartsFilter({ ...partsFilter, toDate: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={4} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadReportCsv('/api/v1/reports/parts-consumption/export', partsFilter)}
                  >
                    Export Parts (CSV)
                  </Button>
                </Grid>
              </Grid>
            </Paper>

            {loadingParts ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : partsError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => refetchParts()}>
                    Retry
                  </Button>
                }
              >
                Failed to load Part Consumption: {(partsError as Error).message}
              </Alert>
            ) : Array.isArray(partRecords) && partRecords.length > 0 ? (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell><strong>Part Code</strong></TableCell>
                      <TableCell><strong>Part Name</strong></TableCell>
                      <TableCell><strong>Brand</strong></TableCell>
                      <TableCell align="right"><strong>Consumed Qty</strong></TableCell>
                      <TableCell><strong>Fault / Defect Pattern</strong></TableCell>
                      <TableCell><strong>Franchise Center</strong></TableCell>
                      <TableCell align="right"><strong>Total Cost (₹)</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {partRecords.map((r, i) => (
                      <TableRow key={i} hover>
                        <TableCell><strong>{r.partCode}</strong></TableCell>
                        <TableCell>{r.partName}</TableCell>
                        <TableCell>{r.brandName}</TableCell>
                        <TableCell align="right"><strong>{r.quantityConsumed}</strong></TableCell>
                        <TableCell>
                          <Typography variant="body2">{r.faultDescription || 'General Defect'}</Typography>
                          <Typography variant="caption" color="textSecondary">{r.defectDescription || '-'}</Typography>
                        </TableCell>
                        <TableCell>{r.consumedAtLocation}</TableCell>
                        <TableCell align="right">{formatCurrency(r.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No parts consumption records found for the period.</Alert>
            )}
          </Box>
        )}

        {/* ========================================================================= */}
        {/* Tab: Warranty Claims & Settlement Audit */}
        {/* ========================================================================= */}
        {activeTab === 'claims' && canViewClaims && (
          <Box>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <TextField
                    type="number"
                    fullWidth
                    size="small"
                    label="Claim Year"
                    value={claimsFilter.claimYear}
                    onChange={(e) => setClaimsFilter({ ...claimsFilter, claimYear: Number(e.target.value) })}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Claim Month"
                    value={claimsFilter.claimMonth}
                    onChange={(e) => setClaimsFilter({ ...claimsFilter, claimMonth: e.target.value })}
                  >
                    <MenuItem value="">All Months</MenuItem>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <MenuItem key={m} value={m}>
                        Month {m}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Status"
                    value={claimsFilter.status}
                    onChange={(e) => setClaimsFilter({ ...claimsFilter, status: e.target.value })}
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    <MenuItem value="SUBMITTED">SUBMITTED</MenuItem>
                    <MenuItem value="APPROVED">APPROVED</MenuItem>
                    <MenuItem value="POSTED">POSTED</MenuItem>
                    <MenuItem value="SETTLED">SETTLED</MenuItem>
                    <MenuItem value="REJECTED">REJECTED</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadReportCsv('/api/v1/reports/warranty-claims/export', claimsFilter)}
                  >
                    Export Claims (CSV)
                  </Button>
                </Grid>
              </Grid>
            </Paper>

            {loadingClaims ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : claimsError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => refetchClaims()}>
                    Retry
                  </Button>
                }
              >
                Failed to load Claims: {(claimsError as Error).message}
              </Alert>
            ) : Array.isArray(claimRecords) && claimRecords.length > 0 ? (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell><strong>Claim Number</strong></TableCell>
                      <TableCell><strong>Period</strong></TableCell>
                      <TableCell><strong>Franchise Center</strong></TableCell>
                      <TableCell><strong>Brand</strong></TableCell>
                      <TableCell align="right"><strong>Jobs</strong></TableCell>
                      <TableCell align="right"><strong>Gross Labor</strong></TableCell>
                      <TableCell align="right"><strong>Travel</strong></TableCell>
                      <TableCell align="right"><strong>Deductions</strong></TableCell>
                      <TableCell align="right"><strong>Net Claim</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {claimRecords.map((c, i) => (
                      <TableRow key={i} hover>
                        <TableCell><strong>{c.claimNumber}</strong></TableCell>
                        <TableCell>{c.claimPeriod}</TableCell>
                        <TableCell>{c.asfName || c.asfLocationName}</TableCell>
                        <TableCell>{c.brandName || 'Global'}</TableCell>
                        <TableCell align="right">{c.totalJobsCount}</TableCell>
                        <TableCell align="right">{formatCurrency(c.grossLaborAmount)}</TableCell>
                        <TableCell align="right">{formatCurrency(c.grossTravelAmount)}</TableCell>
                        <TableCell align="right">{formatCurrency(c.penaltyDeductionAmount)}</TableCell>
                        <TableCell align="right"><strong>{formatCurrency(c.netClaimAmount)}</strong></TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={c.status}
                            color={c.status === 'SETTLED' ? 'success' : c.status === 'POSTED' ? 'primary' : c.status === 'REJECTED' ? 'error' : 'warning'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No warranty claims match the criteria.</Alert>
            )}
          </Box>
        )}

        {/* ========================================================================= */}
        {/* Tab: Inventory Stock Valuation */}
        {/* ========================================================================= */}
        {activeTab === 'stock' && canViewStock && (
          <Box>
            <Paper sx={{ p: 2, mb: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Part Category"
                    value={stockCategory}
                    onChange={(e) => setStockCategory(e.target.value)}
                  >
                    <MenuItem value="">All Categories</MenuItem>
                    <MenuItem value="SPARE">Spare Parts</MenuItem>
                    <MenuItem value="ACCESSORY">Accessories</MenuItem>
                    <MenuItem value="MODULE">Modules</MenuItem>
                    <MenuItem value="CONSUMABLE">Consumables</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={() => downloadReportCsv('/api/v1/reports/stock-valuation/export', { category: stockCategory })}
                  >
                    Export Stock Valuation (CSV)
                  </Button>
                </Grid>
              </Grid>
            </Paper>

            {loadingStock ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : stockError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => refetchStock()}>
                    Retry
                  </Button>
                }
              >
                Failed to load Stock Valuation: {(stockError as Error).message}
              </Alert>
            ) : Array.isArray(stockRecords) && stockRecords.length > 0 ? (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell><strong>Location</strong></TableCell>
                      <TableCell><strong>Type</strong></TableCell>
                      <TableCell><strong>Part Code</strong></TableCell>
                      <TableCell><strong>Part Name</strong></TableCell>
                      <TableCell align="right"><strong>On Hand</strong></TableCell>
                      <TableCell align="right"><strong>Reserved</strong></TableCell>
                      <TableCell align="right"><strong>Available</strong></TableCell>
                      <TableCell align="right"><strong>Unit Price</strong></TableCell>
                      <TableCell align="right"><strong>Total Valuation</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stockRecords.map((s, i) => (
                      <TableRow key={i} hover>
                        <TableCell><strong>{s.locationName}</strong></TableCell>
                        <TableCell><Chip size="small" label={s.locationType} variant="outlined" /></TableCell>
                        <TableCell><strong>{s.partCode}</strong></TableCell>
                        <TableCell>{s.partName}</TableCell>
                        <TableCell align="right">{s.onHandQuantity}</TableCell>
                        <TableCell align="right">{s.reservedQuantity}</TableCell>
                        <TableCell align="right"><strong>{s.availableQuantity}</strong></TableCell>
                        <TableCell align="right">{formatCurrency(s.unitCostPrice)}</TableCell>
                        <TableCell align="right"><strong>{formatCurrency(s.totalValuation)}</strong></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">No inventory balances found.</Alert>
            )}
          </Box>
        )}

        {/* ========================================================================= */}
        {/* Tab: Warehouse Operational Telemetry (Part 4) */}
        {/* ========================================================================= */}
        {activeTab === 'warehouse_telemetry' && canViewWarehouseTelemetry && (
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Logistics & Fulfillment Operational Telemetry
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
              Real-time monitoring of in-transit delivery challans, PNA job fulfillment backlog, and defective quarantine returns.
            </Typography>

            {/* Warehouse Telemetry KPI Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ borderLeft: 4, borderColor: 'warning.main' }}>
                  <CardContent>
                    <Typography color="textSecondary" variant="body2">
                      In-Transit Dispatches
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="warning.dark">
                      {inTransitDispatches?.total ?? 0}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Awaiting delivery acknowledgement at ASF
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ borderLeft: 4, borderColor: 'secondary.main' }}>
                  <CardContent>
                    <Typography color="textSecondary" variant="body2">
                      PNA Fulfillments Pending
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="secondary.main">
                      {pendingPartsPna?.total ?? 0}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Jobs waiting for spare-part dispatch
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ borderLeft: 4, borderColor: 'error.main' }}>
                  <CardContent>
                    <Typography color="textSecondary" variant="body2">
                      Quarantine Returns
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="error.main">
                      {stockReturnsData?.total ?? 0}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Defective parts returned for scrap/vendor
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ borderLeft: 4, borderColor: 'primary.main' }}>
                  <CardContent>
                    <Typography color="textSecondary" variant="body2">
                      Reserved Stock Units
                    </Typography>
                    <Typography variant="h4" fontWeight={700} color="primary.main">
                      {warehouseDash?.kpis?.totalStockReserved ?? 0}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Committed against active service requests
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* In-Transit Dispatches Telemetry */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ mt: 2 }}>
              Active In-Transit Dispatches Awaiting Destination Receipt
            </Typography>
            <TableContainer component={Paper} sx={{ mb: 4 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell><strong>Challan #</strong></TableCell>
                    <TableCell><strong>Linked Job</strong></TableCell>
                    <TableCell><strong>Destination Franchise</strong></TableCell>
                    <TableCell><strong>Dispatched On</strong></TableCell>
                    <TableCell><strong>Carrier & Tracking</strong></TableCell>
                    <TableCell align="right"><strong>Taxable Value (₹)</strong></TableCell>
                    <TableCell align="right"><strong>Total Amount (₹)</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(inTransitDispatches?.items || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="textSecondary">
                          No dispatches currently in-transit. All shipments acknowledged at destination.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (inTransitDispatches?.items || []).map((d) => (
                      <TableRow key={d.dispatchId} hover>
                        <TableCell><strong>{d.challanNumber || d.dispatchNumber}</strong></TableCell>
                        <TableCell>{d.jobNumber ? `#${d.jobNumber}` : 'Stock Transfer'}</TableCell>
                        <TableCell>{d.toLocationName || d.toLocationId}</TableCell>
                        <TableCell>{d.dispatchedAt ? new Date(d.dispatchedAt).toLocaleDateString() : 'N/A'}</TableCell>
                        <TableCell>
                          {d.transporterName || d.dispatchMode}
                          {d.docketNo && <Typography variant="caption" display="block">AWB: {d.docketNo}</Typography>}
                        </TableCell>
                        <TableCell align="right">₹{(d.subtotalTaxable ?? d.subtotalAmount ?? 0).toFixed(2)}</TableCell>
                        <TableCell align="right"><strong>₹{(d.totalAmount ?? 0).toFixed(2)}</strong></TableCell>
                        <TableCell>
                          <Chip size="small" label={d.status} color="warning" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* PNA Fulfillment Queue Telemetry */}
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              PNA Spare Parts Fulfillment Backlog
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell><strong>Job Number</strong></TableCell>
                    <TableCell><strong>Part Code</strong></TableCell>
                    <TableCell><strong>Part Description</strong></TableCell>
                    <TableCell align="right"><strong>Requested Qty</strong></TableCell>
                    <TableCell><strong>Destination Location</strong></TableCell>
                    <TableCell><strong>Requested Date</strong></TableCell>
                    <TableCell><strong>Fulfillment Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(pendingPartsPna?.items || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="textSecondary">
                          Zero pending PNA part requests. Warehouse fulfillment queue is fully cleared.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (pendingPartsPna?.items || []).map((p) => (
                      <TableRow key={p.partEntryId} hover>
                        <TableCell><strong>#{p.jobNumber}</strong></TableCell>
                        <TableCell><code>{p.partCode}</code></TableCell>
                        <TableCell>{p.partName}</TableCell>
                        <TableCell align="right"><strong>{p.quantity}</strong></TableCell>
                        <TableCell>{p.assignedLocationName || p.assignedLocationId || 'Regional ASF'}</TableCell>
                        <TableCell>{p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : 'N/A'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={p.status} color="secondary" variant="outlined" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ========================================================================= */}
        {/* Tab: Notification Outbox Telemetry & Dead-Letter Escalation */}
        {/* ========================================================================= */}
        {activeTab === 'notifications' && canViewNotifications && (
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Encrypted Notification Outbox Telemetry
            </Typography>
            {loadingNotifs ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : notifMetrics ? (
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2">Pending Dispatch</Typography>
                      <Typography variant="h4" fontWeight={700} color="primary.main">
                        {notifMetrics.pendingCount}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2">Successfully Sent</Typography>
                      <Typography variant="h4" fontWeight={700} color="success.main">
                        {notifMetrics.sentCount}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: notifMetrics.failedCount > 0 ? '#fff3e0' : undefined }}>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2">Eligible For Retry</Typography>
                      <Typography variant="h4" fontWeight={700} color="warning.main">
                        {notifMetrics.failedCount}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ bgcolor: notifMetrics.deadLetterCount > 0 ? '#fbe9e7' : undefined }}>
                    <CardContent>
                      <Typography color="textSecondary" variant="body2">Dead-Letter Queue</Typography>
                      <Typography variant="h4" fontWeight={700} color="error.main">
                        {notifMetrics.deadLetterCount}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body1" fontWeight={600}>
                        Outbox Daemon Retry Worker
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        The background worker retries failed dispatches with exponential backoff and escalates to DEAD_LETTER after 5 attempts.
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      color="secondary"
                      startIcon={<SendIcon />}
                      disabled={retryNotifMutation.isPending}
                      onClick={() => retryNotifMutation.mutate()}
                    >
                      {retryNotifMutation.isPending ? 'Executing...' : 'Trigger Retry Cycle Now'}
                    </Button>
                  </Paper>
                </Grid>
              </Grid>
            ) : null}
          </Box>
        )}
      </Box>
    </ProtectedRoute>
  );
}
