'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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

import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BuildIcon from '@mui/icons-material/Build';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearIcon from '@mui/icons-material/Clear';
import EngineeringIcon from '@mui/icons-material/Engineering';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HandymanIcon from '@mui/icons-material/Handyman';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import KeyIcon from '@mui/icons-material/Key';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhoneIcon from '@mui/icons-material/Phone';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

import { EmptyState } from '../../../components/data-display/EmptyState';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { SlaCounter } from '../../../components/feedback/SlaCounter';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';
import { AsfQueueItem } from '../../../lib/asfApi';
import { EngineerJobTab, useEngineerDashboard, useEngineerJobs } from '../../../lib/engineerApi';
import { TechnicianCheckInDialog } from '../asf/components/TechnicianCheckInDialog';

export default function FieldEngineerWorkspacePage() {
  const { user } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<EngineerJobTab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Selected complaint for OTP check-in dialog
  const [checkInRequest, setCheckInRequest] = useState<AsfQueueItem | null>(null);

  // TanStack Query Hooks
  const {
    data: kpis,
    isLoading: isKpisLoading,
    refetch: refetchKpis,
  } = useEngineerDashboard();

  const {
    data: jobsData,
    isLoading: isJobsLoading,
    refetch: refetchJobs,
  } = useEngineerJobs({
    tab: activeTab,
    q: searchQuery.trim() || undefined,
    page: page + 1,
    limit: rowsPerPage,
  });

  const jobs = jobsData?.items || [];
  const totalJobs = jobsData?.total || 0;

  const handleTabChange = (_: React.SyntheticEvent, newTab: EngineerJobTab) => {
    setActiveTab(newTab);
    setPage(0);
  };

  const handleRefresh = () => {
    refetchKpis();
    refetchJobs();
  };

  const renderNextAction = (job: AsfQueueItem) => {
    switch (job.status) {
      case 'APPOINTMENT_SCHEDULED':
        return (
          <Button
            size="small"
            variant="contained"
            color="warning"
            startIcon={<KeyIcon />}
            onClick={() => setCheckInRequest(job)}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Check-In (OTP)
          </Button>
        );
      case 'TECHNICIAN_CHECKED_IN':
        return (
          <Button
            component={Link}
            href={`/asf/jobs/${job.requestId}`}
            size="small"
            variant="contained"
            color="primary"
            startIcon={<BuildIcon />}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Start Diagnosis
          </Button>
        );
      case 'IN_PROGRESS_REPAIR':
        return (
          <Button
            component={Link}
            href={`/asf/jobs/${job.requestId}`}
            size="small"
            variant="contained"
            color="secondary"
            startIcon={<HandymanIcon />}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Record Repair
          </Button>
        );
      case 'PENDING_SPARE_PART':
      case 'PENDING_SPECIAL_PART_ESTIMATE':
      case 'SPECIAL_PART_ESTIMATE_PROVIDED':
        return (
          <Button
            component={Link}
            href={`/asf/jobs/${job.requestId}`}
            size="small"
            variant="outlined"
            color="info"
            startIcon={<LocalShippingIcon />}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Parts Tracker
          </Button>
        );
      case 'CALL_CLOSURE_SUBMITTED':
        return (
          <Button
            component={Link}
            href={`/asf/jobs/${job.requestId}`}
            size="small"
            variant="contained"
            color="success"
            startIcon={<VerifiedUserIcon />}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Enter Happy Code
          </Button>
        );
      default:
        return (
          <Button
            component={Link}
            href={`/asf/jobs/${job.requestId}`}
            size="small"
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            sx={{ fontWeight: 500, textTransform: 'none' }}
          >
            Job 360
          </Button>
        );
    }
  };

  return (
    <ProtectedRoute requiredRole={['ENGINEER', 'ADMIN']}>
      <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Workspace Page Header */}
        <PageHeader
          title="Field Service Workspace — My Assigned Jobs"
          subtitle={`Technician: ${user?.fullName || user?.username} | Live assigned visits, customer check-in, repair execution, and Happy Code closure.`}
          actions={
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isJobsLoading || isKpisLoading}
            >
              Refresh Queue
            </Button>
          }
        />

        {/* 6 Authoritative Real-Time KPI Cards */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: 'primary.light' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    MY ACTIVE JOBS
                  </Typography>
                  <EngineeringIcon fontSize="small" color="primary" />
                </Box>
                <Typography variant="h4" fontWeight={700} color="primary.main" sx={{ mt: 1 }}>
                  {isKpisLoading ? <CircularProgress size={24} /> : kpis?.myActiveJobs || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Open assigned visits
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: 'info.light' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {"TODAY'S VISITS"}
                  </Typography>
                  <EventAvailableIcon fontSize="small" color="info" />
                </Box>
                <Typography variant="h4" fontWeight={700} color="info.main" sx={{ mt: 1 }}>
                  {isKpisLoading ? <CircularProgress size={24} /> : kpis?.todayVisits || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Scheduled for today
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: 'warning.light' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    AWAITING CHECK-IN
                  </Typography>
                  <KeyIcon fontSize="small" color="warning" />
                </Box>
                <Typography variant="h4" fontWeight={700} color="warning.main" sx={{ mt: 1 }}>
                  {isKpisLoading ? <CircularProgress size={24} /> : kpis?.awaitingCheckIn || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Requires customer OTP
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: 'secondary.light' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    IN PROGRESS
                  </Typography>
                  <HandymanIcon fontSize="small" color="secondary" />
                </Box>
                <Typography variant="h4" fontWeight={700} color="secondary.main" sx={{ mt: 1 }}>
                  {isKpisLoading ? <CircularProgress size={24} /> : kpis?.repairsInProgress || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Checked-in / Under repair
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: 'error.light' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    WAITING FOR PARTS
                  </Typography>
                  <HourglassBottomIcon fontSize="small" color="error" />
                </Box>
                <Typography variant="h4" fontWeight={700} color="error.main" sx={{ mt: 1 }}>
                  {isKpisLoading ? <CircularProgress size={24} /> : kpis?.waitingParts || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  PNA / In transit
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: 'success.light' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    AWAITING HAPPY CODE
                  </Typography>
                  <VerifiedUserIcon fontSize="small" color="success" />
                </Box>
                <Typography variant="h4" fontWeight={700} color="success.main" sx={{ mt: 1 }}>
                  {isKpisLoading ? <CircularProgress size={24} /> : kpis?.awaitingHappyCode || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Ready for closure
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tab Navigation & Search Toolbar */}
        <Paper variant="outlined" sx={{ borderRadius: 1.5 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Engineer Jobs Queue Tabs"
            >
              <Tab
                value="today"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{"Today's Visits"}</span>
                    {Number(kpis?.todayVisits || 0) > 0 && (
                      <Chip label={kpis?.todayVisits} size="small" color="info" sx={{ height: 20, fontSize: '0.75rem' }} />
                    )}
                  </Box>
                }
              />
              <Tab value="upcoming" label="Upcoming" />
              <Tab
                value="in_progress"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>In Progress</span>
                    {Number(kpis?.repairsInProgress || 0) > 0 && (
                      <Chip label={kpis?.repairsInProgress} size="small" color="secondary" sx={{ height: 20, fontSize: '0.75rem' }} />
                    )}
                  </Box>
                }
              />
              <Tab
                value="waiting_parts"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>Waiting for Parts</span>
                    {Number(kpis?.waitingParts || 0) > 0 && (
                      <Chip label={kpis?.waitingParts} size="small" color="error" sx={{ height: 20, fontSize: '0.75rem' }} />
                    )}
                  </Box>
                }
              />
              <Tab
                value="awaiting_closure"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>Awaiting Closure</span>
                    {Number(kpis?.awaitingHappyCode || 0) > 0 && (
                      <Chip label={kpis?.awaitingHappyCode} size="small" color="success" sx={{ height: 20, fontSize: '0.75rem' }} />
                    )}
                  </Box>
                }
              />
              <Tab value="completed" label="Completed" />
              <Tab
                value="all"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>All My Jobs</span>
                    {Number(kpis?.myActiveJobs || 0) > 0 && (
                      <Chip label={kpis?.myActiveJobs} size="small" sx={{ height: 20, fontSize: '0.75rem' }} />
                    )}
                  </Box>
                }
              />
            </Tabs>
          </Box>

          {/* Search Toolbar */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search by Job #, Customer, Phone, or Pin Code..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 320, flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Box>

          {/* Jobs Data Table */}
          <TableContainer>
            <Table size="medium">
              <TableHead sx={{ backgroundColor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Job & Product</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Customer & Location</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Appointment</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>SLA Target</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isJobsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Loading assigned visits...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0 }}>
                      <EmptyState
                        title="No visits found"
                        description={
                          searchQuery
                            ? `No visits match search query '${searchQuery}' in tab '${activeTab}'.`
                            : `You have no assigned jobs in the '${activeTab.replace('_', ' ')}' category.`
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((job) => {
                    const appointmentFormatted = job.appointmentDate
                      ? new Date(job.appointmentDate).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Not Scheduled';

                    return (
                      <TableRow key={job.requestId} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        {/* Job & Product */}
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography
                                component={Link}
                                href={`/asf/jobs/${job.requestId}`}
                                variant="subtitle2"
                                fontWeight={700}
                                color="primary.main"
                                sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                              >
                                {job.jobNumber}
                              </Typography>
                              {job.warrantyStatus && (
                                <Chip
                                  label={job.warrantyStatus.replace('_', ' ')}
                                  size="small"
                                  color={job.warrantyStatus === 'IN_WARRANTY' ? 'success' : 'default'}
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.6875rem' }}
                                />
                              )}
                            </Box>
                            <Typography variant="body2" fontWeight={500}>
                              {job.productName || job.modelName || 'Standard Appliance'}
                            </Typography>
                            {job.problemDescription && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {job.problemDescription}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>

                        {/* Customer & Location */}
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {job.customerName || 'Customer'}
                            </Typography>
                            {job.customerPhone && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <PhoneIcon fontSize="inherit" color="action" />
                                <Typography
                                  component="a"
                                  href={`tel:${job.customerPhone}`}
                                  variant="caption"
                                  color="primary"
                                  sx={{ textDecoration: 'none', fontWeight: 600 }}
                                >
                                  {job.customerPhone}
                                </Typography>
                              </Box>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {[job.customerAddress, job.customerPincode].filter(Boolean).join(', ')}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Appointment */}
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <EventAvailableIcon fontSize="inherit" color="action" />
                              <Typography variant="body2" fontWeight={600}>
                                {appointmentFormatted}
                              </Typography>
                            </Box>
                            {job.appointmentSlot && (
                              <Chip
                                label={job.appointmentSlot}
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.6875rem', width: 'fit-content' }}
                              />
                            )}
                          </Box>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <StatusBadge status={job.status} />
                        </TableCell>

                        {/* SLA Target */}
                        <TableCell>
                          <SlaCounter
                            remainingHours={job.slaStatus?.remainingHours ?? 24}
                            breached={job.slaStatus?.isBreached ?? false}
                          />
                        </TableCell>

                        {/* Actions */}
                        <TableCell sx={{ textAlign: 'right' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                            {renderNextAction(job)}
                            <Tooltip title="View Job 360 Full Workspace">
                              <IconButton
                                component={Link}
                                href={`/asf/jobs/${job.requestId}`}
                                size="small"
                                color="inherit"
                              >
                                <OpenInNewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
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
            rowsPerPageOptions={[10, 20, 50]}
            component="div"
            count={totalJobs}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </Paper>

        {/* Modal: Customer OTP Check-In */}
        {checkInRequest && (
          <TechnicianCheckInDialog
            open={Boolean(checkInRequest)}
            onClose={() => setCheckInRequest(null)}
            request={checkInRequest}
            onSuccess={() => {
              setCheckInRequest(null);
              handleRefresh();
            }}
          />
        )}
      </Box>
    </ProtectedRoute>
  );
}
