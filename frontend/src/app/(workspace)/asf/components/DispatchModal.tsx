'use client';

import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';

import { AsfQueueItem, EligibleEngineer, useDispatchComplaint, useEligibleEngineers } from '../../../../lib/asfApi';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';
import { SlaCounter } from '../../../../components/feedback/SlaCounter';

interface DispatchModalProps {
  open: boolean;
  onClose: () => void;
  request: AsfQueueItem | null;
  onSuccess: () => void;
}

export function DispatchModal({ open, onClose, request, onSuccess }: DispatchModalProps) {
  const dispatchMutation = useDispatchComplaint();

  // Tomorrow's date in YYYY-MM-DD
  const tomorrowStr = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [appointmentDate, setAppointmentDate] = useState<string>(tomorrowStr);
  const [appointmentSlot, setAppointmentSlot] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [engineerId, setEngineerId] = useState<string>('');
  const [areaType, setAreaType] = useState<'LOCAL' | 'UPCOUNTRY'>('LOCAL');
  const [travelDistanceKm, setTravelDistanceKm] = useState<string>('5');
  const [remarks, setRemarks] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    jobNumber: string;
    engineerName?: string;
    appointmentDate: string;
    appointmentSlot: string;
    devOtpPreview?: string;
  } | null>(null);
  const [copiedOtp, setCopiedOtp] = useState<boolean>(false);

  // Fetch centralized eligible engineers across the network
  const {
    data: engineers = [],
    isLoading: loadingEngineers,
    isError: isEngineersError,
    error: engineersError,
    refetch: refetchEngineers,
  } = useEligibleEngineers();

  const selectedEngineer = React.useMemo(() => {
    return engineers.find((e) => e.userId === engineerId) || null;
  }, [engineers, engineerId]);

  const isCrossLocation = Boolean(
    selectedEngineer?.homeLocationId &&
    request?.assignedLocationId &&
    selectedEngineer.homeLocationId !== request.assignedLocationId
  );

  useEffect(() => {
    if (open) {
      setAppointmentDate(tomorrowStr);
      setAppointmentSlot('MORNING');
      setEngineerId(request?.assignedEngineerId || '');
      setAreaType(
        request?.areaType === 'RURAL' || request?.areaType === 'UPCOUNTRY'
          ? 'UPCOUNTRY'
          : 'LOCAL'
      );
      setTravelDistanceKm(request?.travelDistanceKm ? String(request.travelDistanceKm) : '5');
      setRemarks('');
      setErrorMessage(null);
      setSuccessResult(null);
    }
  }, [open, request, tomorrowStr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;

    if (!engineerId) {
      setErrorMessage('Please select an authorized field service engineer.');
      return;
    }
    if (!appointmentDate) {
      setErrorMessage('Please select a valid appointment date.');
      return;
    }

    setErrorMessage(null);

    try {
      const res = await dispatchMutation.mutateAsync({
        requestId: request.requestId,
        engineerId,
        appointmentDate,
        appointmentSlot,
        travelDistanceKm: travelDistanceKm ? Number(travelDistanceKm) : undefined,
        areaType,
        remarks: remarks.trim() || undefined,
      });

      setSuccessResult({
        jobNumber: res.jobNumber || request.jobNumber,
        engineerName: selectedEngineer?.fullName || res.assignedEngineerName,
        appointmentDate: res.appointmentDate || appointmentDate,
        appointmentSlot: res.appointmentSlot || appointmentSlot,
        devOtpPreview: res.devOtpPreview,
      });

      onSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to dispatch service request.');
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <SendIcon color="primary" sx={{ fontSize: 28 }} />
            <Box>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Assign Technician &amp; Schedule Visit
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Allocate an authorized field service technician and schedule the on-site visit.
              </Typography>
            </Box>
          </Box>
          <StatusBadge status={request.status} />
        </Box>
      </DialogTitle>

      <Divider />

      {successResult ? (
        <DialogContent sx={{ py: 4 }}>
          <Box sx={{ textAlign: 'center', p: 3, backgroundColor: 'success.50', borderRadius: 2 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark', mb: 1 }}>
              Dispatch &amp; Appointment Confirmed!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Job <strong>#{successResult.jobNumber}</strong> has been assigned to{' '}
              <strong>{successResult.engineerName || 'Field Technician'}</strong> for{' '}
              <strong>{successResult.appointmentDate}</strong> ({successResult.appointmentSlot}).
            </Typography>
            <Alert severity="info" sx={{ textAlign: 'left', maxWidth: 500, mx: 'auto' }}>
              A 6-digit Check-In OTP was cryptographically generated and queued in the transactional outbox (SMS 2)
              for immediate delivery to the customer.
            </Alert>

            {successResult.devOtpPreview && (
              <Box
                sx={{
                  mt: 2.5,
                  p: 2,
                  backgroundColor: '#fffbe6',
                  border: '2px dashed #faad14',
                  borderRadius: 2,
                  maxWidth: 500,
                  mx: 'auto',
                }}
              >
                <Chip
                  label="Development Only Test OTP"
                  color="warning"
                  size="small"
                  sx={{ fontWeight: 700, mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.8rem' }}>
                  Accessible only in development environment (<code>ENABLE_DEV_OTP_PREVIEW=true</code>) for testing check-in workflows.
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <Typography
                    variant="h4"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 850,
                      letterSpacing: 6,
                      color: '#d46b08',
                      px: 2,
                      py: 0.5,
                      backgroundColor: '#fff',
                      borderRadius: 1,
                      border: '1px solid #ffe58f',
                    }}
                  >
                    {successResult.devOtpPreview}
                  </Typography>
                  <Button
                    variant="contained"
                    color="warning"
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(successResult.devOtpPreview!);
                      setCopiedOtp(true);
                      setTimeout(() => setCopiedOtp(false), 3000);
                    }}
                  >
                    {copiedOtp ? 'Copied!' : 'Copy Test OTP'}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ pt: 2 }}>
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorMessage}
              </Alert>
            )}

            {/* Context Summary Cards */}
            <Box
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                backgroundColor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    Job Number &amp; SLA
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    #{request.jobNumber}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <SlaCounter
                      remainingHours={request.slaStatus?.remainingHours || 0}
                      breached={request.slaStatus?.isBreached}
                    />
                  </Box>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    Customer &amp; Location
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {request.customerName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {request.customerPhone}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>
                    {request.customerAddress}, {request.customerPincode}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, display: 'block', mt: 0.5 }}>
                    Center: {request.assignedLocationName || 'Unassigned Center'}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    Appliance &amp; Complaint
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {request.brandName} - {request.modelName}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={request.vocDescription || request.callType}
                    sx={{ mt: 0.5, fontSize: '0.75rem' }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarMonthIcon fontSize="small" color="primary" />
              Appointment &amp; Engineer Assignment
            </Typography>

            <Grid container spacing={2}>
              {/* Appointment Date */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  type="date"
                  label="Appointment Date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: new Date().toISOString().split('T')[0] }}
                />
              </Grid>

              {/* Appointment Slot */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel id="slot-select-label">Time Slot</InputLabel>
                  <Select
                    labelId="slot-select-label"
                    value={appointmentSlot}
                    label="Time Slot"
                    onChange={(e) => setAppointmentSlot(e.target.value as any)}
                  >
                    <MenuItem value="MORNING">Morning (09:00 AM – 01:00 PM)</MenuItem>
                    <MenuItem value="AFTERNOON">Afternoon (01:00 PM – 05:00 PM)</MenuItem>
                    <MenuItem value="EVENING">Evening (05:00 PM – 08:00 PM)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Searchable Field Engineer Directory */}
              <Grid item xs={12}>
                {isEngineersError ? (
                  <Alert
                    severity="error"
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={() => refetchEngineers()}
                      >
                        Retry
                      </Button>
                    }
                    sx={{ mb: 1.5 }}
                  >
                    Failed to load technician directory: {(engineersError as any)?.message || 'Directory access error'}.
                  </Alert>
                ) : null}

                <Autocomplete
                  options={engineers}
                  getOptionLabel={(option) => `${option.fullName} (@${option.username})`}
                  value={selectedEngineer}
                  onChange={(_, newValue: EligibleEngineer | null) => {
                    setEngineerId(newValue ? newValue.userId : '');
                  }}
                  loading={loadingEngineers}
                  disabled={loadingEngineers || isEngineersError}
                  isOptionEqualToValue={(option, value) => option.userId === value.userId}
                  filterOptions={(options, state) => {
                    const query = state.inputValue.toLowerCase().trim();
                    if (!query) return options;
                    return options.filter((opt) =>
                      opt.fullName.toLowerCase().includes(query) ||
                      opt.username.toLowerCase().includes(query) ||
                      (opt.phoneNumber && opt.phoneNumber.includes(query)) ||
                      (opt.homeLocationName && opt.homeLocationName.toLowerCase().includes(query)) ||
                      (opt.homeLocationCode && opt.homeLocationCode.toLowerCase().includes(query))
                    );
                  }}
                  noOptionsText={
                    loadingEngineers
                      ? 'Loading authorized technicians...'
                      : isEngineersError
                      ? 'Failed to load technician directory.'
                      : engineers.length === 0
                      ? 'No active field engineers exist across the network.'
                      : 'No matching eligible field engineers found.'
                  }
                  renderOption={(props, option) => {
                    const isOptionCross = Boolean(
                      option.homeLocationId &&
                      request?.assignedLocationId &&
                      option.homeLocationId !== request.assignedLocationId
                    );
                    const availColor =
                      option.availabilityStatus === 'AVAILABLE'
                        ? 'success'
                        : option.availabilityStatus === 'ACTIVE'
                        ? 'primary'
                        : 'warning';

                    return (
                      <Box component="li" {...props} key={option.userId} sx={{ py: 1.5, px: 2 }}>
                        <Box sx={{ width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <PersonIcon fontSize="small" color="primary" />
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {option.fullName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                (@{option.username})
                              </Typography>
                              {option.phoneNumber && (
                                <Typography variant="caption" color="text.secondary">
                                  • {option.phoneNumber}
                                </Typography>
                              )}
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Chip
                                size="small"
                                label={`${option.openJobCount} active jobs`}
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                              <Chip
                                size="small"
                                label={option.availabilityStatus}
                                color={availColor}
                                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                              />
                              {isOptionCross && (
                                <Chip
                                  size="small"
                                  label="Cross-Location"
                                  color="warning"
                                  variant="filled"
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                              )}
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              Home Center: {option.homeLocationName || option.homeLocationCode || 'Unassigned Center'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    );
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      required
                      label="Assigned Field Technician"
                      placeholder="Search technician by name, phone, or home center..."
                      error={!engineerId && Boolean(errorMessage)}
                      helperText={
                        loadingEngineers
                          ? 'Loading centralized technician roster...'
                          : isEngineersError
                          ? 'Unable to load technician directory.'
                          : 'Select an authorized field technician across the network for assignment.'
                      }
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingEngineers ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />

                {selectedEngineer && !isCrossLocation && (
                  <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      icon={<CheckCircleIcon sx={{ fontSize: '1rem !important' }} />}
                      label={`Center Aligned: Technician belongs to assigned Service Center (${selectedEngineer.homeLocationName || request?.assignedLocationName || 'Delhi Franchise Service Center'})`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>
                )}

                {isCrossLocation && selectedEngineer && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    <strong>Cross-Center Assignment:</strong> This technician&apos;s home center is{' '}
                    <strong>{selectedEngineer.homeLocationName || selectedEngineer.homeLocationCode || 'External Center'}</strong>, which differs from
                    this complaint&apos;s assigned franchise (<strong>{request?.assignedLocationName || request?.assignedLocationId}</strong>).
                    An auditable cross-location assignment event will be recorded in the complaint history.
                  </Alert>
                )}
              </Grid>

              {/* Area Type */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="area-type-label">Area Classification</InputLabel>
                  <Select
                    labelId="area-type-label"
                    value={areaType}
                    label="Area Classification"
                    onChange={(e) => setAreaType(e.target.value as any)}
                  >
                    <MenuItem value="LOCAL">Local (Within City Limits)</MenuItem>
                    <MenuItem value="UPCOUNTRY">Upcountry (Outskirts / Rural)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Travel Distance KM */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Estimated Travel Distance (KM)"
                  value={travelDistanceKm}
                  onChange={(e) => setTravelDistanceKm(e.target.value)}
                  inputProps={{ min: 0, max: 500, step: 0.5 }}
                  helperText="Required for travel allowance and warranty claim validation"
                />
              </Grid>

              {/* Dispatch Remarks */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Dispatch Remarks / Special Customer Instructions"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Call customer 30 mins before arrival. Customer available after 2 PM."
                />
              </Grid>
            </Grid>

            {/* Atomic Operation Notice */}
            <Box
              sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 1,
                backgroundColor: 'info.50',
                border: '1px solid',
                borderColor: 'info.200',
              }}
            >
              <Typography variant="caption" color="info.dark" sx={{ display: 'block', fontWeight: 500 }}>
                <strong>Single-Commit Atomic Dispatch:</strong> Submitting will atomically acknowledge the complaint,
                schedule the appointment, bind the technician, generate a salted SHA-256 customer Check-In OTP, append an immutable
                lifecycle audit event, and queue SMS 2 in the database outbox.
              </Typography>
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose} color="inherit" disabled={dispatchMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={dispatchMutation.isPending || !engineerId || !appointmentDate}
              startIcon={dispatchMutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
            >
              {dispatchMutation.isPending ? 'Committing Dispatch...' : 'Confirm & Dispatch'}
            </Button>
          </DialogActions>
        </form>
      )}

      {successResult && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} variant="contained" color="primary">
            Done
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
