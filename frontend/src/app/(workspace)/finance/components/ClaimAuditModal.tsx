'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useServiceClaim, useAuditClaimBatch } from '../../../../lib/financeApi';
import { useAuth } from '../../../../providers/AuthProvider';

interface ClaimAuditModalProps {
  open: boolean;
  onClose: () => void;
  claimId: string | undefined;
}

export function ClaimAuditModal({ open, onClose, claimId }: ClaimAuditModalProps) {
  const { user } = useAuth();
  const { data: claim, isLoading, error } = useServiceClaim(open ? claimId : undefined);
  const auditMutation = useAuditClaimBatch();

  const [rejectionReason, setRejectionReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSelfSubmitted = user?.userId && claim?.submittedBy && user.userId === claim.submittedBy;

  const handleDecision = async (action: 'APPROVE' | 'REJECT') => {
    if (!claimId) return;
    setErrorMsg(null);

    if (action === 'REJECT' && (!rejectionReason || rejectionReason.trim().length < 5)) {
      setErrorMsg('A detailed rejection reason (minimum 5 characters) is mandatory.');
      return;
    }

    try {
      await auditMutation.mutateAsync({
        claimId,
        body: {
          action,
          rejectionReason: action === 'REJECT' ? rejectionReason.trim() : undefined,
          remarks: remarks.trim() || undefined,
        },
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || `Failed to ${action.toLowerCase()} claim batch.`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          Claim Batch Audit: {claim?.claimNumber || 'Loading...'}
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
            Verify Happy Code closure, SLA turnaround percentages, and commercial remuneration
          </Typography>
        </Box>
        {claim && (
          <Chip
            size="small"
            label={claim.status}
            color={claim.status === 'APPROVED' || claim.status === 'POSTED' ? 'success' : claim.status === 'REJECTED' ? 'error' : 'default'}
            sx={{ fontWeight: 700 }}
          />
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2, pb: 2 }}>
        {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}

        {isSelfSubmitted && (
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
            <strong>Segregation of Duties Enforcement:</strong> You submitted this claim batch. Enterprise governance rules strictly prohibit approving your own claim submission.
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error ? (
          <Alert severity="error">{(error as any)?.message || 'Failed to load claim details.'}</Alert>
        ) : claim ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Header summary row */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">ASF Franchise</Typography>
                  <Typography variant="body2" fontWeight={600}>{claim.asfLocationName || claim.asfLocationId}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Brand Partner</Typography>
                  <Typography variant="body2" fontWeight={600}>{claim.brandName || 'Skatercat'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Billing Period</Typography>
                  <Typography variant="body2" fontWeight={600}>{claim.claimMonth}/{claim.claimYear}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Verified Jobs</Typography>
                  <Typography variant="body2" fontWeight={600}>{claim.totalJobsCount} service calls</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Net Claim Amount</Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    ₹{claim.netClaimAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Line items table */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Claimed Service Jobs ({claim.lineItems?.length || 0})
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 340 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Job Number</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Product / Call</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Happy Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>TAT (Hours)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Applied %</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Labor (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Travel (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Net Line (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Audit Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {claim.lineItems && claim.lineItems.length > 0 ? (
                    claim.lineItems.map((item) => (
                      <TableRow key={item.itemId} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.jobNumber}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{item.productName || 'Air Conditioner'}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.callType}</Typography>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          {item.isHappyCodeVerified === 'Y' ? (
                            <Chip size="small" label="VERIFIED" color="success" sx={{ fontSize: '0.6875rem', fontWeight: 700 }} />
                          ) : (
                            <Chip size="small" label="OVERRIDE" color="warning" sx={{ fontSize: '0.6875rem', fontWeight: 700 }} />
                          )}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          {item.completionTatHours != null ? `${item.completionTatHours}h` : '-'}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          <Chip
                            size="small"
                            label={`${item.tatAppliedPercentage}%`}
                            color={item.tatAppliedPercentage >= 100 ? 'success' : 'warning'}
                            sx={{ fontSize: '0.6875rem', height: 20 }}
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          ₹{item.claimableLaborAmount.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          ₹{item.travelAmount.toFixed(2)}
                          <Typography variant="caption" display="block" color="text.secondary">
                            ({item.travelKm} km)
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          ₹{item.netLineAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={item.auditStatus}
                            variant="outlined"
                            color={item.auditStatus === 'VERIFIED' ? 'success' : 'default'}
                            sx={{ fontSize: '0.6875rem' }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                        No job breakdown line items recorded for this claim.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Audit Actions area if claim is SUBMITTED */}
            {claim.status === 'SUBMITTED' && (
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2, border: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Audit Decision
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <TextField
                    label="Audit Remarks / Notes"
                    size="small"
                    fullWidth
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Verified against franchise Happy Code SMS dispatch log and rate matrix"
                  />

                  {actionType === 'REJECT' && (
                    <TextField
                      label="Rejection Reason"
                      size="small"
                      fullWidth
                      required
                      multiline
                      rows={2}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Explain the audit defect or discrepancy for rejection..."
                      error={rejectionReason.length > 0 && rejectionReason.trim().length < 5}
                      helperText="Minimum 5 characters required"
                    />
                  )}
                </Box>
              </Box>
            )}
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>

        {claim?.status === 'SUBMITTED' && (
          <>
            {actionType !== 'REJECT' ? (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                disabled={isSelfSubmitted || auditMutation.isPending}
                onClick={() => setActionType('REJECT')}
              >
                Reject Batch
              </Button>
            ) : (
              <Button
                variant="contained"
                color="error"
                disabled={isSelfSubmitted || auditMutation.isPending || rejectionReason.trim().length < 5}
                onClick={() => handleDecision('REJECT')}
              >
                Confirm Rejection
              </Button>
            )}

            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              disabled={isSelfSubmitted || auditMutation.isPending}
              onClick={() => handleDecision('APPROVE')}
            >
              Approve & Post Journal
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
