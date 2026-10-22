'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useReviewPenalty, SlaPenalty } from '../../../../lib/financeApi';

interface PenaltyReviewModalProps {
  open: boolean;
  onClose: () => void;
  penalty: SlaPenalty | null;
}

export function PenaltyReviewModal({ open, onClose, penalty }: PenaltyReviewModalProps) {
  const reviewMutation = useReviewPenalty();

  const [action, setAction] = useState<'APPROVE' | 'WAIVE' | 'DISPUTE'>('APPROVE');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [waiverPercentage, setWaiverPercentage] = useState<number>(100);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!penalty) return;
    setErrorMsg(null);

    if (!reviewRemarks || reviewRemarks.trim().length < 5) {
      setErrorMsg('A detailed audit review justification (minimum 5 characters) is required.');
      return;
    }

    try {
      await reviewMutation.mutateAsync({
        penaltyId: penalty.penaltyId,
        body: {
          action,
          reviewRemarks: reviewRemarks.trim(),
          waiverPercentage: action === 'WAIVE' ? waiverPercentage : undefined,
        },
      });
      setReviewRemarks('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit penalty review decision.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          SLA Breach Penalty Review
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
            Mandatory human review & authorization before any deduction is debited
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

          {penalty && (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Penalty Identifier</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {penalty.penaltyNumber}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Service Job Number</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {penalty.jobNumber || penalty.serviceRequestId}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Franchise Location</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {penalty.asfLocationName || penalty.asfLocationId}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Breach Type</Typography>
                  <Box sx={{ mt: 0.25 }}>
                    <Chip size="small" label={penalty.breachType} color="warning" sx={{ fontSize: '0.6875rem' }} />
                  </Box>
                </Box>
                <Box sx={{ gridColumn: 'span 2', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">Calculated Breach Amount</Typography>
                  <Typography variant="h6" color="error.main" fontWeight={700}>
                    ₹{penalty.calculatedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}

          <FormControl fullWidth size="small">
            <InputLabel id="decision-action-label">Review Decision</InputLabel>
            <Select
              labelId="decision-action-label"
              value={action}
              label="Review Decision"
              onChange={(e) => setAction(e.target.value as any)}
            >
              <MenuItem value="APPROVE">Approve Deduction (Confirm franchise liability)</MenuItem>
              <MenuItem value="WAIVE">Waive Penalty (Authorized concession / force majeure)</MenuItem>
              <MenuItem value="DISPUTE">Flag Disputed (Refer to Operations Committee)</MenuItem>
            </Select>
          </FormControl>

          {action === 'WAIVE' && (
            <FormControl fullWidth size="small">
              <InputLabel id="waiver-percentage-label">Waiver Percentage</InputLabel>
              <Select
                labelId="waiver-percentage-label"
                value={waiverPercentage}
                label="Waiver Percentage"
                onChange={(e) => setWaiverPercentage(Number(e.target.value))}
              >
                <MenuItem value={100}>100% Full Waiver (₹0.00 penalty applied)</MenuItem>
                <MenuItem value={50}>50% Partial Concession</MenuItem>
                <MenuItem value={25}>25% Partial Concession</MenuItem>
              </Select>
            </FormControl>
          )}

          <TextField
            label="Audit Review Reasoning / Documentation"
            size="small"
            fullWidth
            required
            multiline
            rows={3}
            value={reviewRemarks}
            onChange={(e) => setReviewRemarks(e.target.value)}
            placeholder="Document rationale, e.g. Customer unavailable due to documented outstation travel, SLA waived per supervisor ticket #4928"
            helperText="Mandatory audit trail for corporate finance & brand review"
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={action === 'APPROVE' ? 'error' : action === 'WAIVE' ? 'success' : 'warning'}
            disabled={reviewMutation.isPending}
            startIcon={
              action === 'APPROVE' ? (
                <CheckCircleIcon />
              ) : action === 'WAIVE' ? (
                <CancelIcon />
              ) : (
                <HelpOutlineIcon />
              )
            }
          >
            Submit Decision
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
