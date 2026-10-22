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
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useCreateSettlementBatch, useServiceClaims } from '../../../../lib/financeApi';

interface SettlementModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettlementModal({ open, onClose }: SettlementModalProps) {
  const createMutation = useCreateSettlementBatch();

  const [paymentMode, setPaymentMode] = useState<'BANK_NEFT' | 'RTGS' | 'CHEQUE'>('BANK_NEFT');
  const [paymentReference, setPaymentReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch posted claims ready for settlement
  const { data: claimsData, isLoading: loadingClaims } = useServiceClaims({
    status: 'POSTED',
    limit: 50,
  });

  const availableClaims = claimsData?.items || [];

  const handleToggleClaim = (claimId: string) => {
    setSelectedClaimIds((prev) =>
      prev.includes(claimId) ? prev.filter((id) => id !== claimId) : [...prev, claimId]
    );
  };

  const handleSelectAll = () => {
    if (selectedClaimIds.length === availableClaims.length) {
      setSelectedClaimIds([]);
    } else {
      setSelectedClaimIds(availableClaims.map((c) => c.claimId));
    }
  };

  const selectedClaims = availableClaims.filter((c) => selectedClaimIds.includes(c.claimId));
  const totalDisbursementAmount = selectedClaims.reduce((acc, c) => acc + c.netClaimAmount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedClaimIds.length === 0) {
      setErrorMsg('Please select at least one approved service claim batch to settle.');
      return;
    }
    if (!paymentReference.trim()) {
      setErrorMsg('NEFT / RTGS Bank UTR or Cheque Number is mandatory.');
      return;
    }

    const asfLocationId = selectedClaims[0]?.asfLocationId;
    if (!asfLocationId) {
      setErrorMsg('Unable to determine franchise location.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        asfLocationId,
        claimIds: selectedClaimIds,
        paymentMode,
        paymentReference: paymentReference.trim(),
        remarks: remarks.trim() || undefined,
      });
      setSelectedClaimIds([]);
      setPaymentReference('');
      setRemarks('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to disburse franchisee settlement batch.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Create Franchisee Settlement Disbursement
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
            Clear ASF Payable liabilities via balanced bank disbursement entry
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Select Approved Claims for Disbursement ({selectedClaimIds.length} of {availableClaims.length} selected)
          </Typography>

          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 240 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={availableClaims.length > 0 && selectedClaimIds.length === availableClaims.length}
                      indeterminate={selectedClaimIds.length > 0 && selectedClaimIds.length < availableClaims.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Claim Batch</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Franchise</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                  <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Jobs</TableCell>
                  <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Net Payable (₹)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingClaims ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : availableClaims.length > 0 ? (
                  availableClaims.map((c) => (
                    <TableRow
                      key={c.claimId}
                      hover
                      onClick={() => handleToggleClaim(c.claimId)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={selectedClaimIds.includes(c.claimId)} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.claimNumber}</TableCell>
                      <TableCell>{c.asfLocationName || c.asfLocationId}</TableCell>
                      <TableCell>{c.claimMonth}/{c.claimYear}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>{c.totalJobsCount}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                        ₹{c.netClaimAmount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                      No posted claims currently pending payout settlement.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Total Disbursement Payable:
            </Typography>
            <Typography variant="h6" color="primary.main" fontWeight={700}>
              ₹{totalDisbursementAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Typography>
          </Paper>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="payment-mode-label">Payment Mode</InputLabel>
              <Select
                labelId="payment-mode-label"
                value={paymentMode}
                label="Payment Mode"
                onChange={(e) => setPaymentMode(e.target.value as any)}
              >
                <MenuItem value="BANK_NEFT">Bank NEFT Transfer</MenuItem>
                <MenuItem value="RTGS">RTGS Real-Time Transfer</MenuItem>
                <MenuItem value="CHEQUE">Corporate Cheque</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Bank Reference / UTR Number"
              size="small"
              fullWidth
              required
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. UTR-AXIS-20261022-9481"
            />
          </Box>

          <TextField
            label="Disbursement Remarks"
            size="small"
            fullWidth
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Cleared via Axis Corporate NetBanking bulk payment"
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={createMutation.isPending || selectedClaimIds.length === 0}
            startIcon={createMutation.isPending ? <CircularProgress size={16} /> : undefined}
          >
            Disburse Settlement (₹{totalDisbursementAmount.toFixed(2)})
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
