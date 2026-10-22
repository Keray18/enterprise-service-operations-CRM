'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';

import { PageHeader } from '../../../components/data-display/PageHeader';
import { EnterpriseTable } from '../../../components/data-display/DataTablePrimitives';
import { EmptyState } from '../../../components/data-display/EmptyState';
import { StatusBadge } from '../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { FastCallRegistrationDialog } from './components/FastCallRegistrationDialog';
import { ServiceRequestDetailDialog } from './components/ServiceRequestDetailDialog';
import {
  RegisterComplaintResponse,
  ServiceRequest,
  useRecentRequests,
  useSearchServiceRequests,
} from '../../../lib/callCenterApi';
import { tokens } from '../../../theme/tokens';

const STATUS_TABS = [
  { label: 'All Requests', value: '' },
  { label: 'Registered (New)', value: 'REGISTERED' },
  { label: 'Assigned to ASF', value: 'ASSIGNED_TO_ASF' },
  { label: 'In Progress', value: 'IN_PROGRESS_REPAIR' },
  { label: 'Closed', value: 'CLOSED' },
];

export default function CallCenterPage() {
  // Dialog visibility states
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Success Snackbar
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const selectedStatus = STATUS_TABS[activeTab].value;
  const isSearchActive = Boolean(searchQuery.trim());

  // Queries:
  // If search query is active, use searchRequests; otherwise use recentRequests
  const {
    data: searchResults,
    isLoading: isSearching,
    refetch: refetchSearch,
  } = useSearchServiceRequests({
    q: searchQuery.trim() || undefined,
    status: selectedStatus || undefined,
    page: page + 1,
    limit: rowsPerPage,
  });

  const {
    data: recentRequests,
    isLoading: isLoadingRecent,
    refetch: refetchRecent,
  } = useRecentRequests(25, selectedStatus || undefined);

  const isLoading = isSearchActive ? isSearching : isLoadingRecent;

  // Determine items to display
  const tableData: ServiceRequest[] = isSearchActive
    ? searchResults?.items || []
    : recentRequests || [];

  const totalRecords = isSearchActive
    ? searchResults?.total || 0
    : recentRequests?.length || 0;

  const handleRegisterSuccess = (res: RegisterComplaintResponse) => {
    setIsRegisterOpen(false);
    setSelectedRequest(res.serviceRequest);
    setIsDetailOpen(true);
    setSuccessNotice(
      `Service Request #${res.serviceRequest.jobNumber} registered successfully! Customer: ${res.customer.fullName} (${res.customer.primaryMobile}). SMS acknowledgement queued.`
    );
    refetchRecent();
    if (isSearchActive) refetchSearch();
  };

  const handleOpenDetail = (req: ServiceRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const columns = [
    {
      id: 'jobNumber',
      label: 'Job Number',
      render: (row: ServiceRequest) => (
        <Chip
          label={row.jobNumber}
          size="small"
          color="primary"
          variant="outlined"
          onClick={() => handleOpenDetail(row)}
          sx={{
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'primary.50' },
          }}
        />
      ),
    },
    {
      id: 'customer',
      label: 'Customer Details',
      render: (row: ServiceRequest) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {row.customerName}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {row.customerPhone || 'N/A'} • {row.cityName || row.customerPincode}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'product',
      label: 'Product & Model',
      render: (row: ServiceRequest) => (
        <Box>
          <Typography variant="body2" fontWeight={500}>
            {row.brandName} • {row.productName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.modelName} ({row.modelCode})
          </Typography>
        </Box>
      ),
    },
    {
      id: 'callType',
      label: 'Call / Service Type',
      render: (row: ServiceRequest) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {row.callType}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.serviceType.replace('_', ' ')}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'warrantyStatus',
      label: 'Warranty',
      render: (row: ServiceRequest) => (
        <Chip
          label={row.warrantyStatus.replace('_', ' ')}
          size="small"
          color={
            row.warrantyStatus === 'IN_WARRANTY'
              ? 'success'
              : row.warrantyStatus === 'OUT_OF_WARRANTY'
              ? 'warning'
              : 'default'
          }
          sx={{ fontWeight: 600, fontSize: '0.72rem' }}
        />
      ),
    },
    {
      id: 'status',
      label: 'Workflow State',
      render: (row: ServiceRequest) => <StatusBadge status={row.status} />,
    },
    {
      id: 'registeredAt',
      label: 'Registered On',
      render: (row: ServiceRequest) => (
        <Box>
          <Typography variant="caption" color="text.primary" display="block">
            {new Date(row.registeredAt).toLocaleDateString()}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(row.registeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'actions',
      label: 'Action',
      render: (row: ServiceRequest) => (
        <IconButton
          size="small"
          color="primary"
          onClick={() => handleOpenDetail(row)}
          title="View Request Details"
          aria-label="View request details"
        >
          <VisibilityIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <ProtectedRoute requiredPermission="calls:read">
        <PageHeader
          title="Call Center Operations"
          subtitle="Inbound complaint registration, fast mobile lookup, and real-time service request lifecycle tracking."
          actions={
            <Button
              variant="contained"
              color="primary"
              startIcon={<SupportAgentIcon />}
              onClick={() => setIsRegisterOpen(true)}
              sx={{ fontWeight: 700, px: 2.5, py: 1 }}
            >
              Register New Complaint
            </Button>
          }
        />

        {/* Global Search & Filter Bar */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 3,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'center',
            gap: 2,
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: { xs: '100%', md: 450 } }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by Job # (TTWM...), Mobile, or Serial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')} aria-label="Clear search">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
            <IconButton
              size="small"
              onClick={() => {
                if (isSearchActive) refetchSearch();
                else refetchRecent();
              }}
              title="Refresh"
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>

          <Tabs
            value={activeTab}
            onChange={(_, val) => {
              setActiveTab(val);
              setPage(0);
            }}
            textColor="primary"
            indicatorColor="primary"
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 38 }}
          >
            {STATUS_TABS.map((tab, idx) => (
              <Tab
                key={idx}
                label={tab.label}
                sx={{ minHeight: 38, py: 0.5, px: 1.5, fontSize: '0.82rem', fontWeight: 600 }}
              />
            ))}
          </Tabs>
        </Paper>

        {/* Loading / Data Table */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={36} />
          </Box>
        ) : (
          <EnterpriseTable
            columns={columns}
            data={tableData}
            keyExtractor={(row) => row.requestId}
            page={page}
            rowsPerPage={rowsPerPage}
            totalRecords={totalRecords}
            onPageChange={(newPage) => setPage(newPage)}
            onRowsPerPageChange={(newLimit) => {
              setRowsPerPage(newLimit);
              setPage(0);
            }}
            emptyState={
              <EmptyState
                icon={<HeadsetMicIcon sx={{ fontSize: '3rem', color: 'primary.main', opacity: 0.5 }} />}
                title={isSearchActive ? 'No Matching Service Requests Found' : 'No Service Requests in Queue'}
                description={
                  isSearchActive
                    ? `No requests matched query "${searchQuery}". Check the mobile number, job number, or serial number.`
                    : 'No service requests found for the selected state. Click "Register New Complaint" to create the first intake.'
                }
                action={
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<SupportAgentIcon />}
                    onClick={() => setIsRegisterOpen(true)}
                  >
                    Register New Complaint
                  </Button>
                }
              />
            }
          />
        )}

        {/* Fast Call Registration Modal Console */}
        <FastCallRegistrationDialog
          open={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          onSuccess={handleRegisterSuccess}
        />

        {/* Service Request Detail & Timeline Dialog */}
        <ServiceRequestDetailDialog
          open={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedRequest(null);
          }}
          requestId={selectedRequest?.requestId}
          initialRequest={selectedRequest}
        />

        {/* Success Confirmation Toast */}
        <Snackbar
          open={Boolean(successNotice)}
          autoHideDuration={6000}
          onClose={() => setSuccessNotice(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSuccessNotice(null)}
            severity="success"
            variant="filled"
            sx={{ width: '100%', fontWeight: 600 }}
          >
            {successNotice}
          </Alert>
        </Snackbar>
      </ProtectedRoute>
  );
}
