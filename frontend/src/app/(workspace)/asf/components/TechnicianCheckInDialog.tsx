'use client';

import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import KeyIcon from '@mui/icons-material/Key';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

import {
  AsfQueueItem,
  useCheckInComplaint,
  useRegenerateOtp,
} from '../../../../lib/asfApi';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';

interface TechnicianCheckInDialogProps {
  open: boolean;
  onClose: () => void;
  request: AsfQueueItem | null;
  onSuccess: () => void;
}

export function TechnicianCheckInDialog({
  open,
  onClose,
  request,
  onSuccess,
}: TechnicianCheckInDialogProps) {
  const checkInMutation = useCheckInComplaint();
  const regenOtpMutation = useRegenerateOtp();

  const [otp, setOtp] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [regenSuccessMsg, setRegenSuccessMsg] = useState<string | null>(null);
  const [checkedInSuccess, setCheckedInSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setOtp('');
      setRemarks('');
      setCoords({});
      setDetectingLocation(false);
      setErrorMessage(null);
      setRegenSuccessMsg(null);
      setCheckedInSuccess(false);
    }
  }, [open, request]);

  const handleCaptureLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        });
        setDetectingLocation(false);
      },
      (err) => {
        setErrorMessage(`Could not retrieve GPS coordinates: ${err.message}`);
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleRegenerateOtp = async () => {
    if (!request) return;
    setErrorMessage(null);
    setRegenSuccessMsg(null);

    try {
      const res = await regenOtpMutation.mutateAsync({
        requestId: request.requestId,
        reason: 'Customer requested OTP resend at location',
      });
      setRegenSuccessMsg(`New check-in OTP generated & queued via SMS 6. Valid until ${new Date(res.otpExpiresAt).toLocaleTimeString()}.`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to regenerate customer OTP.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;

    const trimmedOtp = otp.trim();
    if (!/^\d{6}$/.test(trimmedOtp)) {
      setErrorMessage('Please enter a valid 6-digit numeric OTP.');
      return;
    }

    setErrorMessage(null);

    try {
      await checkInMutation.mutateAsync({
        requestId: request.requestId,
        otp: trimmedOtp,
        checkInLatitude: coords.latitude,
        checkInLongitude: coords.longitude,
        remarks: remarks.trim() || undefined,
      });

      setCheckedInSuccess(true);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Check-in OTP verification failed.');
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VerifiedUserIcon color="primary" />
            <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
              Technician On-Site Check-In
            </Typography>
          </Box>
          <StatusBadge status={request.status} />
        </Box>
      </DialogTitle>

      <Divider />

      {checkedInSuccess ? (
        <DialogContent sx={{ py: 4, textAlign: 'center' }}>
          <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark', mb: 1 }}>
            Check-In Verified & Recorded!
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Field visit for Job <strong>#{request.jobNumber}</strong> has been successfully verified.
            The service request state is now <strong>TECHNICIAN_CHECKED_IN</strong>.
          </Typography>
          <Alert severity="info" sx={{ textAlign: 'left', maxWidth: 450, mx: 'auto' }}>
            Check-in timestamp and geocoordinates have been immutably recorded in the audit event history.
            Diagnostic and repair workflows are now unlocked for subsequent processing.
          </Alert>
        </DialogContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ pt: 2 }}>
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorMessage}
              </Alert>
            )}

            {regenSuccessMsg && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {regenSuccessMsg}
              </Alert>
            )}

            {/* Visit Context */}
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
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Job Number
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    #{request.jobNumber}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Appointment
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {request.appointmentSlot || 'SCHEDULED'}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Customer & Destination
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {request.customerName} ({request.customerPhone})
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {request.customerAddress}, {request.customerPincode}
                  </Typography>
                </Grid>
              </Grid>
            </Box>

            {/* OTP Input Field */}
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <KeyIcon fontSize="small" color="primary" />
                Customer Verification OTP
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Ask the customer for the 6-digit Check-In code received via SMS 2 or SMS 6 upon technician arrival.
              </Typography>

              <TextField
                fullWidth
                required
                autoFocus
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                }}
                placeholder="1 2 3 4 5 6"
                inputProps={{
                  maxLength: 6,
                  style: {
                    fontSize: '1.75rem',
                    letterSpacing: '0.5rem',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  },
                }}
                helperText="Maximum 5 attempts allowed before permanent lockout. Stored via salted SHA-256."
              />
            </Box>

            {/* GPS Location Capture */}
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  GPS Location Validation (Optional)
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleCaptureLocation}
                  disabled={detectingLocation}
                  startIcon={detectingLocation ? <CircularProgress size={14} /> : <MyLocationIcon />}
                >
                  {detectingLocation ? 'Locating...' : 'Capture GPS'}
                </Button>
              </Box>

              {coords.latitude && coords.longitude ? (
                <Chip
                  color="success"
                  variant="outlined"
                  size="small"
                  label={`GPS Coordinates: ${coords.latitude}, ${coords.longitude}`}
                />
              ) : (
                <Typography variant="caption" color="text.disabled">
                  No GPS coordinates tagged yet.
                </Typography>
              )}
            </Box>

            {/* Remarks */}
            <TextField
              fullWidth
              size="small"
              label="Arrival Notes / Remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Customer present at location, unit powered off."
              sx={{ mb: 2 }}
            />

            {/* Resend OTP Helper */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                backgroundColor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                  Customer did not receive SMS?
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Regenerates a new 6-digit OTP and supersedes the prior code via SMS 6.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="text"
                color="secondary"
                onClick={handleRegenerateOtp}
                disabled={regenOtpMutation.isPending}
                startIcon={regenOtpMutation.isPending ? <CircularProgress size={14} /> : <ReplayIcon />}
              >
                Resend OTP
              </Button>
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose} color="inherit" disabled={checkInMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={checkInMutation.isPending || otp.length !== 6}
              startIcon={checkInMutation.isPending ? <CircularProgress size={18} color="inherit" /> : <VerifiedUserIcon />}
            >
              {checkInMutation.isPending ? 'Verifying OTP...' : 'Verify OTP & Check-In'}
            </Button>
          </DialogActions>
        </form>
      )}

      {checkedInSuccess && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} variant="contained" color="primary">
            Close
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
