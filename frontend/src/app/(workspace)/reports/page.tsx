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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// Icons
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { PageHeader } from '../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';
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

export default function ReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<number>(0);

  // Role determinations
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN');
  const isFinance = roles.includes('FINANCE') || isAdmin;
  const isCallCenter = roles.includes('CALL_CENTER');
  const isWarehouse = roles.includes('WAREHOUSE');
  const isAsf = roles.includes('ASF');
  const isBrand = roles.includes('BRAND');

  // Capability flags based on the strict Phase 5 Authorization Matrix
  const canViewCalls = isAdmin || isCallCenter || isFinance || isAsf || isBrand;
  const canViewParts = (isAdmin || isWarehouse || isFinance || isAsf || isBrand) && !isCallCenter;
  const canViewClaims = (isAdmin || isFinance || isBrand || isAsf) && !isCallCenter && !isWarehouse;
  const canViewStock = (isAdmin || isFinance || isWarehouse) && !isCallCenter && !isAsf && !isBrand;
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

  // Queries
  const {
    data: queues,
    isLoading: loadingQueues,
    refetch: refetchQueues,
  } = useOperationalQueues();

  const {
    data: callRecords,
    isLoading: loadingCalls,
    error: callError,
    refetch: refetchCalls,
  } = useCallRegisterReport({
    status: callFilter.status || undefined,
    callType: callFilter.callType || undefined,
    fromDate: callFilter.fromDate || undefined,
    toDate: callFilter.toDate || undefined,
    limit: 500,
  });

  const {
    data: partRecords,
    isLoading: loadingParts,
    error: partsError,
    refetch: refetchParts,
  } = usePartConsumptionReport({
    fromDate: partsFilter.fromDate || undefined,
    toDate: partsFilter.toDate || undefined,
    limit: 500,
  });

  const {
    data: claimRecords,
    isLoading: loadingClaims,
    error: claimsError,
    refetch: refetchClaims,
  } = useWarrantyClaimsReport({
    claimYear: claimsFilter.claimYear ? Number(claimsFilter.claimYear) : undefined,
    claimMonth: claimsFilter.claimMonth ? Number(claimsFilter.claimMonth) : undefined,
    status: claimsFilter.status || undefined,
    limit: 500,
  });

  const {
    data: stockRecords,
    isLoading: loadingStock,
    error: stockError,
    refetch: refetchStock,
  } = useStockValuationReport({
    category: stockCategory || undefined,
    limit: 500,
  });

  const {
    data: notifMetrics,
    isLoading: loadingNotifs,
    refetch: refetchNotifs,
  } = useNotificationMetrics();

  const retryNotifMutation = useRetryNotifications();

  return (
    <ProtectedRoute requiredPermission="reports:view">
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Enterprise Reporting & Telemetry"
          subtitle="Real-time operational registers, financial claims audit, inventory valuation & daemon status"
          badge={<AssessmentIcon color="primary" />}
          actions={
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                refetchQueues();
                if (activeTab === 1) refetchCalls();
                if (activeTab === 2) refetchParts();
                if (activeTab === 3) refetchClaims();
                if (activeTab === 4) refetchStock();
                if (activeTab === 5) refetchNotifs();
              }}
            >
              Refresh
            </Button>
          }
        />

        {/* Navigation Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Operational Queues" icon={<AssessmentIcon />} iconPosition="start" />
            {canViewCalls && <Tab label="Call Register" icon={<PhoneInTalkIcon />} iconPosition="start" />}
            {canViewParts && <Tab label="Part Consumption" icon={<Inventory2Icon />} iconPosition="start" />}
            {canViewClaims && <Tab label="Warranty Claims & Audit" icon={<FactCheckIcon />} iconPosition="start" />}
            {canViewStock && <Tab label="Stock Valuation" icon={<Inventory2Icon />} iconPosition="start" />}
            {canViewNotifications && (
              <Tab label="Notification Telemetry" icon={<NotificationsActiveIcon />} iconPosition="start" />
            )}
          </Tabs>
        </Box>

        {/* Tab 0: Operational Queues Summary */}
        {activeTab === 0 && (
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
                      <Typography variant="h4" fontWeight={700} color={queues.unacknowledgedCalls > 0 ? 'warning.main' : 'text.primary'}>
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
                      <Typography variant="h4" fontWeight={700}>
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
                          <Typography variant="h4" fontWeight={700} color={queues.pendingSlaPenalties > 0 ? 'error.main' : 'text.primary'}>
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

        {/* Tab 1: Universal Call Register */}
        {activeTab === 1 && canViewCalls && (
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
              <Alert severity="error">Failed to load Call Register: {(callError as Error).message}</Alert>
            ) : callRecords && callRecords.length > 0 ? (
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

        {/* Tab 2: Part Consumption & Defect Trends */}
        {activeTab === 2 && canViewParts && (
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
              <Alert severity="error">Failed to load Part Consumption: {(partsError as Error).message}</Alert>
            ) : partRecords && partRecords.length > 0 ? (
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
                        <TableCell align="right">₹{r.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
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

        {/* Tab 3: Warranty Claims & Settlement Audit */}
        {activeTab === 3 && canViewClaims && (
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
              <Alert severity="error">Failed to load Claims: {(claimsError as Error).message}</Alert>
            ) : claimRecords && claimRecords.length > 0 ? (
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
                        <TableCell>{c.asfName}</TableCell>
                        <TableCell>{c.brandName || 'Global'}</TableCell>
                        <TableCell align="right">{c.totalJobsCount}</TableCell>
                        <TableCell align="right">₹{c.grossLaborAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right">₹{c.grossTravelAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right">₹{c.penaltyDeductionAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right"><strong>₹{c.netClaimAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></TableCell>
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

        {/* Tab 4: Inventory Stock Valuation */}
        {activeTab === 4 && canViewStock && (
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
              <Alert severity="error">Failed to load Stock Valuation: {(stockError as Error).message}</Alert>
            ) : stockRecords && stockRecords.length > 0 ? (
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
                      <TableCell align="right"><strong>Unit Price (₹)</strong></TableCell>
                      <TableCell align="right"><strong>Total Valuation (₹)</strong></TableCell>
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
                        <TableCell align="right">₹{s.unitCostPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="right"><strong>₹{s.totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></TableCell>
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

        {/* Tab 5: Notification Outbox Telemetry & Dead-Letter Escalation */}
        {activeTab === 5 && canViewNotifications && (
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
