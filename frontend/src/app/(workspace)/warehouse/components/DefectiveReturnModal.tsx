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
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';

import { useReceiveReturn } from '../../../../lib/warehouseApi';
import { useParts } from '../../../../lib/catalogApi';

interface ReturnItemDraft {
  partId: string;
  defectiveQty: number;
  reason: string;
}

interface DefectiveReturnModalProps {
  open: boolean;
  onClose: () => void;
  locations: Array<{ locationId: string; locationCode: string; locationName: string; partyType: string }>;
  defaultReceivingLocationId?: string;
}

export function DefectiveReturnModal({
  open,
  onClose,
  locations,
  defaultReceivingLocationId,
}: DefectiveReturnModalProps) {
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [receivingLocationId, setReceivingLocationId] = useState(
    defaultReceivingLocationId || locations[0]?.locationId || ''
  );
  const [requestId, setRequestId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [items, setItems] = useState<ReturnItemDraft[]>([
    { partId: '', defectiveQty: 1, reason: 'FIELD_DEFECTIVE' },
  ]);

  const { data: catalogParts } = useParts({ isActive: 'Y', page: 1, limit: 100 });
  const returnMutation = useReceiveReturn();

  const handleAddItem = () => {
    setItems((prev) => [...prev, { partId: '', defectiveQty: 1, reason: 'FIELD_DEFECTIVE' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ReturnItemDraft, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!sourceLocationId) {
      setErrorMsg('Please select the returning ASF location.');
      return;
    }
    if (!receivingLocationId) {
      setErrorMsg('Please select the receiving warehouse.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('At least one defective part item must be received.');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (!it.partId) {
        setErrorMsg(`Item #${i + 1}: Please select a part.`);
        return;
      }
      if (it.defectiveQty <= 0) {
        setErrorMsg(`Item #${i + 1}: Defective quantity must be greater than zero.`);
        return;
      }
    }

    try {
      await returnMutation.mutateAsync({
        sourceLocationId,
        receivingLocationId,
        requestId: requestId.trim() || undefined,
        remarks: remarks.trim() || undefined,
        items: items.map((it) => ({
          partId: it.partId,
          defectiveQty: Number(it.defectiveQty),
          reason: it.reason,
        })),
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to receive defective return.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssignmentReturnIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Receive Defective Parts Return into Quarantine
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
              label="Returning Center (Source ASF)"
              value={sourceLocationId}
              onChange={(e) => setSourceLocationId(e.target.value)}
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

          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="Receiving Warehouse Location"
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
              label="Linked Service Request / Job ID (Optional)"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              size="small"
              placeholder="UUID of associated job"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="General Remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              size="small"
              placeholder="Return package details, box count..."
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Returned Defective Items
          </Typography>
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            onClick={handleAddItem}
            sx={{ textTransform: 'none' }}
          >
            Add Item
          </Button>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '45%' }}>Part Code / Name</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '20%' }} align="right">
                  Defective Qty
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '25%' }}>Defect Reason</TableCell>
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
                      value={item.defectiveQty}
                      onChange={(e) => handleItemChange(idx, 'defectiveQty', Number(e.target.value))}
                      inputProps={{ min: 1 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={item.reason}
                      onChange={(e) => handleItemChange(idx, 'reason', e.target.value)}
                    >
                      <MenuItem value="FIELD_DEFECTIVE">Field Defect (Customer Unit)</MenuItem>
                      <MenuItem value="TRANSPORT_DAMAGE">Transit / Courier Damaged</MenuItem>
                      <MenuItem value="DEAD_ON_ARRIVAL">Dead on Arrival (DOA)</MenuItem>
                    </TextField>
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
        <Button onClick={onClose} disabled={returnMutation.isPending} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={returnMutation.isPending}
          startIcon={returnMutation.isPending ? <CircularProgress size={16} /> : <AssignmentReturnIcon />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {returnMutation.isPending ? 'Inwarding...' : 'Inward to Quarantine Stock'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
