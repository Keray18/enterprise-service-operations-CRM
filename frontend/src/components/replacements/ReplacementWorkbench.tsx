'use client';

import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TimelineIcon from '@mui/icons-material/Timeline';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useMemo, useState } from 'react';
import { useEligibleEngineers } from '../../lib/asfApi';
import { useParts } from '../../lib/catalogApi';
import {
  BarcodeCapture,
  EscalatedComplaint,
  Replacement,
  REPLACEMENT_STATUS_LABELS,
  ReplacementScope,
  useCustodyTimeline,
  useEscalatedComplaints,
  useInstallationPhotos,
  useReplacementActions,
  useReplacements,
} from '../../lib/replacementApi';
import { useAuth } from '../../providers/AuthProvider';
import { EmptyState } from '../data-display/EmptyState';
import { BarcodeScanField } from '../forms/BarcodeScanField';
import { LocationAutocomplete } from '../forms/LocationAutocomplete';

const REASONS: Record<string, string> = {
  REASON_1: 'Part not received / not completed within 7 days',
  REASON_2: 'Dead on arrival (DOA)',
  REASON_3: 'Recurring quality failure — customer refused repair',
  REASON_4: 'Model discontinued; parts unavailable',
  REASON_5: 'Non-repairable (burnout / structural damage)',
  REASON_6: 'Not acknowledged by ASF within 48 hours',
};

const PRE_DISPATCH = ['OPEN', 'PENDING_QUOTATION', 'QUOTATION_APPROVED', 'PENDING_STOCK', 'STOCK_RESERVED'];

const STATUS_COLOR: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
  OPEN: 'info',
  PENDING_QUOTATION: 'warning',
  QUOTATION_APPROVED: 'info',
  CUSTOMER_DECLINED: 'error',
  PENDING_STOCK: 'warning',
  STOCK_RESERVED: 'primary',
  DISPATCHED_TO_ASF: 'secondary',
  RECEIVED_AT_ASF: 'primary',
  APPOINTMENT_SCHEDULED: 'primary',
  HANDED_OVER_TO_ENGINEER: 'secondary',
  TECHNICIAN_CHECKED_IN: 'secondary',
  INSTALLATION_VERIFIED: 'success',
  CLOSED: 'default',
};

const emptyScan = (): BarcodeCapture => ({ barcode: '', captureMethod: 'SCANNER' });
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');
const fmt = (v?: string) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function StatusChip({ status }: { status: string }) {
  return <Chip size="small" color={STATUS_COLOR[status] || 'default'} label={REPLACEMENT_STATUS_LABELS[status] || status} />;
}

