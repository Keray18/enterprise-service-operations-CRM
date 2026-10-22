'use client';

import React, { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import TuneIcon from '@mui/icons-material/Tune';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { useAdjustStock } from '../../../../lib/warehouseApi';
import { useParts } from '../../../../lib/catalogApi';

interface StockAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  locations: Array<{ locationId: string; locationCode: string; locationName: string }>;
  defaultLocationId?: string;
  defaultPartId?: string;
}

export function StockAdjustmentModal({
  open,
  onClose,
  locations,
  defaultLocationId,
  defaultPartId,
}: StockAdjustmentModalProps) {
  const [locationId, setLocationId] = useState(defaultLocationId || locations[0]?.locationId || '');
  const [partId, setPartId] = useState(defaultPartId || '');
  const [stockBucket, setStockBucket] = useState<'ON_HAND' | 'DEFECTIVE'>('ON_HAND');
  const [adjustmentType, setAdjustmentType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<
    'PHYSICAL_AUDIT_SURPLUS' | 'PHYSICAL_AUDIT_SHRINKAGE' | 'DAMAGED_IN_STORAGE' | 'CORRECTION' | 'SCRAP_WRITE_OFF'
  >('PHYSICAL_AUDIT_SURPLUS');
  const [remarks, setRemarks] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: catalogParts } = useParts({ isActive: 'Y', page: 1, limit: 100 });
  const adjustMutation = useAdjustStock();

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!locationId) {
      setErrorMsg('Please select a warehouse location.');
      return;
    }
    if (!partId) {
      setErrorMsg('Please select a part.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Adjustment quantity must be greater than zero.');
      return;
    }
    if (!remarks.trim() || remarks.trim().length < 5) {
      setErrorMsg('Mandatory audit remark must be at least 5 characters long.');
      return;
    }

    try {
      await adjustMutation.mutateAsync({
        locationId,
        partId,
        stockBucket,
        adjustmentType,
        quantity: Number(quantity),
        reason,
        remarks: remarks.trim(),
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute stock adjustment.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TuneIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Controlled Stock Adjustment
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          <strong>Controlled Inventory Mutation:</strong> Adjustments write an immutable double-entry record into{' '}
          <code>INVENTORY_MOVEMENTS</code> and update the live stock balance.
        </Alert>

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              select
              fullWidth
              label="Warehouse Location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              size="small"
              required
            >
              {locations.map((loc) => (
                <MenuItem key={loc.locationId} value={loc.locationId}>
                  {loc.locationName} ({loc.locationCode})
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <TextField
              select
              fullWidth
              label="Spare Part"
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              size="small"
              required
            >
              {(catalogParts?.items || []).map((p) => (
                <MenuItem key={p.partId} value={p.partId}>
                  {p.partCode} — {p.partName}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Stock Bucket"
              value={stockBucket}
              onChange={(e) => setStockBucket(e.target.value as any)}
              size="small"
              required
            >
              <MenuItem value="ON_HAND">On-Hand Stock</MenuItem>
              <MenuItem value="DEFECTIVE">Defective / Quarantine Stock</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Adjustment Action"
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as any)}
              size="small"
              required
            >
              <MenuItem value="INCREASE">Increase Stock (+)</MenuItem>
              <MenuItem value="DECREASE">Decrease / Write-off Stock (-)</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Adjustment Quantity"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              size="small"
              inputProps={{ min: 1 }}
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Adjustment Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              size="small"
              required
            >
              <MenuItem value="PHYSICAL_AUDIT_SURPLUS">Physical Audit Surplus (+)</MenuItem>
              <MenuItem value="PHYSICAL_AUDIT_SHRINKAGE">Physical Audit Shrinkage (-)</MenuItem>
              <MenuItem value="DAMAGED_IN_STORAGE">Damaged in Storage (-)</MenuItem>
              <MenuItem value="CORRECTION">System Count Correction</MenuItem>
              <MenuItem value="SCRAP_WRITE_OFF">Scrap / Obsolescence Write-off (-)</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Mandatory Audit Remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              size="small"
              multiline
              rows={3}
              required
              helperText="Minimum 5 characters. Justification will be logged permanently in movement ledger."
            />
          </Grid>
        </Grid>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={adjustMutation.isPending} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={adjustMutation.isPending}
          startIcon={adjustMutation.isPending ? <CircularProgress size={16} /> : <TuneIcon />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {adjustMutation.isPending ? 'Applying...' : 'Apply Stock Adjustment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
