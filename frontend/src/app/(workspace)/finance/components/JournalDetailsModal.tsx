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
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useFinancialJournal, useReverseJournal } from '../../../../lib/financeApi';

interface JournalDetailsModalProps {
  open: boolean;
  onClose: () => void;
  journalId: string | undefined;
}

export function JournalDetailsModal({ open, onClose, journalId }: JournalDetailsModalProps) {
  const { data: journal, isLoading, error } = useFinancialJournal(open ? journalId : undefined);
  const reverseMutation = useReverseJournal();

  const [showReverseBox, setShowReverseBox] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReverse = async () => {
    if (!journalId) return;
    setErrorMsg(null);

    if (!reversalReason || reversalReason.trim().length < 5) {
      setErrorMsg('A detailed reversal explanation (minimum 5 characters) is mandatory.');
      return;
    }

    try {
      await reverseMutation.mutateAsync({
        journalId,
        reason: reversalReason.trim(),
      });
      setShowReverseBox(false);
      setReversalReason('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reverse financial journal.');
    }
  };

  const isBalanced = journal ? journal.totalDebit === journal.totalCredit : true;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          General Ledger Entry: {journal?.journalNumber || 'Loading...'}
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400, mt: 0.5 }}>
            Double-entry balanced transaction record (Debits === Credits)
          </Typography>
        </Box>
        {journal && (
          <Chip
            size="small"
            label={journal.status}
            color={journal.status === 'POSTED' ? 'success' : 'default'}
            sx={{ fontWeight: 700 }}
          />
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error ? (
          <Alert severity="error">{(error as any)?.message || 'Failed to load journal.'}</Alert>
        ) : journal ? (
          <>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Journal Type</Typography>
                  <Typography variant="body2" fontWeight={600}>{journal.journalType}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Posting Date</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {new Date(journal.postingDate).toLocaleDateString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Posted By</Typography>
                  <Typography variant="body2" fontWeight={600}>{journal.postedByUsername}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Reference</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {journal.sourceReferenceId || 'Manual'}
                  </Typography>
                </Box>
                <Box sx={{ gridColumn: 'span 4', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">Description</Typography>
                  <Typography variant="body2">{journal.description}</Typography>
                </Box>
              </Box>
            </Paper>

            {/* Line items table */}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Account Code & Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Entity</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Debit (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Credit (₹)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {journal.lines?.map((line) => (
                    <TableRow key={line.lineId}>
                      <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{line.lineNumber}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {line.accountCode} - {line.accountName}
                        </Typography>
                        {line.description && (
                          <Typography variant="caption" color="text.secondary">
                            {line.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {line.entityType && (
                          <Chip size="small" variant="outlined" label={line.entityType} sx={{ fontSize: '0.6875rem' }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: line.debitAmount > 0 ? 600 : 400 }}>
                        {line.debitAmount > 0 ? `₹${line.debitAmount.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: line.creditAmount > 0 ? 600 : 400 }}>
                        {line.creditAmount > 0 ? `₹${line.creditAmount.toFixed(2)}` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Balanced Total Footer */}
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700, textAlign: 'right' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        {isBalanced && <CheckCircleOutlineIcon color="success" sx={{ fontSize: 18 }} />}
                        Total Balanced Sum:
                      </Box>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      ₹{journal.totalDebit.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      ₹{journal.totalCredit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* Reversal area */}
            {journal.status === 'POSTED' && showReverseBox && (
              <Box sx={{ p: 2, bgcolor: 'error.50', borderRadius: 2, border: 1, borderColor: 'error.200' }}>
                <Typography variant="subtitle2" color="error.900" fontWeight={700} sx={{ mb: 1 }}>
                  Create Compensating Reversal Journal
                </Typography>
                <Typography variant="body2" color="error.800" sx={{ mb: 1.5, fontSize: '0.8125rem' }}>
                  This will generate an immutable inverse journal entry and mark this entry as REVERSED.
                </Typography>
                <TextField
                  label="Documented Reversal Reason"
                  size="small"
                  fullWidth
                  required
                  multiline
                  rows={2}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Document why this journal is being reversed..."
                  error={reversalReason.length > 0 && reversalReason.trim().length < 5}
                  helperText="Minimum 5 characters required"
                />
              </Box>
            )}
          </>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>

        {journal?.status === 'POSTED' && (
          <>
            {!showReverseBox ? (
              <Button
                variant="outlined"
                color="error"
                startIcon={<UndoIcon />}
                onClick={() => setShowReverseBox(true)}
              >
                Reverse Journal
              </Button>
            ) : (
              <Button
                variant="contained"
                color="error"
                disabled={reverseMutation.isPending || reversalReason.trim().length < 5}
                onClick={handleReverse}
                startIcon={reverseMutation.isPending ? <CircularProgress size={16} /> : undefined}
              >
                Confirm Reversal
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
