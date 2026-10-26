'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
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
import Alert from '@mui/material/Alert';

import AssessmentIcon from '@mui/icons-material/Assessment';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HistoryIcon from '@mui/icons-material/History';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InventoryIcon from '@mui/icons-material/Inventory';

import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';

import {
  GoodsReceipt,
  InventoryBalance,
  PendingJobPart,
  StockDispatch,
  StockReturn,
  useAcknowledgeDispatch,
  useDispatches,
  useGoodsReceipts,
  useInventoryMovements,
  usePendingJobParts,
  useReservePart,
  useStockBalances,
  useStockReturns,
  useWarehouseDashboard,
} from '../../../lib/warehouseApi';

import { GrnModal } from './components/GrnModal';
import { DispatchModal } from './components/DispatchModal';
import { DeliveryChallanModal } from './components/DeliveryChallanModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { DefectiveReturnModal } from './components/DefectiveReturnModal';
import { DispositionModal } from './components/DispositionModal';
import { ReconciliationModal } from './components/ReconciliationModal';

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<number>(0);

  // Filters & Pagination for Stock Balances
  const [stockSearch, setStockSearch] = useState('');
  const [stockLocationId, setStockLocationId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [stockPage, setStockPage] = useState(0);
  const [stockLimit, setStockLimit] = useState(20);

  // Pagination for other tabs
  const [pnaPage, setPnaPage] = useState(0);
  const [grnPage, setGrnPage] = useState(0);
  const [dispatchPage, setDispatchPage] = useState(0);
  const [returnPage, setReturnPage] = useState(0);
  const [movementPage, setMovementPage] = useState(0);

  // Modals state
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  // Selected items for detail modals
  const [selectedPendingPart, setSelectedPendingPart] = useState<PendingJobPart | null>(null);
  const [selectedChallanDispatch, setSelectedChallanDispatch] = useState<StockDispatch | null>(null);
  const [selectedReconcileBalance, setSelectedReconcileBalance] = useState<InventoryBalance | null>(null);
  const [selectedDispositionReturn, setSelectedDispositionReturn] = useState<StockReturn | null>(null);

  // Pre-populated adjustment target
  const [adjustTargetPartId, setAdjustTargetPartId] = useState<string | undefined>(undefined);
  const [adjustTargetLocationId, setAdjustTargetLocationId] = useState<string | undefined>(undefined);

  // Queries & Mutations
  const {
    data: dashboard,
    refetch: refetchDashboard,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    error: dashboardError,
  } = useWarehouseDashboard();
  const { data: stockData, isLoading: isStockLoading, refetch: refetchStock } = useStockBalances({
    locationId: stockLocationId || undefined,
    search: stockSearch || undefined,
    lowStockOnly,
    page: stockPage + 1,
    limit: stockLimit,
  });

  const { data: pnaData, isLoading: isPnaLoading, refetch: refetchPna } = usePendingJobParts({
    page: pnaPage + 1,
    limit: 20,
  });

  const { data: grnData, isLoading: isGrnLoading } = useGoodsReceipts({
    page: grnPage + 1,
    limit: 20,
  });

  const { data: dispatchData, isLoading: isDispatchLoading } = useDispatches({
    page: dispatchPage + 1,
    limit: 20,
  });

  const { data: returnData, isLoading: isReturnLoading } = useStockReturns({
    page: returnPage + 1,
    limit: 20,
  });

  const { data: movementData, isLoading: isMovementLoading } = useInventoryMovements({
    page: movementPage + 1,
    limit: 20,
  });

  const reservePartMutation = useReservePart();
  const acknowledgeDispatchMutation = useAcknowledgeDispatch();

  const locations = dashboard?.locations || [];

  const handleOpenAdjustmentForPart = (bal: InventoryBalance) => {
    setAdjustTargetLocationId(bal.locationId);
    setAdjustTargetPartId(bal.partId);
    setAdjustmentModalOpen(true);
  };

  const handleOpenDispatchForPna = (item: PendingJobPart) => {
    setSelectedPendingPart(item);
    setDispatchModalOpen(true);
  };

  const handleReservePna = async (item: PendingJobPart) => {
    if (locations.length === 0) return;
    try {
      await reservePartMutation.mutateAsync({
        requestId: item.requestId,
        partEntryId: item.partEntryId,
        locationId: item.assignedLocationId || locations[0]!.locationId,
        partId: item.partId,
        quantity: item.quantity,
      });
      refetchPna();
      refetchStock();
      refetchDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to reserve part.');
    }
  };

  const handleAcknowledgeDelivery = async (dispatchId: string) => {
    if (window.confirm('Acknowledge arrival of this delivery challan and transfer stock to destination on-hand?')) {
      try {
        await acknowledgeDispatchMutation.mutateAsync(dispatchId);
        refetchStock();
        refetchDashboard();
      } catch (err: any) {
        alert(err.message || 'Failed to acknowledge delivery.');
      }
    }
  };

  return (
    <ProtectedRoute requiredPermission="inventory:read">
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <PageHeader
          title="Warehouse & Logistics Hub"
          subtitle="Enterprise multi-location spare parts inventory, PNA reservation, Goods Receipt Notes, Delivery Challans, and defective returns."
          badge={<StatusBadge status="ACTIVE" label="Phase 3 Live" />}
          actions={
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  refetchDashboard();
                  refetchStock();
                  refetchPna();
                }}
                sx={{ textTransform: 'none' }}
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<TuneIcon />}
                onClick={() => {
                  setAdjustTargetLocationId(undefined);
                  setAdjustTargetPartId(undefined);
                  setAdjustmentModalOpen(true);
                }}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Stock Adjustment
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<AssignmentReturnIcon />}
                onClick={() => setReturnModalOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Receive Defective
              </Button>
              <Button
                variant="contained"
                color="info"
                startIcon={<MoveToInboxIcon />}
                onClick={() => setGrnModalOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Inbound GRN
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<LocalShippingIcon />}
                onClick={() => {
                  setSelectedPendingPart(null);
                  setDispatchModalOpen(true);
                }}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                New Dispatch / Challan
              </Button>
            </Box>
          }
        />

        {/* Dashboard Error Banner */}
        {isDashboardError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetchDashboard()}>
                Retry
              </Button>
            }
            sx={{ mb: 3 }}
          >
            Failed to load warehouse dashboard statistics: {dashboardError?.message || 'Data contract or network error'}
          </Alert>
        )}

        {/* KPI Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderColor: 'primary.main' }}>
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  On-Hand Stock
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>
                  {isDashboardLoading ? '—' : dashboard?.kpis?.totalStockOnHand ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Physical warehouse units
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderColor: 'warning.main' }}>
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Reserved Stock
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: 'warning.main' }}>
                  {isDashboardLoading ? '—' : dashboard?.kpis?.totalStockReserved ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Locked for service jobs
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderColor: 'info.main' }}>
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  In-Transit Stock
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: 'info.main' }}>
                  {isDashboardLoading ? '—' : dashboard?.kpis?.totalStockInTransit ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Shipped via courier / truck
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderColor: 'error.main' }}>
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Defective / Quarantine
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: 'error.main' }}>
                  {isDashboardLoading ? '—' : dashboard?.kpis?.totalStockDefective ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Awaiting scrap or restock
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderColor: 'warning.dark' }}>
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Low Stock Alerts
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: 'warning.dark' }}>
                  {isDashboardLoading ? '—' : dashboard?.kpis?.lowStockPartCount ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Below reorder threshold
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderLeft: 4, borderColor: 'secondary.main' }}>
              <CardContent sx={{ py: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Pending PNA Requests
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color: 'secondary.main' }}>
                  {isDashboardLoading ? '—' : dashboard?.kpis?.pendingPartRequestCount ?? 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Jobs waiting for parts
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tab Navigation */}
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab
              icon={<InventoryIcon fontSize="small" />}
              iconPosition="start"
              label={`1. Stock Balances (${stockData?.total || 0})`}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
            <Tab
              icon={<WarningAmberIcon fontSize="small" />}
              iconPosition="start"
              label={`2. Job Part Requests / PNA Queue (${pnaData?.total || 0})`}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
            <Tab
              icon={<MoveToInboxIcon fontSize="small" />}
              iconPosition="start"
              label={`3. Goods Receiving / GRN (${grnData?.total || 0})`}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
            <Tab
              icon={<LocalShippingIcon fontSize="small" />}
              iconPosition="start"
              label={`4. Dispatches & Delivery Challans (${dispatchData?.total || 0})`}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
            <Tab
              icon={<AssignmentReturnIcon fontSize="small" />}
              iconPosition="start"
              label={`5. Defective Returns & Quarantine (${returnData?.total || 0})`}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
            <Tab
              icon={<HistoryIcon fontSize="small" />}
              iconPosition="start"
              label={`6. Movement Audit Ledger (${movementData?.total || 0})`}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
          </Tabs>

          {/* ========================================================================= */}
          {/* TAB 0: Real-Time Stock Balances & Availability */}
          {/* ========================================================================= */}
          {activeTab === 0 && (
            <Box sx={{ p: 2 }}>
              {/* Filter Bar */}
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  size="small"
                  placeholder="Search part code or description..."
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockPage(0);
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ width: { xs: '100%', sm: 300 } }}
                />

                <TextField
                  select
                  size="small"
                  label="Filter Location"
                  value={stockLocationId}
                  onChange={(e) => {
                    setStockLocationId(e.target.value);
                    setStockPage(0);
                  }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">All Locations</MenuItem>
                  {locations.map((loc) => (
                    <MenuItem key={loc.locationId} value={loc.locationId}>
                      {loc.locationName} ({loc.locationCode})
                    </MenuItem>
                  ))}
                </TextField>

                <FormControlLabel
                  control={
                    <Switch
                      checked={lowStockOnly}
                      onChange={(e) => {
                        setLowStockOnly(e.target.checked);
                        setStockPage(0);
                      }}
                      color="warning"
                    />
                  }
                  label="Low Stock Alert Only"
                />
              </Box>

              {isStockLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (stockData?.items || []).length === 0 ? (
                <EmptyState
                  icon={<InventoryIcon sx={{ fontSize: '3rem', opacity: 0.5 }} />}
                  title="No Stock Balances Found"
                  description="No inventory balance records match your search criteria. Post an inbound GRN or adjust stock to initialize balances."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Part Code</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Part Description</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Warehouse Location</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          On-Hand
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Reserved
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Available
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          In-Transit
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Defective
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stockData?.items.map((bal) => {
                        const isLow = bal.qtyAvailable <= bal.reorderLevel;
                        const isStockout = bal.qtyAvailable <= 0;

                        return (
                          <TableRow key={bal.balanceId} hover>
                            <TableCell sx={{ fontWeight: 700 }}>{bal.partCode}</TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {bal.partName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                HSN: {bal.hsnCode || '—'} | Unit Rate: ₹{bal.unitPrice.toFixed(2)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={bal.partCategory} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{bal.locationName}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {bal.locationCode} ({bal.partyType})
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {bal.qtyOnHand}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 600 }}>
                              {bal.qtyReserved}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontWeight: 800,
                                color: isStockout ? 'error.main' : isLow ? 'warning.dark' : 'success.main',
                              }}
                            >
                              {bal.qtyAvailable}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'info.main' }}>
                              {bal.qtyInTransit}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'error.main' }}>
                              {bal.qtyDefective}
                            </TableCell>
                            <TableCell>
                              {isStockout ? (
                                <Chip label="Stockout" size="small" color="error" />
                              ) : isLow ? (
                                <Chip label="Low Stock" size="small" color="warning" />
                              ) : (
                                <Chip label="In Stock" size="small" color="success" />
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                <Tooltip title="Audit Discrepancy & Reconcile">
                                  <IconButton
                                    size="small"
                                    color="info"
                                    onClick={() => setSelectedReconcileBalance(bal)}
                                  >
                                    <AssessmentIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Stock Adjustment">
                                  <IconButton
                                    size="small"
                                    color="secondary"
                                    onClick={() => handleOpenAdjustmentForPart(bal)}
                                  >
                                    <TuneIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={stockData?.total || 0}
                    page={stockPage}
                    onPageChange={(_, p) => setStockPage(p)}
                    rowsPerPage={stockLimit}
                    onRowsPerPageChange={(e) => {
                      setStockLimit(parseInt(e.target.value, 10));
                      setStockPage(0);
                    }}
                    rowsPerPageOptions={[10, 20, 50]}
                  />
                </TableContainer>
              )}
            </Box>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: Job Part Requests / PNA Actionable Queue */}
          {/* ========================================================================= */}
          {activeTab === 1 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                Service Requests where the technician marked <code>REQUIRED_PNA</code> (Part Not Available in van stock).
                Reserve stock to protect allocation or generate outbound Delivery Challan to dispatch.
              </Typography>

              {isPnaLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (pnaData?.items || []).length === 0 ? (
                <EmptyState
                  icon={<CheckCircleIcon sx={{ fontSize: '3rem', color: 'success.main', opacity: 0.7 }} />}
                  title="No Pending PNA Requests"
                  description="All technician spare part requirements are currently fulfilled or none are pending warehouse allocation."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Job Number</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Complaint / Request</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Requested Part</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Qty Req
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Available in Warehouse
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Requesting Center</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Fulfillment Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pnaData?.items.map((item) => (
                        <TableRow key={item.partEntryId} hover>
                          <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                            {item.jobNumber}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 200 }}>
                            <Typography variant="body2" noWrap title={item.complaintDescription}>
                              {item.complaintDescription}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Req on {new Date(item.requestedAt).toLocaleDateString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {item.partCode}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.partName} ({item.partCategory})
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {item.quantity}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              color: item.availableStock >= item.quantity ? 'success.main' : 'error.main',
                            }}
                          >
                            {item.availableStock}
                          </TableCell>
                          <TableCell>{item.assignedLocationName || 'Assigned ASF'}</TableCell>
                          <TableCell>
                            {item.isReserved ? (
                              <Chip label="RESERVED" color="warning" size="small" />
                            ) : (
                              <Chip label="PENDING ALLOCATION" color="default" size="small" />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                              {!item.isReserved && item.availableStock >= item.quantity && (
                                <Button
                                  variant="outlined"
                                  color="warning"
                                  size="small"
                                  onClick={() => handleReservePna(item)}
                                  disabled={reservePartMutation.isPending}
                                  sx={{ textTransform: 'none' }}
                                >
                                  Reserve
                                </Button>
                              )}
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleOpenDispatchForPna(item)}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                              >
                                Dispatch
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={pnaData?.total || 0}
                    page={pnaPage}
                    onPageChange={(_, p) => setPnaPage(p)}
                    rowsPerPage={20}
                    rowsPerPageOptions={[20]}
                  />
                </TableContainer>
              )}
            </Box>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: Inbound Goods Receiving Notes (GRN) */}
          {/* ========================================================================= */}
          {activeTab === 2 && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Immutable audit records of parts received at security gate entry and accepted into warehouse on-hand stock.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<MoveToInboxIcon />}
                  size="small"
                  onClick={() => setGrnModalOpen(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Post Inbound GRN
                </Button>
              </Box>

              {isGrnLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (grnData?.items || []).length === 0 ? (
                <EmptyState
                  icon={<MoveToInboxIcon sx={{ fontSize: '3rem', opacity: 0.5 }} />}
                  title="No Goods Receipts Recorded"
                  description="Click 'Post Inbound GRN' to record incoming supplier spare part shipments with security gate entry."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>GRN Number</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Receiving Location</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Supplier Name</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Invoice No / Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Gate Entry / Vehicle</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Received At</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Received By</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {grnData?.items.map((grn) => (
                        <TableRow key={grn.grnId} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{grn.grnNumber}</TableCell>
                          <TableCell>{grn.locationName || 'Central Warehouse'}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{grn.supplierName}</TableCell>
                          <TableCell>
                            <Typography variant="body2">{grn.supplierInvoiceNo || '—'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {grn.supplierInvoiceDate || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{grn.gateEntryNo || '—'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {grn.vehicleNo || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>{new Date(grn.receivedAt).toLocaleString()}</TableCell>
                          <TableCell>{grn.receivedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={grnData?.total || 0}
                    page={grnPage}
                    onPageChange={(_, p) => setGrnPage(p)}
                    rowsPerPage={20}
                    rowsPerPageOptions={[20]}
                  />
                </TableContainer>
              )}
            </Box>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: Dispatches & Delivery Challans */}
          {/* ========================================================================= */}
          {activeTab === 3 && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Outbound Delivery Challans & GST Tax Invoices. Dispatched goods remain in <code>IN_TRANSIT</code> until
                  destination acknowledgment.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<LocalShippingIcon />}
                  size="small"
                  onClick={() => {
                    setSelectedPendingPart(null);
                    setDispatchModalOpen(true);
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  Create Stock Dispatch
                </Button>
              </Box>

              {isDispatchLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (dispatchData?.items || []).length === 0 ? (
                <EmptyState
                  icon={<LocalShippingIcon sx={{ fontSize: '3rem', opacity: 0.5 }} />}
                  title="No Dispatches Recorded"
                  description="Click 'Create Stock Dispatch' or fulfill a Job Part Request from the PNA queue to issue delivery challans."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Challan No</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Linked Job</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>From Warehouse</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>To ASF Destination</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Transporter / Tracking</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Taxable (₹)
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Total Value (₹)
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dispatchData?.items.map((d) => (
                        <TableRow key={d.dispatchId} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{d.challanNumber}</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {d.jobNumber || 'Stock Transfer'}
                          </TableCell>
                          <TableCell>{d.fromLocationName || 'Central Warehouse'}</TableCell>
                          <TableCell>{d.toLocationName || 'Franchise Center'}</TableCell>
                          <TableCell>
                            <Typography variant="body2">{d.transporterName || d.dispatchMode}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              AWB: {d.docketNo || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">₹{d.subtotalTaxable.toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            ₹{d.totalAmount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={d.status}
                              size="small"
                              color={d.status === 'DELIVERED' ? 'success' : 'primary'}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                              <Tooltip title="View / Print Delivery Challan">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => setSelectedChallanDispatch(d)}
                                >
                                  <PrintIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              {d.status === 'DISPATCHED' && (
                                <Tooltip title="Acknowledge Delivery Arrival">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="success"
                                    onClick={() => handleAcknowledgeDelivery(d.dispatchId)}
                                    disabled={acknowledgeDispatchMutation.isPending}
                                    sx={{ textTransform: 'none', py: 0.2 }}
                                  >
                                    Acknowledge
                                  </Button>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={dispatchData?.total || 0}
                    page={dispatchPage}
                    onPageChange={(_, p) => setDispatchPage(p)}
                    rowsPerPage={20}
                    rowsPerPageOptions={[20]}
                  />
                </TableContainer>
              )}
            </Box>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: Defective Returns & Quarantine Disposition */}
          {/* ========================================================================= */}
          {activeTab === 4 && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Faulty and burnt parts returned from field service operations. Stored in <code>DEFECTIVE</code> quarantine
                  until quality disposition.
                </Typography>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<AssignmentReturnIcon />}
                  size="small"
                  onClick={() => setReturnModalOpen(true)}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Receive Defective Return
                </Button>
              </Box>

              {isReturnLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (returnData?.items || []).length === 0 ? (
                <EmptyState
                  icon={<AssignmentReturnIcon sx={{ fontSize: '3rem', opacity: 0.5 }} />}
                  title="No Defective Returns in Quarantine"
                  description="When ASF service centers return replaced faulty components, they will be tracked here for quality disposition."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Return Number</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Returning Center (Source)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Warehouse Destination</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Linked Job</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Returned At</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {returnData?.items.map((ret) => (
                        <TableRow key={ret.returnId} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{ret.returnNumber}</TableCell>
                          <TableCell>{ret.sourceLocationName || 'ASF Service Center'}</TableCell>
                          <TableCell>{ret.receivingLocationName || 'Central Warehouse'}</TableCell>
                          <TableCell sx={{ color: 'primary.main', fontWeight: 600 }}>
                            {ret.jobNumber || '—'}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={ret.status}
                              size="small"
                              color={ret.status === 'DISPOSITIONED' ? 'success' : 'warning'}
                            />
                          </TableCell>
                          <TableCell>{new Date(ret.returnedAt).toLocaleString()}</TableCell>
                          <TableCell align="center">
                            {ret.status !== 'DISPOSITIONED' && (
                              <Button
                                size="small"
                                variant="contained"
                                color="secondary"
                                startIcon={<FactCheckIcon />}
                                onClick={() => setSelectedDispositionReturn(ret)}
                                sx={{ textTransform: 'none' }}
                              >
                                Inspect & Disposition
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={returnData?.total || 0}
                    page={returnPage}
                    onPageChange={(_, p) => setReturnPage(p)}
                    rowsPerPage={20}
                    rowsPerPageOptions={[20]}
                  />
                </TableContainer>
              )}
            </Box>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: Double-Entry Movement History Ledger */}
          {/* ========================================================================= */}
          {activeTab === 5 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                Complete, immutable double-entry inventory audit ledger (<code>INVENTORY_MOVEMENTS</code>). All stock
                receipts, reservations, dispatches, arrivals, and write-offs are recorded here permanently.
              </Typography>

              {isMovementLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : (movementData?.items || []).length === 0 ? (
                <EmptyState
                  icon={<HistoryIcon sx={{ fontSize: '3rem', opacity: 0.5 }} />}
                  title="No Ledger Movements Logged"
                  description="Ledger entries will populate automatically upon Goods Receipts, Dispatches, and Adjustments."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Movement Type</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Bucket</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Part Code / Name</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Warehouse Location</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Delta Qty
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Balance Before → After
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Ref Doc / ID</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Actor</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {movementData?.items.map((m) => (
                        <TableRow key={m.movementId} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={m.movementType}
                              size="small"
                              variant="outlined"
                              color={
                                m.quantity > 0
                                  ? 'success'
                                  : m.movementType.includes('SCRAP')
                                  ? 'error'
                                  : 'primary'
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Chip label={m.stockBucket} size="small" />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {m.partCode}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {m.partName}
                            </Typography>
                          </TableCell>
                          <TableCell>{m.locationName || m.locationCode}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              color: m.quantity > 0 ? 'success.main' : 'error.main',
                            }}
                          >
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </TableCell>
                          <TableCell align="right">
                            {m.balanceBefore} → <strong>{m.balanceAfter}</strong>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" display="block">
                              {m.referenceType}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {m.referenceId}
                            </Typography>
                          </TableCell>
                          <TableCell>{m.actorUsername}</TableCell>
                          <TableCell sx={{ maxWidth: 200 }}>
                            <Typography variant="caption" noWrap title={m.remarks}>
                              {m.remarks || '—'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={movementData?.total || 0}
                    page={movementPage}
                    onPageChange={(_, p) => setMovementPage(p)}
                    rowsPerPage={20}
                    rowsPerPageOptions={[20]}
                  />
                </TableContainer>
              )}
            </Box>
          )}
        </Paper>

        {/* Modal Dialogs */}
        <GrnModal
          open={grnModalOpen}
          onClose={() => {
            setGrnModalOpen(false);
            refetchStock();
            refetchDashboard();
          }}
          locations={locations}
        />

        <DispatchModal
          open={dispatchModalOpen}
          onClose={() => {
            setDispatchModalOpen(false);
            setSelectedPendingPart(null);
            refetchStock();
            refetchPna();
            refetchDashboard();
          }}
          locations={locations}
          pendingPart={selectedPendingPart}
        />

        <DeliveryChallanModal
          open={Boolean(selectedChallanDispatch)}
          onClose={() => setSelectedChallanDispatch(null)}
          dispatch={selectedChallanDispatch}
        />

        <StockAdjustmentModal
          open={adjustmentModalOpen}
          onClose={() => {
            setAdjustmentModalOpen(false);
            setAdjustTargetLocationId(undefined);
            setAdjustTargetPartId(undefined);
            refetchStock();
            refetchDashboard();
          }}
          locations={locations}
          defaultLocationId={adjustTargetLocationId}
          defaultPartId={adjustTargetPartId}
        />

        <DefectiveReturnModal
          open={returnModalOpen}
          onClose={() => {
            setReturnModalOpen(false);
            refetchStock();
            refetchDashboard();
          }}
          locations={locations}
        />

        <DispositionModal
          open={Boolean(selectedDispositionReturn)}
          onClose={() => {
            setSelectedDispositionReturn(null);
            refetchStock();
            refetchDashboard();
          }}
          returnRecord={selectedDispositionReturn}
        />

        <ReconciliationModal
          open={Boolean(selectedReconcileBalance)}
          onClose={() => setSelectedReconcileBalance(null)}
          balance={selectedReconcileBalance}
        />
      </Box>
    </ProtectedRoute>
  );
}
