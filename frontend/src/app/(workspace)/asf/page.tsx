'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
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
import Alert from '@mui/material/Alert';

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

import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { SlaCounter } from '../../../components/feedback/SlaCounter';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';

import {
  AsfQueueFilters,
  AsfQueueItem,
  useAsfQueue,
  useEngineerJobs,
  useEvaluateSla,
} from '../../../lib/asfApi';
import { DispatchModal } from './components/DispatchModal';
import { TechnicianCheckInDialog } from './components/TechnicianCheckInDialog';

type QueueTab = 'all' | 'unacknowledged' | 'ready_to_assign' | 'scheduled' | 'checked_in' | 'overdue' | 'my_visits';

export default function AsfFranchisePage() {
  const [currentTab, setCurrentTab] = useState<QueueTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Modals state
  const [selectedTicket, setSelectedTicket] = useState<AsfQueueItem | null>(null);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [slaAlertMessage, setSlaAlertMessage] = useState<string | null>(null);

  // Queries
  const queueFilters: AsfQueueFilters = {
    view: currentTab !== 'my_visits' ? (currentTab as any) : undefined,
    q: searchTerm.trim() || undefined,
    page: page + 1,
    limit: rowsPerPage,
  };

  const queueQuery = useAsfQueue(currentTab !== 'my_visits' ? queueFilters : {});
  const engineerJobsQuery = useEngineerJobs(
    currentTab === 'my_visits' ? { page: page + 1, limit: rowsPerPage } : undefined
  );

  const evaluateSlaMutation = useEvaluateSla();

  const isEngineerTab = currentTab === 'my_visits';
  const activeQuery = isEngineerTab ? engineerJobsQuery : queueQuery;
  const data = activeQuery.data;
  const items = data?.items || [];
  const total = data?.total || 0;

  const handleTabChange = (_: React.SyntheticEvent, newTab: QueueTab) => {
    setCurrentTab(newTab);
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

  // Derive top-level metric counters from the current queue
  const countUnack = items.filter((i) => !i.acknowledgedAt).length;
  const countScheduled = items.filter((i) => i.status === 'APPOINTMENT_SCHEDULED').length;
  const countCheckedIn = items.filter((i) => i.status === 'TECHNICIAN_CHECKED_IN').length;
  const countOverdue = items.filter((i) => i.slaBreached48h === 'Y' || i.slaStatus?.isBreached).length;

  return (
    <ProtectedRoute requiredPermission="asf:read">
        <PageHeader
          title="Authorized Service Franchise (ASF) Operations"
          subtitle="48-hour acknowledgement SLA queue, atomic single-commit dispatch, and technician OTP check-in."
          badge={<StatusBadge status="ACTIVE" label="Operations Active" />}
          actions={
            <Box sx={{ display: 'flex', gap: 1 }}>
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
          <Grid item xs={12} sm={6} md={2.4}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    TOTAL ACTIVE
                  </Typography>
                  <AssignmentIcon fontSize="small" color="primary" />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {total}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
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

          <Grid item xs={12} sm={6} md={2.4}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                    48H OVERDUE
                  </Typography>
                  <WarningAmberIcon fontSize="small" color="error" />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'error.main' }}>
                  {countOverdue}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="info.main" sx={{ fontWeight: 600 }}>
                    SCHEDULED
                  </Typography>
                  <EventAvailableIcon fontSize="small" color="info" />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'info.main' }}>
                  {countScheduled}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                    CHECKED-IN
                  </Typography>
                  <CheckCircleIcon fontSize="small" color="success" />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: 'success.main' }}>
                  {countCheckedIn}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Workspace Card with Tabs & Queue */}
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {/* Filter Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Tabs
              value={currentTab}
              onChange={handleTabChange}
              textColor="primary"
              indicatorColor="primary"
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab value="all" label="All Active" />
              <Tab value="unacknowledged" label="Awaiting Ack" />
              <Tab value="ready_to_assign" label="Ready to Assign" />
              <Tab value="scheduled" label="Scheduled" />
              <Tab value="checked_in" label="Checked In" />
              <Tab
                value="overdue"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Overdue
                    {countOverdue > 0 && (
                      <Chip label={countOverdue} size="small" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
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

            {/* Quick Search */}
            <Box sx={{ pb: 1 }}>
              <TextField
                size="small"
                placeholder="Search Job #, Customer, Phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: { xs: '100%', sm: 280 } }}
              />
            </Box>
          </Box>

          {/* Table Container */}
          <TableContainer sx={{ minHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Job Number & Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer & Location</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Appliance & Issue</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>48h SLA Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Workflow State</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Technician & Appointment</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Loading authorized franchise operations queue...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 6 }}>
                      <EmptyState
                        icon={<AssignmentIcon sx={{ fontSize: '3rem', color: 'primary.main', opacity: 0.5 }} />}
                        title="No service requests found"
                        description={
                          searchTerm
                            ? `No records matching "${searchTerm}" in the current view.`
                            : `There are currently no tickets in the "${currentTab.replace('_', ' ')}" queue.`
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((ticket) => {
                    const isUnassigned = !ticket.assignedEngineerId;
                    const isScheduled = ticket.status === 'APPOINTMENT_SCHEDULED';
                    const isCheckedIn = ticket.status === 'TECHNICIAN_CHECKED_IN';
                    const canDispatch = ['REGISTERED', 'ASSIGNED_TO_ASF', 'ACKNOWLEDGED'].includes(ticket.status);

                    return (
                      <TableRow key={ticket.requestId} hover>
                        {/* Job Number & Date */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                            #{ticket.jobNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(ticket.registeredAt).toLocaleDateString()} {new Date(ticket.registeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                          <Tooltip title={`${ticket.customerAddress}, ${ticket.customerPincode}`}>
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
                          <Chip
                            size="small"
                            variant="outlined"
                            label={ticket.warrantyStatus}
                            sx={{ fontSize: '0.65rem', height: 18, mt: 0.5 }}
                          />
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
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
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

                            {isScheduled && (
                              <Button
                                size="small"
                                variant="contained"
                                color="secondary"
                                onClick={() => handleOpenCheckIn(ticket)}
                                startIcon={<VerifiedUserIcon sx={{ fontSize: 14 }} />}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                              >
                                Check-In (OTP)
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
      </ProtectedRoute>
  );
}
