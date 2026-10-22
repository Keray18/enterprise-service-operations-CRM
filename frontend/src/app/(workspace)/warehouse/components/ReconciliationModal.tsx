'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AssessmentIcon from '@mui/icons-material/Assessment';

import { InventoryBalance, useReconcileStock } from '../../../../lib/warehouseApi';

interface ReconciliationModalProps {
  open: boolean;
  onClose: () => void;
  balance: InventoryBalance | null;
}

export function ReconciliationModal({ open, onClose, balance }: ReconciliationModalProps) {
  const { data: result, isLoading } = useReconcileStock(balance?.locationId, balance?.partId);

  if (!balance) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssessmentIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Inventory Reconciliation Engine
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {balance.partCode} — {balance.partName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Location: {balance.locationName} ({balance.locationCode})
          </Typography>
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : result ? (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
              {result.status === 'BALANCED' ? (
                <>
                  <CheckCircleIcon color="success" sx={{ fontSize: 28 }} />
                  <Typography variant="h6" color="success.main" sx={{ fontWeight: 700 }}>
                    Stock Perfectly Balanced
                  </Typography>
                </>
              ) : (
                <>
                  <ErrorOutlineIcon color="error" sx={{ fontSize: 28 }} />
                  <Typography variant="h6" color="error.main" sx={{ fontWeight: 700 }}>
                    Discrepancy Detected!
                  </Typography>
                </>
              )}
            </Box>

            <Grid container spacing={2}>
              {/* On-Hand Audit */}
              <Grid item xs={12} sm={6}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderColor: result.onHand.isBalanced ? 'success.main' : 'error.main',
                    borderWidth: 1.5,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                    On-Hand Physical Stock
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Cached Balance: <strong>{result.onHand.cached}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Ledger Movement Sum: <strong>{result.onHand.movementSum}</strong>
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Variance:
                      </Typography>
                      <Chip
                        label={result.onHand.difference === 0 ? '0 (Zero Variance)' : `${result.onHand.difference}`}
                        size="small"
                        color={result.onHand.isBalanced ? 'success' : 'error'}
                      />
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              {/* Reserved Audit */}
              <Grid item xs={12} sm={6}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderColor: result.reserved.isBalanced ? 'success.main' : 'error.main',
                    borderWidth: 1.5,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                    Job Reserved Stock
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Cached Reserved: <strong>{result.reserved.cached}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Reservations: <strong>{result.reserved.activeReservationSum}</strong>
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Variance:
                      </Typography>
                      <Chip
                        label={result.reserved.difference === 0 ? '0 (Zero Variance)' : `${result.reserved.difference}`}
                        size="small"
                        color={result.reserved.isBalanced ? 'success' : 'error'}
                      />
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </Box>
        ) : (
          <Typography color="error">Failed to load reconciliation data.</Typography>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="contained" sx={{ textTransform: 'none' }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
