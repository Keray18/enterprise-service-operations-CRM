'use client';

import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
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

import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

import { PendingJobPart, useDispatchStock } from '../../../../lib/warehouseApi';
import { useParts } from '../../../../lib/catalogApi';

interface DispatchItemDraft {
  partId: string;
  quantity: number;
  unitPrice: number;
}

interface DispatchModalProps {
  open: boolean;
  onClose: () => void;
  locations: Array<{ locationId: string; locationCode: string; locationName: string; partyType: string }>;
  defaultFromLocationId?: string;
  pendingPart?: PendingJobPart | null;
}

export function DispatchModal({
  open,
  onClose,
  locations,
  defaultFromLocationId,
  pendingPart,
}: DispatchModalProps) {
  const [fromLocationId, setFromLocationId] = useState(defaultFromLocationId || locations[0]?.locationId || '');
  const [toLocationId, setToLocationId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [dispatchMode, setDispatchMode] = useState<'COURIER' | 'LOGISTICS_TRUCK' | 'HAND_DELIVERY'>('COURIER');
  const [transporterName, setTransporterName] = useState('');
  const [docketNo, setDocketNo] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [items, setItems] = useState<DispatchItemDraft[]>([
    { partId: '', quantity: 1, unitPrice: 0 },
  ]);

  const { data: catalogParts } = useParts({ isActive: 'Y', page: 1, limit: 100 });
  const dispatchMutation = useDispatchStock();

  useEffect(() => {
    if (pendingPart) {
      setRequestId(pendingPart.requestId);
      if (pendingPart.assignedLocationId) {
        setToLocationId(pendingPart.assignedLocationId);
      }
      setItems([
        {
          partId: pendingPart.partId,
          quantity: pendingPart.quantity,
          unitPrice: pendingPart.locationPrice || pendingPart.customerPrice || 500,
        },
      ]);
    } else {
      setRequestId('');
      if (locations.length > 1) {
        const asfLoc = locations.find((l) => l.partyType === 'ASF');
        if (asfLoc) setToLocationId(asfLoc.locationId);
      }
    }
  }, [pendingPart, locations]);

  const handleAddItem = () => {
    setItems((prev) => [...prev, { partId: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof DispatchItemDraft, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index]!, [field]: value };
      if (field === 'partId' && catalogParts?.items) {
        const found = catalogParts.items.find((p) => p.partId === value);
        if (found) {
          current.unitPrice = found.locationPrice || found.customerPrice || 0;
        }
      }
      next[index] = current;
      return next;
    });
  };

  // Subtotal & Estimated GST (18%)
  const subtotal = items.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const estimatedGst = subtotal * 0.18;
  const totalAmount = subtotal + estimatedGst;

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!fromLocationId) {
      setErrorMsg('Please select the issuing warehouse.');
      return;
    }
    if (!toLocationId) {
      setErrorMsg('Please select the destination location.');
      return;
    }
    if (fromLocationId === toLocationId) {
      setErrorMsg('Source and destination locations cannot be identical.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('At least one part item must be dispatched.');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (!it.partId) {
        setErrorMsg(`Item #${i + 1}: Please select a spare part.`);
        return;
      }
      if (it.quantity <= 0) {
        setErrorMsg(`Item #${i + 1}: Quantity must be greater than zero.`);
        return;
      }
    }

    try {
      await dispatchMutation.mutateAsync({
        fromLocationId,
        toLocationId,
        requestId: requestId.trim() || undefined,
        dispatchMode,
        transporterName: transporterName.trim() || undefined,
        docketNo: docketNo.trim() || undefined,
        ewayBillNo: ewayBillNo.trim() || undefined,
        items: items.map((it) => ({
          partId: it.partId,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch stock.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalShippingIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Create Outbound Stock Dispatch / Delivery Challan
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        {pendingPart && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Fulfilling Job Part Request for Job: <strong>{pendingPart.jobNumber}</strong> ({pendingPart.partCode} —{' '}
            {pendingPart.partName})
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Issuing Warehouse (From)"
              value={fromLocationId}
              onChange={(e) => setFromLocationId(e.target.value)}
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
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Destination Location (To)"
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
              size="small"
              required
            >
              {locations.map((loc) => (
                <MenuItem key={loc.locationId} value={loc.locationId}>
                  {loc.locationName} ({loc.locationCode} - {loc.partyType})
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              label="Dispatch Mode"
              value={dispatchMode}
              onChange={(e) => setDispatchMode(e.target.value as any)}
              size="small"
              required
            >
              <MenuItem value="COURIER">Courier / Express</MenuItem>
              <MenuItem value="LOGISTICS_TRUCK">Logistics Freight / Truck</MenuItem>
              <MenuItem value="HAND_DELIVERY">Hand Delivery / Field Runner</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Transporter Name"
              value={transporterName}
              onChange={(e) => setTransporterName(e.target.value)}
              size="small"
              placeholder="e.g. BlueDart / SafeExpress"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Docket / AWB Tracking No"
              value={docketNo}
              onChange={(e) => setDocketNo(e.target.value)}
              size="small"
              placeholder="e.g. BD-89214710"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="E-Way Bill Number"
              value={ewayBillNo}
              onChange={(e) => setEwayBillNo(e.target.value)}
              size="small"
              placeholder="Mandatory for consignments > ₹50,000"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Service Request / Job ID (Optional)"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              size="small"
              placeholder="UUID of linked job"
              disabled={Boolean(pendingPart)}
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Dispatch Line Items
          </Typography>
          {!pendingPart && (
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              size="small"
              onClick={handleAddItem}
              sx={{ textTransform: 'none' }}
            >
              Add Line Item
            </Button>
          )}
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '45%' }}>Part Code / Name</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '20%' }} align="right">
                  Quantity
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '25%' }} align="right">
                  Location Price (₹)
                </TableCell>
                <TableCell sx={{ width: '10%' }} align="center"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={item.partId}
                      onChange={(e) => handleItemChange(idx, 'partId', e.target.value)}
                      disabled={Boolean(pendingPart)}
                    >
                      {(catalogParts?.items || []).map((p) => (
                        <MenuItem key={p.partId} value={p.partId}>
                          {p.partCode} — {p.partName}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                      inputProps={{ min: 1 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                      inputProps={{ min: 0, step: 0.01 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {items.length > 1 && !pendingPart && (
                      <IconButton size="small" color="error" onClick={() => handleRemoveItem(idx)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* GST Valuation Card */}
        <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Subtotal Taxable Value:
              </Typography>
            </Grid>
            <Grid item xs={6} textAlign="right">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                ₹{subtotal.toFixed(2)}
              </Typography>
            </Grid>

            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Applicable GST (18% CGST+SGST / IGST):
              </Typography>
            </Grid>
            <Grid item xs={6} textAlign="right">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                ₹{estimatedGst.toFixed(2)}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 0.5 }} />
            </Grid>

            <Grid item xs={6}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Total Delivery Challan Value:
              </Typography>
            </Grid>
            <Grid item xs={6} textAlign="right">
              <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 700 }}>
                ₹{totalAmount.toFixed(2)}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={dispatchMutation.isPending} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={dispatchMutation.isPending}
          startIcon={dispatchMutation.isPending ? <CircularProgress size={16} /> : <LocalShippingIcon />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {dispatchMutation.isPending ? 'Generating Challan...' : 'Generate Delivery Challan & Dispatch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
