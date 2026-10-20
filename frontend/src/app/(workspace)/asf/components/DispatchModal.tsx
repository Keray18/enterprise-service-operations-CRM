'use client';

import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
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
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BuildIcon from '@mui/icons-material/Build';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { AsfQueueItem, useDispatchComplaint, useEligibleEngineers } from '../../../../lib/asfApi';
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
  const [areaType, setAreaType] = useState<'URBAN' | 'RURAL'>('URBAN');
  const [travelDistanceKm, setTravelDistanceKm] = useState<string>('5');
  const [remarks, setRemarks] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    jobNumber: string;
    engineerName?: string;
    appointmentDate: string;
    appointmentSlot: string;
  } | null>(null);

  // Fetch eligible engineers for this ASF location
  const { data: engineers = [], isLoading: loadingEngineers } = useEligibleEngineers(request?.assignedLocationId);

  useEffect(() => {
    if (open) {
      setAppointmentDate(tomorrowStr);
      setAppointmentSlot('MORNING');
      setEngineerId(request?.assignedEngineerId || '');
      setAreaType(request?.areaType || 'URBAN');
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

      const assignedEng = engineers.find((e) => e.userId === engineerId);
      setSuccessResult({
        jobNumber: res.jobNumber,
        engineerName: assignedEng?.fullName || res.assignedEngineerName,
        appointmentDate: res.appointmentDate,
        appointmentSlot: res.appointmentSlot,
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SendIcon color="primary" />
            <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
              Single-Commit Dispatch & Assignment
            </Typography>
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
              Dispatch & Appointment Confirmed!
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
                    Job Number & SLA
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
                    Customer & Location
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
                </Grid>

                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    Appliance & Complaint
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
              Appointment & Engineer Assignment
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

              {/* Field Engineer */}
              <Grid item xs={12} sm={12}>
                <FormControl fullWidth required error={!engineerId && Boolean(errorMessage)}>
                  <InputLabel id="engineer-select-label">Assigned Field Technician</InputLabel>
                  <Select
                    labelId="engineer-select-label"
                    value={engineerId}
                    label="Assigned Field Technician"
                    onChange={(e) => setEngineerId(e.target.value)}
                    disabled={loadingEngineers}
                  >
                    {engineers.length === 0 ? (
                      <MenuItem value="" disabled>
                        No active field engineers found for this franchise location
                      </MenuItem>
                    ) : (
                      engineers.map((eng) => (
                        <MenuItem key={eng.userId} value={eng.userId}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PersonIcon fontSize="small" color="action" />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {eng.fullName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ({eng.phoneNumber || eng.username})
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))
                    )}
                  </Select>
                  <FormHelperText>
                    {loadingEngineers
                      ? 'Loading authorized franchise engineers...'
                      : 'Only engineers registered and active at this ASF center are eligible.'}
                  </FormHelperText>
                </FormControl>
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
                    <MenuItem value="URBAN">Urban (Within City Limits)</MenuItem>
                    <MenuItem value="RURAL">Rural / Upcountry Outskirts</MenuItem>
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
