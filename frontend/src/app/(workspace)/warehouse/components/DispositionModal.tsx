'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

import FactCheckIcon from '@mui/icons-material/FactCheck';

import { StockReturn, useDispositionReturn } from '../../../../lib/warehouseApi';

interface DispositionModalProps {
  open: boolean;
  onClose: () => void;
  returnRecord: StockReturn | null;
}

export function DispositionModal({ open, onClose, returnRecord }: DispositionModalProps) {
  const [dispositions, setDispositions] = useState<
    Array<{
      returnItemId: string;
      partCode: string;
      partName: string;
      defectiveQty: number;
      action: 'RESTOCK' | 'SCRAP' | 'RETURN_TO_VENDOR';
      quantity: number;
      remarks: string;
    }>
  >([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dispositionMutation = useDispositionReturn();

  React.useEffect(() => {
    if (returnRecord?.items) {
      setDispositions(
        returnRecord.items.map((it) => ({
          returnItemId: it.itemId,
          partCode: it.partCode,
          partName: it.partName,
          defectiveQty: it.defectiveQty,
          action: 'SCRAP',
          quantity: it.defectiveQty,
          remarks: 'Scrapped after physical inspection — non-repairable PCB burn',
        }))
      );
    }
  }, [returnRecord]);

  if (!returnRecord) return null;

  const handleFieldChange = (index: number, field: string, value: any) => {
    setDispositions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    for (let i = 0; i < dispositions.length; i++) {
      const d = dispositions[i]!;
      if (d.quantity <= 0 || d.quantity > d.defectiveQty) {
        setErrorMsg(`Item #${i + 1}: Disposition quantity must be between 1 and ${d.defectiveQty}.`);
        return;
      }
      if (!d.remarks.trim()) {
        setErrorMsg(`Item #${i + 1}: Please provide a disposition remark.`);
        return;
      }
    }

    try {
      await dispositionMutation.mutateAsync({
        returnId: returnRecord.returnId,
        dispositions: dispositions.map((d) => ({
          returnItemId: d.returnItemId,
          action: d.action,
          quantity: Number(d.quantity),
          remarks: d.remarks.trim(),
        })),
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process return disposition.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FactCheckIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Defective Quarantine Inspection & Disposition — {returnRecord.returnNumber}
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Inspect returned parts currently quarantined in the warehouse. Choose whether to restock tested working units
          into On-Hand inventory, scrap damaged components, or return to vendor for warranty credit.
        </Typography>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '25%' }}>Part Description</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '10%' }} align="right">
                  Quarantine Qty
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '25%' }}>Disposition Action</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '15%' }} align="right">
                  Action Qty
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '25%' }}>Audit Remark</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dispositions.map((item, idx) => (
                <TableRow key={item.returnItemId}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {item.partCode}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.partName}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {item.defectiveQty}
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={item.action}
                      onChange={(e) => handleFieldChange(idx, 'action', e.target.value)}
                    >
                      <MenuItem value="SCRAP">Scrap & Write-Off (-)</MenuItem>
                      <MenuItem value="RESTOCK">Restock into On-Hand (+)</MenuItem>
                      <MenuItem value="RETURN_TO_VENDOR">Return to Vendor (RTV)</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={item.quantity}
                      onChange={(e) => handleFieldChange(idx, 'quantity', Number(e.target.value))}
                      inputProps={{ min: 1, max: item.defectiveQty }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      value={item.remarks}
                      onChange={(e) => handleFieldChange(idx, 'remarks', e.target.value)}
                      placeholder="Inspection findings..."
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={dispositionMutation.isPending} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={dispositionMutation.isPending}
          startIcon={dispositionMutation.isPending ? <CircularProgress size={16} /> : <FactCheckIcon />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {dispositionMutation.isPending ? 'Processing...' : 'Confirm Disposition & Update Ledger'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
