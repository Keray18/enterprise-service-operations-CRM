'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useReconcileBrandWallet } from '../../../../lib/financeApi';

interface ReconciliationModalProps {
  open: boolean;
  onClose: () => void;
  brandId: string | undefined;
  brandName?: string;
}

export function ReconciliationModal({ open, onClose, brandId, brandName }: ReconciliationModalProps) {
  const { data: recon, isLoading, error, refetch } = useReconcileBrandWallet(open ? brandId : undefined);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Brand Wallet Balance Reconciliation
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
          Authoritative balance vs audit reconstructed transactions ledger
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2.5, pb: 2.5 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 1.5 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              Auditing transactions and reconciling ledger...
            </Typography>
          </Box>
        ) : error ? (
          <Alert severity="error">{(error as any)?.message || 'Failed to reconcile brand wallet.'}</Alert>
        ) : recon ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                bgcolor: recon.isReconciled ? 'success.50' : 'error.50',
                border: 1,
                borderColor: recon.isReconciled ? 'success.200' : 'error.200',
              }}
            >
              {recon.isReconciled ? (
                <CheckCircleOutlineIcon color="success" sx={{ fontSize: 28 }} />
              ) : (
                <WarningAmberIcon color="error" sx={{ fontSize: 28 }} />
              )}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: recon.isReconciled ? 'success.900' : 'error.900' }}>
                  {recon.isReconciled ? 'Authoritative Balance Fully Reconciled' : 'Discrepancy Detected'}
                </Typography>
                <Typography variant="body2" sx={{ color: recon.isReconciled ? 'success.800' : 'error.800', fontSize: '0.8125rem' }}>
                  {recon.isReconciled
                    ? 'Current stored balance exactly matches the mathematical sum of all posted deposits, claims, deductions, and reversals.'
                    : `Discrepancy of ₹${recon.discrepancy.toLocaleString('en-IN', { minimumFractionDigits: 2 })} found between authoritative balance and ledger.`}
                </Typography>
              </Box>
            </Box>

            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.25 }}>
                <Typography variant="body2" color="text.secondary">
                  Brand Name:
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {brandName || 'Brand Partner'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.25 }}>
                <Typography variant="body2" color="text.secondary">
                  Authoritative Stored Balance:
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  ₹{recon.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.25 }}>
                <Typography variant="body2" color="text.secondary">
                  Reconstructed Transaction Sum:
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  ₹{recon.reconstructedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="body2" fontWeight={700}>
                  Variance / Discrepancy:
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={recon.discrepancy === 0 ? 'success.main' : 'error.main'}
                >
                  ₹{recon.discrepancy.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
            </Paper>
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
        <Button size="small" onClick={() => refetch()} color="inherit">
          Re-Check
        </Button>
        <Button variant="contained" size="small" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
