'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditLocationIcon from '@mui/icons-material/EditLocation';
import EngineeringIcon from '@mui/icons-material/Engineering';
import LockResetIcon from '@mui/icons-material/LockReset';
import PeopleIcon from '@mui/icons-material/People';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { EmptyState } from '../../../../components/data-display/EmptyState';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { LocationAutocomplete } from '../../../../components/forms/LocationAutocomplete';
import { useLocations } from '../../../../lib/catalogApi';
import {
  AdminEngineerRecord,
  CreateEngineerInput,
  useAdminEngineers,
  useCreateEngineer,
  useResetEngineerPassword,
  useUpdateEngineerLocation,
  useUpdateEngineerStatus,
} from '../../../../lib/adminEngineerApi';

export default function AdminEngineersPage() {
  // Filters & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdTempPassword, setCreatedTempPassword] = useState<{ username: string; pass: string } | null>(null);

  const [passwordResetEngineer, setPasswordResetEngineer] = useState<AdminEngineerRecord | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState<{ username: string; pass: string } | null>(null);

  const [locationEditEngineer, setLocationEditEngineer] = useState<AdminEngineerRecord | null>(null);
  const [newLocationId, setNewLocationId] = useState<string>('');

  const [deactivateEngineer, setDeactivateEngineer] = useState<AdminEngineerRecord | null>(null);
  const [replacementEngineerId, setReplacementEngineerId] = useState<string>('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Create Form State
  const [newEngineerForm, setNewEngineerForm] = useState<CreateEngineerInput>({
    fullName: '',
    username: '',
    phoneNumber: '',
    email: '',
    homeLocationId: '',
    isActive: 'Y',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  // Data Queries
  const { data: locationsData } = useLocations({ limit: 100 });
  const locations = locationsData?.items || [];
  const serviceCenterLocations = locations.filter(
    (l: any) => l.partyType === 'ASF' || l.partyType === 'FRANCHISE' || l.partyType === 'BRANCH' || !l.partyType
  );

  const {
    data: engineersData,
    isLoading: isEngineersLoading,
    refetch: refetchEngineers,
  } = useAdminEngineers({
    q: searchQuery.trim() || undefined,
    locationId: selectedLocation !== 'ALL' ? selectedLocation : undefined,
    status: statusFilter,
    page: page + 1,
    limit: rowsPerPage,
  });

  const engineers = engineersData?.engineers || [];
  const total = engineersData?.total || 0;

  // Active technicians for reassignment dropdown
  const otherActiveEngineers = engineers.filter(
    (e) => e.isActive === 'Y' && (!deactivateEngineer || e.userId !== deactivateEngineer.userId)
  );

  // Mutations
  const createMutation = useCreateEngineer();
  const updateStatusMutation = useUpdateEngineerStatus();
  const resetPasswordMutation = useResetEngineerPassword();
  const updateLocationMutation = useUpdateEngineerLocation();

  // Handlers
  const handleOpenCreate = () => {
    setNewEngineerForm({
      fullName: '',
      username: '',
      phoneNumber: '',
      email: '',
      homeLocationId: serviceCenterLocations[0]?.locationId || '',
      isActive: 'Y',
    });
    setCreateError(null);
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newEngineerForm.fullName.trim() || !newEngineerForm.username.trim() || !newEngineerForm.phoneNumber.trim()) {
      setCreateError('Please complete all mandatory fields.');
      return;
    }

    if (!newEngineerForm.homeLocationId) {
      setCreateError('Please select a home Service Center.');
      return;
    }

    try {
      const res = await createMutation.mutateAsync(newEngineerForm);
      setCreateDialogOpen(false);
      setCreatedTempPassword({
        username: res.user.username,
        pass: res.temporaryPassword,
      });
      refetchEngineers();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create engineer account.');
    }
  };

  const handleResetPassword = async () => {
    if (!passwordResetEngineer) return;
    try {
      const res = await resetPasswordMutation.mutateAsync(passwordResetEngineer.userId);
      const username = passwordResetEngineer.username;
      setPasswordResetEngineer(null);
      setResetTempPassword({
        username,
        pass: res.temporaryPassword,
      });
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to reset engineer password.');
    }
  };

  const handleUpdateLocation = async () => {
    if (!locationEditEngineer || !newLocationId) return;
    try {
      await updateLocationMutation.mutateAsync({
        userId: locationEditEngineer.userId,
        homeLocationId: newLocationId,
      });
      setLocationEditEngineer(null);
      setToastMessage('Assigned Service Center updated successfully.');
      refetchEngineers();
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to update Service Center.');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateEngineer) return;
    setDeactivateError(null);

    if (deactivateEngineer.openJobCount > 0 && !replacementEngineerId) {
      setDeactivateError('Please select an active replacement technician to receive open jobs.');
      return;
    }

    try {
      const res = await updateStatusMutation.mutateAsync({
        userId: deactivateEngineer.userId,
        isActive: 'N',
        reassignToEngineerId: deactivateEngineer.openJobCount > 0 ? replacementEngineerId : undefined,
      });
      setDeactivateEngineer(null);
      setReplacementEngineerId('');
      setToastMessage(res?.message || 'Engineer deactivated successfully.');
      refetchEngineers();
    } catch (err: any) {
      setDeactivateError(err?.message || 'Failed to deactivate engineer.');
    }
  };

  const handleActivate = async (engineer: AdminEngineerRecord) => {
    try {
      await updateStatusMutation.mutateAsync({
        userId: engineer.userId,
        isActive: 'Y',
      });
      setToastMessage(`Engineer ${engineer.fullName} activated successfully.`);
      refetchEngineers();
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to activate engineer.');
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setToastMessage('Temporary password copied to clipboard.');
    }
  };

  return (
    <ProtectedRoute requiredRole="ADMIN">
      <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Page Header */}
        <PageHeader
          title="Field Engineer Directory & Management"
          subtitle="Admin authority to manage mobile field technicians, assign service centers, reset credentials, and govern capacity."
          actions={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => refetchEngineers()}
                disabled={isEngineersLoading}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={handleOpenCreate}
                sx={{ fontWeight: 600 }}
              >
                New Field Engineer
              </Button>
            </Box>
          }
        />

        {/* Filter Toolbar */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search by name, username, phone, or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
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
            </Grid>

            <Grid item xs={12} sm={4} md={4}>
              <LocationAutocomplete
                value={selectedLocation === 'ALL' ? '' : selectedLocation}
                onChange={(locId) => {
                  setSelectedLocation(locId || 'ALL');
                  setPage(0);
                }}
                label="Home Service Center"
                placeholder="All Service Centers..."
                partyType="ASF"
                allowClear
              />
            </Grid>

            <Grid item xs={12} sm={3} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setPage(0);
                  }}
                >
                  <MenuItem value="ALL">All Statuses</MenuItem>
                  <MenuItem value="ACTIVE">Active Only</MenuItem>
                  <MenuItem value="INACTIVE">Inactive Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        {/* Engineers Directory Table */}
        <Paper variant="outlined" sx={{ borderRadius: 1.5, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="medium">
              <TableHead sx={{ backgroundColor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Field Technician</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Contact Info</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Home Service Center</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Open Jobs</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isEngineersLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Loading technician directory...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : engineers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ p: 0 }}>
                      <EmptyState
                        title="No field engineers found"
                        description={
                          searchQuery
                            ? `No technicians match search query '${searchQuery}'.`
                            : 'No field engineers registered with the specified filters.'
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  engineers.map((eng) => (
                    <TableRow key={eng.userId} hover>
                      {/* Name & Login */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <EngineeringIcon color={eng.isActive === 'Y' ? 'primary' : 'disabled'} />
                          <Box>
                            <Typography variant="subtitle2" fontWeight={600}>
                              {eng.fullName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Username: <strong>{eng.username}</strong>
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Contact Info */}
                      <TableCell>
                        <Typography variant="body2">{eng.phoneNumber || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {eng.email || '—'}
                        </Typography>
                      </TableCell>

                      {/* Home Service Center */}
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {eng.homeLocationName || 'Unassigned'}
                        </Typography>
                        {eng.homeLocationCode && (
                          <Chip
                            label={eng.homeLocationCode}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.6875rem' }}
                          />
                        )}
                      </TableCell>

                      {/* Open Jobs Count */}
                      <TableCell>
                        <Chip
                          label={`${eng.openJobCount} active`}
                          size="small"
                          color={eng.openJobCount === 0 ? 'success' : eng.openJobCount >= 5 ? 'error' : 'warning'}
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Chip
                          label={eng.isActive === 'Y' ? 'Active' : 'Inactive'}
                          size="small"
                          color={eng.isActive === 'Y' ? 'success' : 'default'}
                          variant={eng.isActive === 'Y' ? 'filled' : 'outlined'}
                        />
                      </TableCell>

                      {/* Actions */}
                      <TableCell sx={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                          <Tooltip title="Update Service Center">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setLocationEditEngineer(eng);
                                setNewLocationId(eng.homeLocationId || '');
                              }}
                            >
                              <EditLocationIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Reset Password">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => setPasswordResetEngineer(eng)}
                            >
                              <LockResetIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {eng.isActive === 'Y' ? (
                            <Tooltip title="Deactivate Technician">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                  setDeactivateEngineer(eng);
                                  setReplacementEngineerId('');
                                  setDeactivateError(null);
                                }}
                              >
                                <PersonOffIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Activate Technician">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => handleActivate(eng)}
                              >
                                <PersonOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[10, 20, 50]}
            component="div"
            count={total}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </Paper>

        {/* Modal: Create Engineer */}
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleCreateSubmit}>
            <DialogTitle>Add New Field Service Technician</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {createError && <Alert severity="error">{createError}</Alert>}

              <TextField
                label="Full Name *"
                value={newEngineerForm.fullName}
                onChange={(e) => setNewEngineerForm({ ...newEngineerForm, fullName: e.target.value })}
                required
                fullWidth
                size="small"
              />

              <TextField
                label="Login Username *"
                value={newEngineerForm.username}
                onChange={(e) => setNewEngineerForm({ ...newEngineerForm, username: e.target.value })}
                required
                fullWidth
                size="small"
                helperText="Must be unique. Used by the technician to log into the field service workspace."
              />

              <TextField
                label="Mobile Phone Number *"
                value={newEngineerForm.phoneNumber}
                onChange={(e) => setNewEngineerForm({ ...newEngineerForm, phoneNumber: e.target.value })}
                required
                fullWidth
                size="small"
                placeholder="10-digit mobile number"
              />

              <TextField
                label="Email Address (Optional)"
                type="email"
                value={newEngineerForm.email || ''}
                onChange={(e) => setNewEngineerForm({ ...newEngineerForm, email: e.target.value })}
                fullWidth
                size="small"
                helperText="Defaults to @crm.internal if omitted."
              />

              <LocationAutocomplete
                value={newEngineerForm.homeLocationId}
                onChange={(locId) => setNewEngineerForm({ ...newEngineerForm, homeLocationId: locId })}
                label="Home Service Center *"
                placeholder="Search operational service centers..."
                partyType="ASF"
                required
                helperText="Select the operational franchise center for this technician."
              />
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setCreateDialogOpen(false)} color="inherit">
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={createMutation.isPending}>
                {createMutation.isPending ? <CircularProgress size={20} /> : 'Create Technician Account'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Modal: Display Created Temporary Password ONCE */}
        {createdTempPassword && (
          <Dialog open={Boolean(createdTempPassword)} onClose={() => setCreatedTempPassword(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ color: 'success.main' }}>Account Created Successfully</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="warning">
                This temporary password will only be shown <strong>once</strong>. Please securely share it with the field technician immediately.
              </Alert>

              <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Login ID:
                </Typography>
                <Typography variant="body1" fontWeight={700}>
                  {createdTempPassword.username}
                </Typography>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Temporary Password:
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                  <Typography
                    variant="h6"
                    fontFamily="monospace"
                    fontWeight={700}
                    color="primary.main"
                    sx={{ letterSpacing: 1 }}
                  >
                    {createdTempPassword.pass}
                  </Typography>
                  <Tooltip title="Copy password">
                    <IconButton size="small" onClick={() => copyToClipboard(createdTempPassword.pass)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button variant="contained" onClick={() => setCreatedTempPassword(null)}>
                Done
              </Button>
            </DialogActions>
          </Dialog>
        )}

        {/* Modal: Reset Password Confirmation */}
        <Dialog open={Boolean(passwordResetEngineer)} onClose={() => setPasswordResetEngineer(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Reset Field Engineer Password?</DialogTitle>
          <DialogContent dividers>
            <DialogContentText>
              Are you sure you want to reset the password for <strong>{passwordResetEngineer?.fullName}</strong> (
              {passwordResetEngineer?.username})? A new secure temporary password will be generated and displayed.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setPasswordResetEngineer(null)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? <CircularProgress size={20} /> : 'Generate New Password'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Modal: Display Reset Temporary Password ONCE */}
        {resetTempPassword && (
          <Dialog open={Boolean(resetTempPassword)} onClose={() => setResetTempPassword(null)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ color: 'info.main' }}>Password Reset Successful</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="warning">
                Please provide this new temporary password to technician <strong>{resetTempPassword.username}</strong>.
              </Alert>

              <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography
                  variant="h6"
                  fontFamily="monospace"
                  fontWeight={700}
                  color="primary.main"
                  sx={{ letterSpacing: 1 }}
                >
                  {resetTempPassword.pass}
                </Typography>
                <Tooltip title="Copy password">
                  <IconButton size="small" onClick={() => copyToClipboard(resetTempPassword.pass)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button variant="contained" onClick={() => setResetTempPassword(null)}>
                Done
              </Button>
            </DialogActions>
          </Dialog>
        )}

        {/* Modal: Edit Service Center Location */}
        <Dialog open={Boolean(locationEditEngineer)} onClose={() => setLocationEditEngineer(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Change Assigned Service Center</DialogTitle>
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DialogContentText>
              Select a new home Service Center for <strong>{locationEditEngineer?.fullName}</strong>.
            </DialogContentText>
            <LocationAutocomplete
              value={newLocationId}
              onChange={(locId) => setNewLocationId(locId)}
              label="Home Service Center *"
              placeholder="Search operational service centers..."
              partyType="ASF"
              required
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setLocationEditEngineer(null)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleUpdateLocation}
              disabled={updateLocationMutation.isPending || !newLocationId}
            >
              {updateLocationMutation.isPending ? <CircularProgress size={20} /> : 'Save Location'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Modal: Deactivation Safeguard Dialog */}
        <Dialog open={Boolean(deactivateEngineer)} onClose={() => setDeactivateEngineer(null)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ color: 'error.main' }}>Deactivate Field Technician</DialogTitle>
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {deactivateError && <Alert severity="error">{deactivateError}</Alert>}

            {deactivateEngineer && deactivateEngineer.openJobCount > 0 ? (
              <>
                <Alert severity="warning" icon={<WarningAmberIcon />}>
                  <strong>Active Job Safeguard:</strong> This technician currently has{' '}
                  <strong>{deactivateEngineer.openJobCount} active assigned job(s)</strong>. To protect service SLA
                  commitments, you must reassign all open visits to another active technician before deactivation.
                </Alert>

                <FormControl fullWidth size="small" required sx={{ mt: 1 }}>
                  <InputLabel>Select Replacement Field Technician *</InputLabel>
                  <Select
                    value={replacementEngineerId}
                    label="Select Replacement Field Technician *"
                    onChange={(e) => setReplacementEngineerId(e.target.value)}
                  >
                    {otherActiveEngineers.map((other) => (
                      <MenuItem key={other.userId} value={other.userId}>
                        {other.fullName} ({other.username}) — {other.homeLocationCode || 'Center'} [{other.openJobCount} active jobs]
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            ) : (
              <DialogContentText>
                Are you sure you want to deactivate technician <strong>{deactivateEngineer?.fullName}</strong>? They will no longer be able to log in or be assigned new visits.
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDeactivateEngineer(null)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeactivate}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <CircularProgress size={20} />
              ) : deactivateEngineer && deactivateEngineer.openJobCount > 0 ? (
                'Reassign Jobs & Deactivate'
              ) : (
                'Deactivate Technician'
              )}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Feedback Snackbar */}
        <Snackbar
          open={Boolean(toastMessage)}
          autoHideDuration={4000}
          onClose={() => setToastMessage(null)}
          message={toastMessage}
        />
      </Box>
    </ProtectedRoute>
  );
}
