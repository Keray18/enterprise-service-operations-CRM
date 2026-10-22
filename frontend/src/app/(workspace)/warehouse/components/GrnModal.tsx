'use client';

import React, { useState } from 'react';
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
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';

import { useReceiveGrn } from '../../../../lib/warehouseApi';
import { useParts } from '../../../../lib/catalogApi';

interface GrnItemDraft {
  partId: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitPrice: number;
  remarks: string;
}

interface GrnModalProps {
  open: boolean;
  onClose: () => void;
  locations: Array<{ locationId: string; locationCode: string; locationName: string }>;
  defaultLocationId?: string;
}

export function GrnModal({ open, onClose, locations, defaultLocationId }: GrnModalProps) {
  const [receivingLocationId, setReceivingLocationId] = useState(defaultLocationId || locations[0]?.locationId || '');
  const [supplierName, setSupplierName] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [poNumber, setPoNumber] = useState('');
  const [gateEntryNo, setGateEntryNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [items, setItems] = useState<GrnItemDraft[]>([
    { partId: '', receivedQty: 1, acceptedQty: 1, rejectedQty: 0, unitPrice: 0, remarks: '' },
  ]);

  const { data: catalogParts } = useParts({ isActive: 'Y', page: 1, limit: 100 });
  const receiveGrnMutation = useReceiveGrn();

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { partId: '', receivedQty: 1, acceptedQty: 1, rejectedQty: 0, unitPrice: 0, remarks: '' },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof GrnItemDraft, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index]!, [field]: value };

      // If receivedQty changed, default accepted to received and rejected to 0
      if (field === 'receivedQty') {
        const rQty = Number(value) || 0;
        current.acceptedQty = rQty;
        current.rejectedQty = 0;
      }
      // If acceptedQty changed, auto-adjust rejectedQty
      if (field === 'acceptedQty') {
        const aQty = Number(value) || 0;
        current.rejectedQty = Math.max(0, current.receivedQty - aQty);
      }
      // If partId changed, auto-populate unitPrice from location price
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

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!receivingLocationId) {
      setErrorMsg('Please select a receiving warehouse location.');
      return;
    }
    if (!supplierName.trim()) {
      setErrorMsg('Supplier name is required.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('At least one part item must be received.');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (!it.partId) {
        setErrorMsg(`Item #${i + 1}: Please select a spare part.`);
        return;
      }
      if (it.receivedQty <= 0) {
        setErrorMsg(`Item #${i + 1}: Received quantity must be greater than zero.`);
        return;
      }
      if (it.acceptedQty + it.rejectedQty !== it.receivedQty) {
        setErrorMsg(`Item #${i + 1}: Accepted (${it.acceptedQty}) + Rejected (${it.rejectedQty}) must equal Received (${it.receivedQty}).`);
        return;
      }
    }

    try {
      await receiveGrnMutation.mutateAsync({
        receivingLocationId,
        supplierName: supplierName.trim(),
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        supplierInvoiceDate: supplierInvoiceDate || undefined,
        poNumber: poNumber.trim() || undefined,
        gateEntryNo: gateEntryNo.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
        remarks: remarks.trim() || undefined,
        items: items.map((it) => ({
          partId: it.partId,
          receivedQty: Number(it.receivedQty),
          acceptedQty: Number(it.acceptedQty),
          rejectedQty: Number(it.rejectedQty),
          unitPrice: Number(it.unitPrice),
          remarks: it.remarks.trim() || undefined,
        })),
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to post Goods Receipt Note.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MoveToInboxIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Inbound Goods Receipt Note (GRN)
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Receiving Warehouse"
              value={receivingLocationId}
              onChange={(e) => setReceivingLocationId(e.target.value)}
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
              fullWidth
              label="Supplier / Vendor Name"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              size="small"
              required
              placeholder="e.g. Bharat Electronics Ltd"
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Supplier Invoice No"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              type="date"
              label="Invoice Date"
              value={supplierInvoiceDate}
              onChange={(e) => setSupplierInvoiceDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="PO Number"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Security Gate Entry No"
              value={gateEntryNo}
              onChange={(e) => setGateEntryNo(e.target.value)}
              size="small"
              placeholder="e.g. GE-2026-0042"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Vehicle / Transporter Reg No"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              size="small"
              placeholder="e.g. MH-04-AB-1234"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Inspection & Receiving Remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              size="small"
              multiline
              rows={2}
              placeholder="Dock 2 quality inspection notes..."
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Received Line Items
          </Typography>
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            onClick={handleAddItem}
            sx={{ textTransform: 'none' }}
          >
            Add Line Item
          </Button>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '30%' }}>Part Code / Name</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '12%' }} align="right">
                  Received
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '12%' }} align="right">
                  Accepted
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '12%' }} align="right">
                  Rejected
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '14%' }} align="right">
                  Unit Price (₹)
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '15%' }}>Remarks</TableCell>
                <TableCell sx={{ width: '5%' }} align="center"></TableCell>
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
                      value={item.receivedQty}
                      onChange={(e) => handleItemChange(idx, 'receivedQty', Number(e.target.value))}
                      inputProps={{ min: 1 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={item.acceptedQty}
                      onChange={(e) => handleItemChange(idx, 'acceptedQty', Number(e.target.value))}
                      inputProps={{ min: 0 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={item.rejectedQty}
                      onChange={(e) => handleItemChange(idx, 'rejectedQty', Number(e.target.value))}
                      inputProps={{ min: 0 }}
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
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={item.remarks}
                      onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)}
                      placeholder="e.g. Damaged in transit"
                    />
                  </TableCell>
                  <TableCell align="center">
                    {items.length > 1 && (
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
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={receiveGrnMutation.isPending} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={receiveGrnMutation.isPending}
          startIcon={receiveGrnMutation.isPending ? <CircularProgress size={16} /> : <MoveToInboxIcon />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {receiveGrnMutation.isPending ? 'Posting GRN...' : 'Post Goods Receipt Note'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