// -------------------------------------------------------------------------------------------------
// ASF: accept engineer escalations
// -------------------------------------------------------------------------------------------------
function AcceptEscalationDialog({ complaint, onClose, onDone }: { complaint: EscalatedComplaint | null; onClose: () => void; onDone: (m: string) => void }) {
  const actions = useReplacementActions();
  const [reasonCode, setReasonCode] = useState('REASON_5');
  const [warrantyType, setWarrantyType] = useState('IN_WARRANTY');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [part, setPart] = useState<{ partId: string; partCode: string; partName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parts = useParts({ search: partSearch || undefined, isActive: 'Y', limit: 20 });

  React.useEffect(() => {
    if (complaint) setWarrantyType(complaint.warrantyStatus === 'OUT_OF_WARRANTY' ? 'OUT_OF_WARRANTY' : 'IN_WARRANTY');
  }, [complaint]);

  const submit = async () => {
    setError(null);
    if (!complaint || !part) return;
    try {
      await actions.acceptEscalation.mutateAsync({
        requestId: complaint.requestId,
        reasonCode,
        requiredPartId: part.partId,
        warrantyType,
        quotationAmount: warrantyType === 'OUT_OF_WARRANTY' && amount ? Number(amount) : undefined,
        technicianRemarks: remarks || undefined,
      });
      onDone(`Escalation accepted: ${complaint.jobNumber} closed as ESCALATED_TO_REPLACEMENT and a replacement request opened.`);
    } catch (e) {
      setError(msg(e));
    }
  };

  const partOptions = (parts.data as any)?.items || (parts.data as any)?.data || [];

  return (
    <Dialog open={Boolean(complaint)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Accept escalation — {complaint?.jobNumber}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {complaint?.escalationReason && <Alert severity="info">Engineer: {complaint.escalationReason}</Alert>}
          <FormControl size="small" fullWidth>
            <InputLabel>Replacement reason</InputLabel>
            <Select label="Replacement reason" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {Object.entries(REASONS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <Autocomplete
            options={partOptions as Array<{ partId: string; partCode: string; partName: string }>}
            getOptionLabel={(o) => `${o.partCode} — ${o.partName}`}
            isOptionEqualToValue={(a, b) => a.partId === b.partId}
            value={part}
            onChange={(_e, v) => setPart(v)}
            onInputChange={(_e, v) => setPartSearch(v)}
            loading={parts.isLoading}
            renderInput={(p) => <TextField {...p} size="small" label="Replacement part / unit" required />}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Warranty</InputLabel>
            <Select label="Warranty" value={warrantyType} onChange={(e) => setWarrantyType(e.target.value)}>
              <MenuItem value="IN_WARRANTY">In warranty</MenuItem>
              <MenuItem value="OUT_OF_WARRANTY">Out of warranty (customer quotation required)</MenuItem>
            </Select>
          </FormControl>
          {warrantyType === 'OUT_OF_WARRANTY' && (
            <TextField size="small" type="number" label="Initial quotation amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
          <TextField size="small" label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} multiline minRows={2} />
          <Typography variant="caption" color="text.secondary">
            Accepting closes the original complaint as ESCALATED_TO_REPLACEMENT and creates an independent linked replacement request in one transaction.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!part || actions.acceptEscalation.isPending}>Accept escalation</Button>
      </DialogActions>
    </Dialog>
  );
}

// -------------------------------------------------------------------------------------------------
// Detail dialog with role-specific actions
// -------------------------------------------------------------------------------------------------
function ReplacementDetail({ scope, rep, onClose, onDone }: { scope: ReplacementScope; rep: Replacement; onClose: () => void; onDone: (m: string) => void }) {
  const { user } = useAuth();
  const a = useReplacementActions();
  const timeline = useCustodyTimeline(scope, rep.replacementId);
  const photos = useInstallationPhotos(scope === 'warehouse' ? 'asf' : (scope as 'asf' | 'engineer'), scope === 'warehouse' ? null : rep.replacementId);
  const engineers = useEligibleEngineers(scope === 'asf' ? rep.assignedLocationId : undefined);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<BarcodeCapture>(emptyScan());

  // form state
  const [amount, setAmount] = useState(rep.quotationAmount ? String(rep.quotationAmount) : '');
  const [declineReason, setDeclineReason] = useState('');
  const [engineerId, setEngineerId] = useState(rep.assignedEngineerId || '');
  const [apptAt, setApptAt] = useState('');
  const [slot, setSlot] = useState('');
  const [warehouseId, setWarehouseId] = useState(user?.locationId || rep.allocatedLocationId || '');
  const [courier, setCourier] = useState('');
  const [docket, setDocket] = useState('');
  const [code, setCode] = useState('');
  const [serial, setSerial] = useState('');
  const [remarks, setRemarks] = useState('');

  const tl = timeline.data;
  const activeHandover = tl?.handovers.find((h) => h.status === 'PENDING_COLLECTION' || h.status === 'COLLECTED');
  const collected = rep.handoverStatus === 'COLLECTED' || activeHandover?.status === 'COLLECTED';
  const expectedHint = rep.requiredPartCode ? `Required unit: ${rep.requiredPartCode} — ${rep.requiredPartName || ''}` : undefined;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await fn();
      setScan(emptyScan());
      setCode('');
      onDone(done);
      timeline.refetch();
      photos.refetch();
    } catch (e) {
      setError(msg(e));
    }
  };

  const minAppt = useMemo(() => {
    const d = new Date(Date.now() + 65 * 60 * 1000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);

  const section = (title: string, children: React.ReactNode) => (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>{title}</Typography>
        {children}
      </CardContent>
    </Card>
  );

  const actionsFor = () => {
    const s = rep.status;
    const blocks: React.ReactNode[] = [];
    if (scope === 'asf') {
      if (rep.warrantyType === 'OUT_OF_WARRANTY' && PRE_DISPATCH.includes(s)) {
        blocks.push(section(`Quotation (current version v${rep.quotationVersion || 1}${rep.approvedQuotationVersion ? `, approved v${rep.approvedQuotationVersion}` : ''})`, (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
              <TextField size="small" type="number" label="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} sx={{ width: 160 }} />
              <Button variant="outlined" disabled={!amount || a.prepareQuotation.isPending} onClick={() => run(() => a.prepareQuotation.mutateAsync({ id: rep.replacementId, amount: Number(amount) }), 'Quotation revised; customer approval required for the new version.')}>
                {rep.quotationStatus ? 'Revise quotation' : 'Prepare quotation'}
              </Button>
            </Stack>
            {rep.quotationStatus === 'PENDING_CUSTOMER_APPROVAL' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Button variant="contained" color="success" onClick={() => run(() => a.quotationDecision.mutateAsync({ id: rep.replacementId, decision: 'APPROVED', quotationVersion: rep.quotationVersion || 1 }), `Customer approval recorded for quotation v${rep.quotationVersion || 1}.`)}>
                  Customer approved v{rep.quotationVersion || 1}
                </Button>
                <TextField size="small" label="Rejection reason" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
                <Button variant="outlined" color="error" onClick={() => run(() => a.quotationDecision.mutateAsync({ id: rep.replacementId, decision: 'DECLINED', quotationVersion: rep.quotationVersion || 1, reason: declineReason || undefined }), 'Customer rejection recorded; dispatch permanently blocked.')}>
                  Customer rejected
                </Button>
              </Stack>
            )}
          </Stack>
        )));
      }
      if (s === 'DISPATCHED_TO_ASF') {
        blocks.push(section('Acknowledge actual receipt', (
          <Stack spacing={1}>
            <BarcodeScanField value={scan} onChange={setScan} expectedHint={expectedHint} onSubmit={() => run(() => a.acknowledgeReceipt.mutateAsync({ id: rep.replacementId, ...scan }), 'Receipt acknowledged at Service Center.')} />
            <Button variant="contained" startIcon={<InventoryIcon />} disabled={!scan.barcode || a.acknowledgeReceipt.isPending} onClick={() => run(() => a.acknowledgeReceipt.mutateAsync({ id: rep.replacementId, ...scan }), 'Receipt acknowledged at Service Center.')}>Confirm receipt</Button>
          </Stack>
        )));
      }
      if (['RECEIVED_AT_ASF', 'APPOINTMENT_SCHEDULED', 'HANDED_OVER_TO_ENGINEER'].includes(s)) {
        blocks.push(section(s === 'RECEIVED_AT_ASF' ? 'Assign engineer & schedule installation' : 'Reschedule installation', (
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>Engineer</InputLabel>
                <Select label="Engineer" value={engineerId} onChange={(e) => setEngineerId(e.target.value)} disabled={Boolean(activeHandover)}>
                  {(engineers.data || []).filter((e) => e.isActive === 'Y').map((e) => <MenuItem key={e.userId} value={e.userId}>{e.fullName} ({e.username})</MenuItem>)}
                </Select>
              </FormControl>
              {activeHandover && <Typography variant="caption" color="text.secondary">Engineer is fixed while the unit is handed over to them.</Typography>}
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField size="small" fullWidth type="datetime-local" label="Appointment" InputLabelProps={{ shrink: true }} inputProps={{ min: minAppt }} value={apptAt} onChange={(e) => setApptAt(e.target.value)} helperText="At least 60 minutes ahead" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField size="small" fullWidth label="Slot" placeholder="e.g. 10:00 – 12:00" value={slot} onChange={(e) => setSlot(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button fullWidth variant="contained" disabled={!engineerId || !apptAt || !slot || a.schedule.isPending} onClick={() => run(() => a.schedule.mutateAsync({ id: rep.replacementId, engineerId, appointmentDate: new Date(apptAt).toISOString(), appointmentSlot: slot }), 'Installation scheduled; the Arrival Happy Code SMS is queued for 60 minutes before the visit.')}>
                {s === 'RECEIVED_AT_ASF' ? 'Schedule visit' : 'Reschedule (invalidates previous code)'}
              </Button>
            </Grid>
            {['APPOINTMENT_SCHEDULED', 'HANDED_OVER_TO_ENGINEER'].includes(s) && (
              <Grid item xs={12}>
                <Button size="small" onClick={() => run(() => a.resendArrivalCode.mutateAsync({ id: rep.replacementId }), 'Arrival Happy Code resent to the customer.')}>Resend Arrival Happy Code</Button>
              </Grid>
            )}
          </Grid>
        )));
      }
      if (['RECEIVED_AT_ASF', 'APPOINTMENT_SCHEDULED'].includes(s) && !activeHandover && rep.requiredPartId) {
        blocks.push(section('Hand over unit to engineer', (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Engineer</InputLabel>
              <Select label="Engineer" value={engineerId} onChange={(e) => setEngineerId(e.target.value)} disabled={s === 'APPOINTMENT_SCHEDULED'}>
                {(engineers.data || []).filter((e) => e.isActive === 'Y').map((e) => <MenuItem key={e.userId} value={e.userId}>{e.fullName}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="contained" disabled={!engineerId || a.handover.isPending} onClick={() => run(() => a.handover.mutateAsync({ id: rep.replacementId, partId: rep.requiredPartId!, engineerId }), 'Handover initiated; awaiting engineer collection scan.')}>
              Initiate handover
            </Button>
          </Stack>
        )));
      }
    }
    if (scope === 'warehouse') {
      if (['OPEN', 'QUOTATION_APPROVED', 'PENDING_STOCK'].includes(s)) {
        blocks.push(section(s === 'PENDING_STOCK' ? 'Retry allocation (stock arrived?)' : 'Allocate stock', (
          <Stack spacing={1}>
            <LocationAutocomplete value={warehouseId} onChange={(id) => setWarehouseId(id)} partyType="CENTRAL_WAREHOUSE" label="Warehouse" size="small" />
            <Button variant="contained" disabled={!warehouseId || a.allocate.isPending} onClick={() => run(() => a.allocate.mutateAsync({ id: rep.replacementId, warehouseId }), 'Allocation processed.')}>Allocate</Button>
          </Stack>
        )));
      }
      if (s === 'STOCK_RESERVED') {
        blocks.push(section('Dispatch to Service Center', (
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField size="small" label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} />
              <TextField size="small" label="Docket / AWB" value={docket} onChange={(e) => setDocket(e.target.value)} />
            </Stack>
            <BarcodeScanField value={scan} onChange={setScan} expectedHint={expectedHint} />
            <Button variant="contained" startIcon={<LocalShippingIcon />} disabled={!courier || !docket || !scan.barcode || a.dispatch.isPending} onClick={() => run(() => a.dispatch.mutateAsync({ id: rep.replacementId, courierName: courier, docketNumber: docket, ...scan }), 'Unit dispatched; delivery challan generated.')}>
              Dispatch
            </Button>
          </Stack>
        )));
      }
      if (s === 'INSTALLATION_VERIFIED') {
        blocks.push(section('Final replacement closure', (
          <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} disabled={a.close.isPending} onClick={() => run(() => a.close.mutateAsync({ id: rep.replacementId }), 'Replacement closed.')}>Close replacement</Button>
        )));
      }
    }
    if (scope === 'engineer') {
      if (rep.handoverStatus === 'PENDING_COLLECTION' && rep.handoverId) {
        blocks.push(section('Collect unit from Service Center', (
          <Stack spacing={1}>
            <BarcodeScanField value={scan} onChange={setScan} expectedHint={expectedHint} onSubmit={() => run(() => a.collect.mutateAsync({ handoverId: rep.handoverId!, ...scan }), 'Collection acknowledged.')} />
            <Button variant="contained" disabled={!scan.barcode || a.collect.isPending} onClick={() => run(() => a.collect.mutateAsync({ handoverId: rep.handoverId!, ...scan }), 'Collection acknowledged.')}>Confirm collection</Button>
          </Stack>
        )));
      }
      if (['APPOINTMENT_SCHEDULED', 'HANDED_OVER_TO_ENGINEER'].includes(s) && collected && rep.assignedEngineerId === user?.userId) {
        blocks.push(section('Verify arrival at customer', (
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Arrival Happy Code" value={code} inputProps={{ inputMode: 'numeric', maxLength: 6 }} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <Button variant="contained" disabled={code.length !== 6 || a.verifyArrival.isPending} onClick={() => run(() => a.verifyArrival.mutateAsync({ id: rep.replacementId, happyCode: code }), 'Arrival verified; Completion Happy Code sent to the customer.')}>Verify</Button>
          </Stack>
        )));
      }
      if (s === 'TECHNICIAN_CHECKED_IN') {
        blocks.push(section('Record installation', (
          <Stack spacing={1.5}>
            <BarcodeScanField label="Installed part barcode" value={scan} onChange={setScan} expectedHint={expectedHint} />
            <TextField size="small" label="Serial number (if the unit has one)" value={serial} onChange={(e) => setSerial(e.target.value)} />
            <TextField size="small" label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            <Button component="label" variant="outlined" startIcon={<AddAPhotoIcon />} disabled={a.uploadPhoto.isPending}>
              Add installation photo
              <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) run(() => a.uploadPhoto.mutateAsync({ id: rep.replacementId, file: f }), 'Photo attached.');
                e.target.value = '';
              }} />
            </Button>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Completion Happy Code" value={code} inputProps={{ inputMode: 'numeric', maxLength: 6 }} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button variant="contained" color="success" disabled={code.length !== 6 || !scan.barcode || a.completeInstallation.isPending} onClick={() => run(() => a.completeInstallation.mutateAsync({ id: rep.replacementId, completionCode: code, installedPartCode: scan.barcode, captureMethod: scan.captureMethod, targetSerialNo: serial || undefined, remarks: remarks || undefined }), 'Installation recorded and verified.')}>
                Complete installation
              </Button>
            </Stack>
          </Stack>
        )));
      }
    }
    return blocks;
  };

  const blocks = actionsFor();

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <span>Replacement {rep.jobNumber || rep.replacementId.slice(0, 8)}</span>
          <StatusChip status={rep.status} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">Required unit</Typography><Typography variant="body2">{rep.requiredPartCode ? `${rep.requiredPartCode} — ${rep.requiredPartName}` : '—'}</Typography></Grid>
          <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">Reason</Typography><Typography variant="body2">{rep.reasonDescription}</Typography></Grid>
          <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Warranty</Typography><Typography variant="body2">{rep.warrantyType === 'OUT_OF_WARRANTY' ? 'Out of warranty' : 'In warranty'}</Typography></Grid>
          <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Quotation</Typography><Typography variant="body2">{rep.warrantyType === 'OUT_OF_WARRANTY' ? `₹${rep.quotationAmount ?? 0} · ${rep.quotationStatus || '—'}` : 'Not required'}</Typography></Grid>
          <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Engineer</Typography><Typography variant="body2">{rep.assignedEngineerName || '—'}</Typography></Grid>
          <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">Appointment</Typography><Typography variant="body2">{fmt(rep.appointmentSlot)}</Typography></Grid>
        </Grid>

        {blocks.length > 0 ? blocks : (
          <Alert severity="info" sx={{ mb: 2 }}>
            {rep.status === 'CLOSED' || rep.status === 'CUSTOMER_DECLINED' ? 'This replacement is complete.' : 'No action is required from your role at this stage.'}
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TimelineIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={700}>Chain of custody</Typography>
        </Stack>
        {timeline.isLoading && <CircularProgress size={20} />}
        {timeline.isError && <Alert severity="warning">{msg(timeline.error)}</Alert>}
        {tl && tl.events.length === 0 && <Typography variant="body2" color="text.secondary">No physical movement recorded yet.</Typography>}
        {tl && tl.events.length > 0 && (
          <Table size="small">
            <TableHead><TableRow><TableCell>When</TableCell><TableCell>Event</TableCell><TableCell>Custodian</TableCell><TableCell>Barcode</TableCell><TableCell>By</TableCell></TableRow></TableHead>
            <TableBody>
              {tl.events.map((e) => (
                <TableRow key={e.eventId}>
                  <TableCell>{fmt(e.createdAt)}</TableCell>
                  <TableCell>{e.eventType.replace(/_/g, ' ').toLowerCase()}</TableCell>
                  <TableCell>{e.custodianType}{e.custodianName ? ` · ${e.custodianName}` : ''}{e.locationName ? ` · ${e.locationName}` : ''}</TableCell>
                  <TableCell>{e.scannedBarcode ? <><code>{e.scannedBarcode}</code> <Typography component="span" variant="caption" color="text.secondary">({e.captureMethod?.toLowerCase()})</Typography></> : '—'}</TableCell>
                  <TableCell>{e.actorUsername || e.actorRole}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {tl?.installation && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Installed {fmt(tl.installation.installedAt)} by {tl.installation.engineerName || 'engineer'} · part <code>{tl.installation.installedPartCode}</code>
            {tl.installation.serialNumber ? ` · serial ${tl.installation.serialNumber}` : ''}
          </Alert>
        )}
        {photos.data && photos.data.length > 0 && (
          <Typography variant="body2" sx={{ mt: 1 }}>{photos.data.length} installation photo(s) attached.</Typography>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// -------------------------------------------------------------------------------------------------
export function ReplacementWorkbench({ scope }: { scope: ReplacementScope }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Replacement | null>(null);
  const [accepting, setAccepting] = useState<EscalatedComplaint | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const list = useReplacements(scope, scope === 'engineer' ? {} : { status: status || undefined, search: search || undefined, limit: 50 });
  const escalated = useEscalatedComplaints(scope === 'asf');

  const items = useMemo(() => {
    const all = list.data?.items || [];
    if (scope !== 'engineer') return all;
    return all.filter((r) => (!status || r.status === status) && (!search || (r.jobNumber || '').toLowerCase().includes(search.toLowerCase())));
  }, [list.data, scope, status, search]);

  const done = (m: string) => {
    setToast(m);
    list.refetch().then((res) => {
      if (selected) {
        const fresh = res.data?.items.find((r) => r.replacementId === selected.replacementId);
        if (fresh) setSelected(fresh);
      }
    });
  };

  return (
    <Box>
      {scope === 'asf' && (escalated.data?.length || 0) > 0 && (
        <Card variant="outlined" sx={{ mb: 2, borderColor: 'warning.main' }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Escalations awaiting acceptance</Typography>
            <Typography variant="caption" color="text.secondary">The original complaint stays open until you accept.</Typography>
            <Table size="small" sx={{ mt: 1 }}>
              <TableBody>
                {escalated.data!.map((c) => (
                  <TableRow key={c.requestId}>
                    <TableCell>{c.jobNumber}</TableCell>
                    <TableCell>{c.customerName || '—'}</TableCell>
                    <TableCell>{c.modelName || c.productName || '—'}</TableCell>
                    <TableCell>{c.assignedEngineerName || '—'}</TableCell>
                    <TableCell align="right"><Button size="small" variant="contained" onClick={() => setAccepting(c)}>Review & accept</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField size="small" placeholder="Search job number" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="">All statuses</MenuItem>
              {Object.entries(REPLACEMENT_STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="Refresh"><IconButton onClick={() => { list.refetch(); escalated.refetch(); }}><RefreshIcon /></IconButton></Tooltip>
        </Stack>
      </Card>

      {list.isError && <Alert severity="error" sx={{ mb: 2 }}>{msg(list.error)}</Alert>}
      <Card variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Job</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Warranty</TableCell>
                <TableCell>Engineer</TableCell>
                <TableCell>Appointment</TableCell>
                <TableCell>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.isLoading && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={26} /></TableCell></TableRow>}
              {!list.isLoading && items.length === 0 && (
                <TableRow><TableCell colSpan={7}><EmptyState title="No replacement requests" description="Replacements appear here once an escalation is accepted." /></TableCell></TableRow>
              )}
              {items.map((r) => (
                <TableRow key={r.replacementId} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(r)}>
                  <TableCell><Typography variant="body2" fontWeight={600}>{r.jobNumber || r.replacementId.slice(0, 8)}</Typography></TableCell>
                  <TableCell><StatusChip status={r.status} /></TableCell>
                  <TableCell>{r.requiredPartCode || '—'}</TableCell>
                  <TableCell>{r.warrantyType === 'OUT_OF_WARRANTY' ? 'OOW' : r.warrantyType ? 'IW' : '—'}</TableCell>
                  <TableCell>{r.assignedEngineerName || '—'}</TableCell>
                  <TableCell>{fmt(r.appointmentSlot)}</TableCell>
                  <TableCell>{fmt(r.updatedAt || r.requestedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {selected && <ReplacementDetail scope={scope} rep={selected} onClose={() => setSelected(null)} onDone={done} />}
      <AcceptEscalationDialog complaint={accepting} onClose={() => setAccepting(null)} onDone={(m) => { setAccepting(null); done(m); escalated.refetch(); }} />
      <Snackbar open={Boolean(toast)} autoHideDuration={4500} onClose={() => setToast(null)} message={toast} />
    </Box>
  );
}
