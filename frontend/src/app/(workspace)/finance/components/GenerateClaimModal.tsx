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
import { useGenerateClaimBatch, useEligibleClaimJobs, BrandWallet } from '../../../../lib/financeApi';
import { useAuth } from '../../../../providers/AuthProvider';

interface GenerateClaimModalProps {
  open: boolean;
  onClose: () => void;
  wallets: BrandWallet[];
  asfLocationId?: string;
}

export function GenerateClaimModal({ open, onClose, wallets, asfLocationId }: GenerateClaimModalProps) {
  const { user } = useAuth();
  const effectiveAsfId = asfLocationId || user?.locationId || '00000000-0000-0000-0004-000000000001';

  const now = new Date();
  const [claimMonth, setClaimMonth] = useState<number>(now.getMonth() + 1);
  const [claimYear, setClaimYear] = useState<number>(now.getFullYear());
  const [brandId, setBrandId] = useState<string>(wallets[0]?.brandId || '00000000-0000-0000-0001-000000000001');
  const [remarks, setRemarks] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: eligibleJobs, isLoading: loadingJobs } = useEligibleClaimJobs({
    asfLocationId: open ? effectiveAsfId : undefined,
    brandId: open ? brandId : undefined,
  });

  const generateMutation = useGenerateClaimBatch();

  const totalEligibleLabor = (eligibleJobs || []).reduce((acc, j) => acc + j.claimableLaborAmount, 0);
  const totalEligibleTravel = (eligibleJobs || []).reduce((acc, j) => acc + j.claimableTravelAmount, 0);
  const totalEstimatedClaim = totalEligibleLabor + totalEligibleTravel;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!effectiveAsfId) {
      setErrorMsg('No authorized ASF Franchise location associated with current user session.');
      return;
    }

    try {
      await generateMutation.mutateAsync({
        asfLocationId: effectiveAsfId,
        brandId: brandId || undefined,
        claimMonth,
        claimYear,
        remarks: remarks.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate monthly service claim batch.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Generate Monthly Service Claim Batch
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
            Aggregate closed & Happy Code-verified service calls for franchise remuneration
          </Typography>
        </DialogTitle>

        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="month-select-label">Claim Month</InputLabel>
              <Select
                labelId="month-select-label"
                value={claimMonth}
                label="Claim Month"
                onChange={(e) => setClaimMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <MenuItem key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })} ({m})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="year-select-label">Claim Year</InputLabel>
              <Select
                labelId="year-select-label"
                value={claimYear}
                label="Claim Year"
                onChange={(e) => setClaimYear(Number(e.target.value))}
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel id="brand-select-label">Brand Partner</InputLabel>
            <Select
              labelId="brand-select-label"
              value={brandId}
              label="Brand Partner"
              onChange={(e) => setBrandId(e.target.value)}
            >
              {wallets.map((w) => (
                <MenuItem key={w.walletId} value={w.brandId}>
                  {w.brandName || w.brandCode}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Eligible Jobs Preview Box */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 1 }}>
              ELIGIBLE HAPPY CODE-VERIFIED CALLS PREVIEW
            </Typography>
            {loadingJobs ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Scanning verified service jobs...
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Eligible Jobs Count:
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {eligibleJobs?.length || 0} jobs
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Estimated Labor & TAT Amount:
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    ₹{totalEligibleLabor.toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Estimated Travel Reimbursement:
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    ₹{totalEligibleTravel.toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" fontWeight={700}>
                    Total Claim Estimate:
                  </Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    ₹{totalEstimatedClaim.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            )}
          </Paper>

          <TextField
            label="Batch Notes / Remarks"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Monthly claim batch for authorized on-site repair calls"
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={generateMutation.isPending}
            startIcon={generateMutation.isPending ? <CircularProgress size={16} /> : undefined}
          >
            Generate & Submit Batch
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
