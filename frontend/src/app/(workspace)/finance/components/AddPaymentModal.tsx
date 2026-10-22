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
import { useDepositWallet, BrandWallet } from '../../../../lib/financeApi';

interface AddPaymentModalProps {
  open: boolean;
  onClose: () => void;
  wallets: BrandWallet[];
  preselectedBrandId?: string;
}

export function AddPaymentModal({
  open,
  onClose,
  wallets,
  preselectedBrandId,
}: AddPaymentModalProps) {
  const [brandId, setBrandId] = useState(preselectedBrandId || (wallets[0]?.brandId ?? ''));
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'NEFT_RTGS' | 'CHEQUE' | 'BANK_TRANSFER'>('NEFT_RTGS');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const depositMutation = useDepositWallet();

  const handleOpen = () => {
    if (preselectedBrandId) {
      setBrandId(preselectedBrandId);
    } else if (wallets.length > 0 && !brandId) {
      setBrandId(wallets[0].brandId);
    }
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Please enter a valid deposit amount greater than zero.');
      return;
    }
    if (!referenceNumber.trim()) {
      setErrorMsg('Bank UTR / Transaction Reference number is mandatory.');
      return;
    }
    if (!brandId) {
      setErrorMsg('Please select a brand.');
      return;
    }

    try {
      await depositMutation.mutateAsync({
        brandId,
        amount: numAmount,
        paymentMode,
        referenceNumber: referenceNumber.trim(),
        remarks: remarks.trim() || undefined,
        idempotencyKey: `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      });
      setAmount('');
      setReferenceNumber('');
      setRemarks('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to deposit payment into brand wallet.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth TransitionProps={{ onEnter: handleOpen }}>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Add Payment in Brand Wallet
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
            Credit prepaid warranty reserve fund (Legacy Manual Slide 20 & 21)
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

          <FormControl fullWidth size="small">
            <InputLabel id="brand-select-label">Select Brand</InputLabel>
            <Select
              labelId="brand-select-label"
              value={brandId}
              label="Select Brand"
              onChange={(e) => setBrandId(e.target.value)}
              disabled={!!preselectedBrandId}
            >
              {wallets.map((w) => (
                <MenuItem key={w.walletId} value={w.brandId}>
                  {w.brandName || w.brandCode} (Current Bal: ₹{w.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Deposit Amount (₹)"
            type="number"
            size="small"
            fullWidth
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: '1', step: '0.01' }}
            placeholder="e.g. 50000.00"
          />

          <FormControl fullWidth size="small">
            <InputLabel id="payment-mode-label">Payment Mode</InputLabel>
            <Select
              labelId="payment-mode-label"
              value={paymentMode}
              label="Payment Mode"
              onChange={(e) => setPaymentMode(e.target.value as any)}
            >
              <MenuItem value="NEFT_RTGS">NEFT / RTGS Bank Transfer</MenuItem>
              <MenuItem value="CHEQUE">Cheque / Demand Draft</MenuItem>
              <MenuItem value="BANK_TRANSFER">Direct Electronic Transfer</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Bank Reference Number / UTR"
            size="small"
            fullWidth
            required
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="e.g. UTR192837465012"
            helperText="Bank transaction identifier for reconciliation audit"
          />

          <TextField
            label="Deposit Remarks / Notes"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Q3 Warranty Reserve Advance per Service Agreement"
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={depositMutation.isPending}
            startIcon={depositMutation.isPending ? <CircularProgress size={16} /> : undefined}
          >
            Submit Deposit
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
