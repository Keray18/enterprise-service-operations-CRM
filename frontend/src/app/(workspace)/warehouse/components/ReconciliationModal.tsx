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
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AssessmentIcon from '@mui/icons-material/Assessment';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { InventoryBalance, useReconcileStock } from '../../../../lib/warehouseApi';

interface ReconciliationModalProps {
  open: boolean;
  onClose: () => void;
  balance: InventoryBalance | null;
}

export function ReconciliationModal({ open, onClose, balance }: ReconciliationModalProps) {
  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useReconcileStock(balance?.locationId, balance?.partId);

  if (!open || !balance) return null;

  // Defensive validation: ensure nested objects exist before rendering result fields
  const isContractInvalid =
    !isLoading &&
    !isError &&
    Boolean(
      result &&
        (!result.onHand ||
          typeof result.onHand.isBalanced !== 'boolean' ||
          !result.reserved ||
          typeof result.reserved.isBalanced !== 'boolean')
    );

  const isScopeEmpty = Boolean(
    result &&
      result.onHand?.cached === 0 &&
      result.onHand?.movementSum === 0 &&
      result.reserved?.cached === 0 &&
      result.reserved?.activeReservationSum === 0 &&
      result.status === 'BALANCED'
  );

  const hasDiscrepancy = Boolean(
    result &&
      (result.status === 'DISCREPANCY_DETECTED' ||
        !result.isReconciled ||
        result.onHand?.difference !== 0 ||
        result.reserved?.difference !== 0)
  );

  const formattedTimestamp = result?.lastCheckedAt
    ? new Date(result.lastCheckedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      })
    : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 0.75,
              borderRadius: 1.5,
              bgcolor: 'primary.50',
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <AssessmentIcon fontSize="medium" />
          </Box>
          <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Inventory Reconciliation Engine
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Authoritative Balance vs Immutable Movement Ledger Audit
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2.5, pb: 2 }}>
        {/* Scope Context Header */}
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 2.5,
            bgcolor: 'background.paper',
            borderColor: 'divider',
            borderRadius: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {balance.partCode} — {balance.partName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Location: <strong>{balance.locationName}</strong> ({balance.locationCode})
              </Typography>
            </Box>
            {formattedTimestamp && (
              <Chip
                label={`Audited: ${formattedTimestamp}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.72rem' }}
              />
            )}
          </Box>
        </Paper>

        {/* 1. Loading State */}
        {isLoading || isFetching ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
              gap: 2,
            }}
          >
            <CircularProgress size={42} thickness={4} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Auditing movement ledger against live balance records...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Reconciling physical movements and active job reservations
              </Typography>
            </Box>
          </Box>
        ) : isError ? (
          /* 2. Failed API Request State */
          <Box sx={{ py: 2 }}>
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() => refetch()}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Retry
                </Button>
              }
              sx={{ borderRadius: 1.5 }}
            >
              <AlertTitle sx={{ fontWeight: 700 }}>Reconciliation Audit Failed</AlertTitle>
              {error instanceof Error ? error.message : 'An error occurred while fetching reconciliation data from the server.'}
            </Alert>
          </Box>
        ) : isContractInvalid ? (
          /* 3. Invalid or Incomplete Response State */
          <Box sx={{ py: 2 }}>
            <Alert
              severity="warning"
              icon={<WarningAmberIcon />}
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() => refetch()}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Retry
                </Button>
              }
              sx={{ borderRadius: 1.5 }}
            >
              <AlertTitle sx={{ fontWeight: 700 }}>Data Contract Integrity Error</AlertTitle>
              The reconciliation service returned an incomplete response structure. Result fields cannot be evaluated reliably.
            </Alert>
          </Box>
        ) : result ? (
          /* 4. Complete Valid Result */
          <Box>
            {/* Status Banner */}
            <Alert
              severity={hasDiscrepancy ? 'error' : 'success'}
              icon={
                hasDiscrepancy ? (
                  <ErrorOutlineIcon sx={{ fontSize: 26 }} />
                ) : (
                  <CheckCircleIcon sx={{ fontSize: 26 }} />
                )
              }
              sx={{
                mb: 2.5,
                borderRadius: 1.5,
                '& .MuiAlert-message': { width: '100%' },
              }}
            >
              <AlertTitle sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>
                {hasDiscrepancy
                  ? 'Discrepancy Detected — Investigation Required'
                  : isScopeEmpty
                  ? 'Scope Verified Empty & Reconciled'
                  : 'Stock Perfectly Balanced'}
              </AlertTitle>
              <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                {hasDiscrepancy
                  ? 'Authoritative stock balances do not match the immutable movement ledger. Discrepancy details are listed below for audit investigation.'
                  : isScopeEmpty
                  ? 'The evaluated inventory scope is confirmed empty (0 physical units) with zero movement or reservation ledger entries. Reconciled successfully.'
                  : 'Authoritative cached balances match the immutable movement ledger and active job reservations with zero variance.'}
              </Typography>
            </Alert>

            {/* Reconciliation Categories */}
            <Grid container spacing={2}>
              {/* On-Hand Physical Stock Audit */}
              <Grid item xs={12} sm={6}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderColor: result.onHand?.isBalanced ? 'success.main' : 'error.main',
                    borderWidth: 1.5,
                    borderRadius: 1.5,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      On-Hand Physical Stock
                    </Typography>
                    <Chip
                      label={result.onHand?.isBalanced ? 'Balanced' : 'Discrepancy'}
                      size="small"
                      color={result.onHand?.isBalanced ? 'success' : 'error'}
                      sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                    />
                  </Box>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Cached Balance: <strong>{result.onHand?.cached ?? 0}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Ledger Movement Sum: <strong>{result.onHand?.movementSum ?? 0}</strong>
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Variance:
                      </Typography>
                      <Chip
                        label={
                          (result.onHand?.difference ?? 0) === 0
                            ? '0 (Zero Variance)'
                            : `${(result.onHand?.difference ?? 0) > 0 ? '+' : ''}${result.onHand?.difference ?? 0}`
                        }
                        size="small"
                        color={result.onHand?.isBalanced ? 'success' : 'error'}
                      />
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              {/* Reserved Stock Audit */}
              <Grid item xs={12} sm={6}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderColor: result.reserved?.isBalanced ? 'success.main' : 'error.main',
                    borderWidth: 1.5,
                    borderRadius: 1.5,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      Job Reserved Stock
                    </Typography>
                    <Chip
                      label={result.reserved?.isBalanced ? 'Balanced' : 'Discrepancy'}
                      size="small"
                      color={result.reserved?.isBalanced ? 'success' : 'error'}
                      sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                    />
                  </Box>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Cached Reserved: <strong>{result.reserved?.cached ?? 0}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Reservations: <strong>{result.reserved?.activeReservationSum ?? 0}</strong>
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Variance:
                      </Typography>
                      <Chip
                        label={
                          (result.reserved?.difference ?? 0) === 0
                            ? '0 (Zero Variance)'
                            : `${(result.reserved?.difference ?? 0) > 0 ? '+' : ''}${result.reserved?.difference ?? 0}`
                        }
                        size="small"
                        color={result.reserved?.isBalanced ? 'success' : 'error'}
                      />
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            </Grid>

            {/* Audit Notice */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 2, fontStyle: 'italic', textAlign: 'center' }}
            >
              Reconciliation is an audit operation. Stock balances and ledger records remain unchanged.
            </Typography>
          </Box>
        ) : null}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          startIcon={<RefreshIcon />}
          size="small"
          sx={{ textTransform: 'none' }}
        >
          Re-Audit
        </Button>
        <Button onClick={onClose} variant="contained" sx={{ textTransform: 'none' }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
