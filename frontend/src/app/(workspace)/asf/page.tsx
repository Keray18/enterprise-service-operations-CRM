'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import BuildIcon from '@mui/icons-material/Build';
import ClearIcon from '@mui/icons-material/Clear';
import HandymanIcon from '@mui/icons-material/Handyman';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import FilterAltIcon from '@mui/icons-material/FilterAlt';

import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { SlaCounter } from '../../../components/feedback/SlaCounter';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';

import {
  AsfQueueFilters,
  AsfQueueItem,
  ServiceCenterQueueView,
  useAcknowledgeComplaint,
  useAsfQueue,
  useEligibleEngineers,
  useEngineerJobs,
  useEvaluateSla,
  useReassignComplaint,
  useRejectAssignment,
} from '../../../lib/asfApi';
import { useLocations, useProducts } from '../../../lib/catalogApi';
import { DispatchModal } from './components/DispatchModal';
import { TechnicianCheckInDialog } from './components/TechnicianCheckInDialog';

export default function AsfFranchisePage() {
  const { user, hasPermission } = useAuth();
  const isEngineerOnly = Boolean(
    user?.roles?.includes('ENGINEER') && !user?.roles?.includes('ASF') && !user?.roles?.includes('ADMIN')
  );
  const canManageSla = Boolean(user?.roles?.includes('ADMIN') || hasPermission('sla:manage'));
  const canAssignTechnician = Boolean(
    user?.roles?.includes('ADMIN') || user?.roles?.includes('ASF') || hasPermission('calls:assign') || hasPermission('asf:manage')
  );
  const [currentTab, setCurrentTab] = useState<ServiceCenterQueueView>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Modals state
  const [selectedTicket, setSelectedTicket] = useState<AsfQueueItem | null>(null);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [slaAlertMessage, setSlaAlertMessage] = useState<string | null>(null);

  // Operational mutations
  const acknowledgeMutation = useAcknowledgeComplaint();
  const rejectMutation = useRejectAssignment();
  const reassignMutation = useReassignComplaint();

  // Rejection Dialog state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTicket, setRejectTicket] = useState<AsfQueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState<
    'UNSUPPORTED_PRODUCT' | 'INCORRECT_ASSIGNMENT' | 'CAPACITY_EXCEEDED' | 'OUT_OF_TERRITORY' | 'OTHER'
  >('INCORRECT_ASSIGNMENT');
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Reassign Dialog state (Admin only)
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTicket, setReassignTicket] = useState<AsfQueueItem | null>(null);
  const [reassignLocationId, setReassignLocationId] = useState('');
  const [reassignRemarks, setReassignRemarks] = useState('');
  const [reassignError, setReassignError] = useState<string | null>(null);

  const locationsQuery = useLocations({ partyType: 'ASF', limit: 100 });

  // Queries
  const queueFilters: AsfQueueFilters = {
    view: currentTab !== 'my_visits' ? currentTab : undefined,
    assignedEngineerId: selectedEngineerId || undefined,
    productId: selectedProductId || undefined,
    status: selectedStatus || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    q: searchTerm.trim() || undefined,
    page: page + 1,
    limit: rowsPerPage,
  };

  const isEngineerTab = currentTab === 'my_visits';
  const queueQuery = useAsfQueue(!isEngineerTab ? queueFilters : {});
  const engineerJobsQuery = useEngineerJobs(
    isEngineerTab ? { page: page + 1, limit: rowsPerPage, status: selectedStatus || undefined } : undefined
  );

  const activeQuery = isEngineerTab ? engineerJobsQuery : queueQuery;
  const data = activeQuery.data;
  const items = data?.items || [];
  const total = data?.total || 0;

  // Technicians & Products for filter dropdowns
  const engineersQuery = useEligibleEngineers();
  const productsQuery = useProducts({ limit: 100 });

  const evaluateSlaMutation = useEvaluateSla();

  const handleTabChange = (_: React.SyntheticEvent, newTab: ServiceCenterQueueView) => {
    setCurrentTab(newTab);
    setPage(0);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedEngineerId('');
    setSelectedProductId('');
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const handleOpenDispatch = (ticket: AsfQueueItem) => {
    setSelectedTicket(ticket);
    setDispatchModalOpen(true);
  };

  const handleOpenCheckIn = (ticket: AsfQueueItem) => {
    setSelectedTicket(ticket);
    setCheckInModalOpen(true);
  };

  const handleRunSlaAudit = async () => {
    try {
      const res = await evaluateSlaMutation.mutateAsync();
      setSlaAlertMessage(`SLA Audit Completed: Evaluated ${res.evaluatedCount} ticket(s), flagged ${res.newBreachesCount} new 48-hour breach(es).`);
      queueQuery.refetch();
    } catch (err: any) {
      setSlaAlertMessage(`SLA Audit failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleAcknowledge = async (ticket: AsfQueueItem) => {
    try {
      await acknowledgeMutation.mutateAsync({
        requestId: ticket.requestId,
      });
      setSlaAlertMessage(`Ticket #${ticket.jobNumber} acknowledged successfully. 48h SLA timer stopped.`);
    } catch (err: any) {
      setSlaAlertMessage(`Failed to acknowledge ticket: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleOpenReject = (ticket: AsfQueueItem) => {
    setRejectTicket(ticket);
    setRejectReason('INCORRECT_ASSIGNMENT');
    setRejectRemarks('');
    setRejectError(null);
    setRejectModalOpen(true);
  };

  const handleSubmitReject = async () => {
    if (!rejectTicket) return;
    if (!rejectRemarks.trim()) {
      setRejectError('Remarks are required for rejecting an assignment.');
      return;
    }
    try {
      await rejectMutation.mutateAsync({
        requestId: rejectTicket.requestId,
        reason: rejectReason,
        remarks: rejectRemarks.trim(),
      });
      setRejectModalOpen(false);
      setSlaAlertMessage(`Assignment rejected for ticket #${rejectTicket.jobNumber}. Ticket moved to Assignment Required queue.`);
    } catch (err: any) {
      setRejectError(err?.message || 'Failed to reject assignment');
    }
  };

  const handleOpenReassign = (ticket: AsfQueueItem) => {
    setReassignTicket(ticket);
    setReassignLocationId('');
    setReassignRemarks('');
    setReassignError(null);
    setReassignModalOpen(true);
  };

  const handleSubmitReassign = async () => {
    if (!reassignTicket || !reassignLocationId) {
      setReassignError('Target Service Center location is required.');
      return;
    }
    try {
      await reassignMutation.mutateAsync({
        requestId: reassignTicket.requestId,
        newLocationId: reassignLocationId,
        remarks: reassignRemarks.trim() || undefined,
      });
      setReassignModalOpen(false);
      setSlaAlertMessage(`Ticket #${reassignTicket.jobNumber} successfully reassigned.`);
    } catch (err: any) {
      setReassignError(err?.message || 'Failed to reassign service request');
    }
  };

  // Derive summary metrics from current items
  const countUnack = items.filter((i) => !i.acknowledgedAt).length;
  const countReadyAssign = items.filter((i) => ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED'].includes(i.status) && !i.assignedEngineerId).length;
  const countPartsPending = items.filter((i) => i.status === 'PENDING_SPARE_PART').length;
  const countOverdue = items.filter((i) => i.slaBreached48h === 'Y' || i.slaStatus?.isBreached).length;
  const countAssignmentRequired = items.filter(
    (i) => !i.assignedLocationId || i.reassignmentRequested === 'Y' || i.assignmentFailedReason
  ).length;

  const hasActiveFilters = Boolean(
    searchTerm || selectedEngineerId || selectedProductId || selectedStatus || startDate || endDate
  );

  return (
    <ProtectedRoute requiredAnyPermission={['asf:read', 'calls:read']}>
      <PageHeader
        title={isEngineerOnly ? 'Technician Field Service Console' : 'Service Center Operations Dashboard'}
        subtitle={
          isEngineerOnly
            ? 'Personal assigned customer service visits, Arrival Happy Code check-in, defect diagnosis, and closure.'
            : 'Operational queues, 48-hour SLA acknowledgement, technician assignment, Arrival Happy Code check-in & parts lifecycle.'
        }
        badge={<StatusBadge status="ACTIVE" label={isEngineerOnly ? 'Field Active' : 'Operations Active'} />}
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {canManageSla && (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={handleRunSlaAudit}
                disabled={evaluateSlaMutation.isPending}
                startIcon={evaluateSlaMutation.isPending ? <CircularProgress size={16} /> : <AccessTimeFilledIcon />}
              >
                {evaluateSlaMutation.isPending ? 'Evaluating SLA...' : 'Run SLA Audit'}
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              onClick={() => activeQuery.refetch()}
              disabled={activeQuery.isFetching}
              startIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
          </Box>
        }
      />

      {slaAlertMessage && (
        <Alert severity="info" onClose={() => setSlaAlertMessage(null)} sx={{ mb: 2 }}>
          {slaAlertMessage}
        </Alert>
      )}

      {/* Operational Metrics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  ACTIVE QUEUE
                </Typography>
                <AssignmentIcon fontSize="small" color="primary" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                {total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                  AWAITING ACK
                </Typography>
                <HourglassBottomIcon fontSize="small" color="warning" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'warning.dark' }}>
                {countUnack}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="info.main" sx={{ fontWeight: 600 }}>
                  READY TO ASSIGN
                </Typography>
                <HandymanIcon fontSize="small" color="info" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'info.main' }}>
                {countReadyAssign}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600 }}>
                  PARTS PENDING
                </Typography>
                <LocalShippingIcon fontSize="small" color="secondary" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'secondary.main' }}>
                {countPartsPending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                  48H OVERDUE SLA
                </Typography>
                <WarningAmberIcon fontSize="small" color="error" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'error.main' }}>
                {countOverdue}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                  MY LOCATION
                </Typography>
                <CheckCircleIcon fontSize="small" color="success" />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.locationId || 'GLOBAL'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Workspace Card with Tabs, Filters & Queue */}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {/* Filter Tabs for the 10 actionable queues */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1, overflowX: 'auto' }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            textColor="primary"
            indicatorColor="primary"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab value="all" label="All Active" />
            <Tab value="unacknowledged" label="1. Awaiting Ack" />
            <Tab value="ready_to_assign" label="2. Ready to Assign" />
            <Tab value="today_appointments" label="3. Today's Appointments" />
            <Tab value="assigned_technicians" label="4. Assigned Techs" />
            <Tab value="awaiting_checkin" label="5. Awaiting Check-In" />
            <Tab value="diagnosis_repair" label="6. In Diagnosis/Repair" />
            <Tab value="parts_pending" label="7. Parts Pending / PNA" />
            <Tab value="parts_dispatched" label="8. Parts Dispatched" />
            <Tab value="awaiting_verification" label="9. Awaiting Service Confirmation" />
            <Tab
              value="overdue"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  10. 48h Overdue
                  {countOverdue > 0 && (
                    <Chip label={countOverdue} size="small" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
                  )}
                </Box>
              }
            />
            <Tab
              value="assignment_required"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  11. Assignment Required
                  {countAssignmentRequired > 0 && (
                    <Chip label={countAssignmentRequired} size="small" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
                  )}
                </Box>
              }
            />
            <Tab
              value="my_visits"
              icon={<PersonPinIcon fontSize="small" />}
              iconPosition="start"
              label="My Field Visits"
            />
          </Tabs>
        </Box>

        {/* Operational Filter Toolbar */}
        <Box sx={{ p: 2, bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider' }}>
          <Grid container spacing={1.5} alignItems="center">
            {/* Search */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search Job #, Customer, Phone..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            {/* Assigned Technician - visible only for management roles */}
            {!isEngineerOnly && (
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel id="engineer-select-label">Technician</InputLabel>
                  <Select
                    labelId="engineer-select-label"
                    value={selectedEngineerId}
                    label="Technician"
                    onChange={(e) => {
                      setSelectedEngineerId(e.target.value);
                      setPage(0);
                    }}
                  >
                    <MenuItem value="">
                      <em>All Technicians</em>
                    </MenuItem>
                    {(engineersQuery.data || []).map((eng) => (
                      <MenuItem key={eng.userId} value={eng.userId}>
                        {eng.fullName || eng.username}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Product Filter */}
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="product-select-label">Product</InputLabel>
                <Select
                  labelId="product-select-label"
                  value={selectedProductId}
                  label="Product"
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="">
                    <em>All Products</em>
                  </MenuItem>
                  {(productsQuery.data?.items || []).map((prod) => (
                    <MenuItem key={prod.productId} value={prod.productId}>
                      {prod.productName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Workflow State Filter */}
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="status-select-label">Workflow State</InputLabel>
                <Select
                  labelId="status-select-label"
                  value={selectedStatus}
                  label="Workflow State"
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="">
                    <em>All States</em>
                  </MenuItem>
                  <MenuItem value="REGISTERED">REGISTERED</MenuItem>
                  <MenuItem value="ASSIGNED_TO_ASF">ASSIGNED_TO_ASF</MenuItem>
                  <MenuItem value="ACKNOWLEDGED">ACKNOWLEDGED</MenuItem>
                  <MenuItem value="APPOINTMENT_SCHEDULED">APPOINTMENT_SCHEDULED</MenuItem>
                  <MenuItem value="TECHNICIAN_CHECKED_IN">TECHNICIAN_CHECKED_IN</MenuItem>
                  <MenuItem value="IN_PROGRESS_REPAIR">IN_PROGRESS_REPAIR</MenuItem>
                  <MenuItem value="PENDING_SPARE_PART">PENDING_SPARE_PART</MenuItem>
                  <MenuItem value="COMPLETED">COMPLETED</MenuItem>
                  <MenuItem value="CLOSED">CLOSED</MenuItem>
                  <MenuItem value="CANCELLED">CANCELLED</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* From Date */}
            <Grid item xs={6} sm={3} md={1.2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="From"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(0);
                }}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* To Date */}
            <Grid item xs={6} sm={3} md={1.2}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="To"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(0);
                }}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Reset Filters */}
            <Grid item xs={12} sm={6} md={0.6}>
              {hasActiveFilters && (
                <Tooltip title="Reset all filters">
                  <IconButton color="secondary" onClick={handleResetFilters} size="small">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Grid>
          </Grid>
        </Box>

        {/* Table Container */}
        <TableContainer sx={{ minHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Job Number & Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Customer & Location</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Appliance & Issue</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Service Center</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>48h SLA Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Workflow State</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Technician & Appointment</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading authorized service center operations queue...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ py: 6 }}>
                    <EmptyState
                      icon={<AssignmentIcon sx={{ fontSize: '3rem', color: 'primary.main', opacity: 0.5 }} />}
                      title="No service requests found"
                      description={
                        hasActiveFilters
                          ? 'No records matching current filters and search criteria.'
                          : `There are currently no tickets in the "${currentTab.replace(/_/g, ' ')}" queue.`
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((ticket) => {
                  const isScheduled = ticket.status === 'APPOINTMENT_SCHEDULED';
                  const isCheckedIn = ticket.status === 'TECHNICIAN_CHECKED_IN';
                  const canDispatch =
                    canAssignTechnician && ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED'].includes(ticket.status);

                  return (
                    <TableRow key={ticket.requestId} hover>
                      {/* Job Number & Date */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                          #{ticket.jobNumber}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {ticket.registeredAt ? new Date(ticket.registeredAt).toLocaleDateString() : 'N/A'}{' '}
                          {ticket.registeredAt
                            ? new Date(ticket.registeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.disabled">
                          {ticket.callType} • {ticket.serviceType}
                        </Typography>
                      </TableCell>

                      {/* Customer & Location */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {ticket.customerName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {ticket.customerPhone}
                        </Typography>
                        <Tooltip title={`${ticket.customerAddress || ''}, ${ticket.customerPincode || ''}`}>
                          <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 180, display: 'block' }}>
                            {ticket.customerAddress}, {ticket.customerPincode}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {/* Appliance & Issue */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {ticket.brandName} - {ticket.modelName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {ticket.vocDescription || 'No VOC description'}
                        </Typography>
                        {ticket.warrantyStatus && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={ticket.warrantyStatus}
                            sx={{ fontSize: '0.65rem', height: 18, mt: 0.5 }}
                          />
                        )}
                      </TableCell>

                      {/* Service Center */}
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: ticket.assignedLocationName ? 'text.primary' : 'warning.main',
                          }}
                        >
                          {ticket.assignedLocationName || 'Unassigned (Action Required)'}
                        </Typography>
                        {ticket.reassignmentRequested === 'Y' && (
                          <Chip
                            size="small"
                            color="error"
                            variant="outlined"
                            label={`Reassign: ${ticket.reassignmentReason || 'Requested'}`}
                            sx={{ fontSize: '0.65rem', height: 18, mt: 0.5 }}
                          />
                        )}
                        {ticket.assignmentFailedReason && (
                          <Typography variant="caption" color="error.main" display="block">
                            {ticket.assignmentFailedReason}
                          </Typography>
                        )}
                      </TableCell>

                      {/* 48h SLA Status */}
                      <TableCell>
                        {ticket.acknowledgedAt ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                            <Typography variant="caption" color="success.dark" sx={{ fontWeight: 600 }}>
                              Acknowledged
                            </Typography>
                          </Box>
                        ) : (
                          <SlaCounter
                            remainingHours={ticket.slaStatus?.remainingHours || 0}
                            breached={ticket.slaBreached48h === 'Y' || ticket.slaStatus?.isBreached}
                          />
                        )}
                      </TableCell>

                      {/* Workflow State */}
                      <TableCell>
                        <StatusBadge status={ticket.status} />
                      </TableCell>

                      {/* Technician & Appointment */}
                      <TableCell>
                        {ticket.assignedEngineerName ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {ticket.assignedEngineerName}
                            </Typography>
                            {ticket.appointmentDate && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {new Date(ticket.appointmentDate).toLocaleDateString()} ({ticket.appointmentSlot || 'SLOT'})
                              </Typography>
                            )}
                            {ticket.travelDistanceKm != null && (
                              <Typography variant="caption" color="text.disabled" display="block">
                                {ticket.travelDistanceKm} KM • {ticket.areaType || 'URBAN'}
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            Unassigned
                          </Typography>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                          <Button
                            component={Link}
                            href={`/asf/jobs/${ticket.requestId}`}
                            size="small"
                            variant={isCheckedIn ? 'contained' : 'outlined'}
                            color="info"
                            startIcon={<BuildIcon sx={{ fontSize: 14 }} />}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            Job 360
                          </Button>

                          {/* Step A: Acknowledge Complaint */}
                          {!ticket.acknowledgedAt && ['REGISTERED', 'ASSIGNED_TO_ASF'].includes(ticket.status) && canAssignTechnician && (
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => handleAcknowledge(ticket)}
                              disabled={acknowledgeMutation.isPending}
                              startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Acknowledge
                            </Button>
                          )}

                          {/* Step B: Dispatch Engineer */}
                          {canDispatch && (
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              onClick={() => handleOpenDispatch(ticket)}
                              startIcon={<SendIcon sx={{ fontSize: 14 }} />}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Dispatch
                            </Button>
                          )}

                          {/* Reject Assignment */}
                          {canAssignTechnician && ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED'].includes(ticket.status) && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleOpenReject(ticket)}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Reject
                            </Button>
                          )}

                          {/* Reassign Service Center (Admin only) */}
                          {Boolean(user?.roles?.includes('ADMIN')) && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              onClick={() => handleOpenReassign(ticket)}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Reassign
                            </Button>
                          )}

                          {isScheduled && (
                            <Button
                              size="small"
                              variant="contained"
                              color="secondary"
                              onClick={() => handleOpenCheckIn(ticket)}
                              startIcon={<VerifiedUserIcon sx={{ fontSize: 14 }} />}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Check-In (Happy Code)
                            </Button>
                          )}

                          {ticket.status === 'CALL_CLOSURE_SUBMITTED' && (
                            <Button
                              component={Link}
                              href={`/asf/jobs/${ticket.requestId}`}
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Confirm &amp; Close
                            </Button>
                          )}

                          {isCheckedIn && (
                            <Chip
                              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                              label="Checked In"
                              color="success"
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </Paper>

      {/* Single-Commit Dispatch Modal */}
      <DispatchModal
        open={dispatchModalOpen}
        onClose={() => setDispatchModalOpen(false)}
        request={selectedTicket}
        onSuccess={() => {
          activeQuery.refetch();
        }}
      />

      {/* Technician On-Site Check-In Dialog */}
      <TechnicianCheckInDialog
        open={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        request={selectedTicket}
        onSuccess={() => {
          activeQuery.refetch();
        }}
      />

      {/* Reject Assignment Dialog */}
      <Dialog
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>
          Reject Complaint Assignment — #{rejectTicket?.jobNumber}
        </DialogTitle>
        <DialogContent dividers>
          {rejectError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rejectError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rejecting this assignment will return the complaint to the centralized <strong>Assignment Required</strong> queue for reassignment by an administrator. A mandatory reason and explanation must be provided.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="reject-reason-label">Rejection Reason *</InputLabel>
            <Select
              labelId="reject-reason-label"
              value={rejectReason}
              label="Rejection Reason *"
              onChange={(e) => setRejectReason(e.target.value as any)}
            >
              <MenuItem value="INCORRECT_ASSIGNMENT">Incorrect Franchise / Pincode Mapping</MenuItem>
              <MenuItem value="UNSUPPORTED_PRODUCT">Unsupported Product / Category</MenuItem>
              <MenuItem value="CAPACITY_EXCEEDED">Franchise Operational Capacity Exceeded</MenuItem>
              <MenuItem value="OUT_OF_TERRITORY">Out of Operational Territory / Distance</MenuItem>
              <MenuItem value="OTHER">Other Operational Constraint</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            label="Detailed Rejection Remarks *"
            placeholder="Explain the specific reason why this complaint cannot be serviced..."
            value={rejectRemarks}
            onChange={(e) => setRejectRemarks(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button variant="outlined" onClick={() => setRejectModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleSubmitReject}
            disabled={rejectMutation.isPending || !rejectRemarks.trim()}
          >
            {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Admin Reassign Service Center Dialog */}
      <Dialog
        open={reassignModalOpen}
        onClose={() => setReassignModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: 'primary.main' }}>
          Reassign Service Center — #{reassignTicket?.jobNumber}
        </DialogTitle>
        <DialogContent dividers>
          {reassignError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {reassignError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Reassign complaint to a different active Service Center franchisee. The ticket will transition to <strong>ASSIGNED_TO_ASF</strong> and await acknowledgment by the destination center.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="reassign-asf-label">Target Service Center (ASF) *</InputLabel>
            <Select
              labelId="reassign-asf-label"
              value={reassignLocationId}
              label="Target Service Center (ASF) *"
              onChange={(e) => setReassignLocationId(e.target.value)}
            >
              {(locationsQuery.data?.items || [])
                .filter((loc) => loc.partyType === 'ASF' && loc.isActive === 'Y')
                .map((loc) => (
                  <MenuItem key={loc.locationId} value={loc.locationId}>
                    {loc.locationName} ({loc.locationCode})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Reassignment Notes (Optional)"
            placeholder="Optional instructions for destination service center..."
            value={reassignRemarks}
            onChange={(e) => setReassignRemarks(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button variant="outlined" onClick={() => setReassignModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmitReassign}
            disabled={reassignMutation.isPending || !reassignLocationId}
          >
            {reassignMutation.isPending ? 'Reassigning...' : 'Confirm Reassignment'}
          </Button>
        </DialogActions>
      </Dialog>
    </ProtectedRoute>
  );
}
