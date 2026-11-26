'use client';

import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
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
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { AccountScope, ManagedAccount, ProvisionInput, useAccountMutations, useAccounts } from '../../lib/accountsApi';
import { EmptyState } from '../data-display/EmptyState';
import { LocationAutocomplete } from '../forms/LocationAutocomplete';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Client Administrator',
  CALL_CENTER: 'Call Center',
  ASF: 'Service Center (ASF)',
  ENGINEER: 'Field Engineer',
  WAREHOUSE: 'Warehouse',
};

/** Location party type required for each role (undefined = no location required). */
const ROLE_LOCATION: Record<string, { partyType: string; label: string; required: boolean } | undefined> = {
  ADMIN: undefined,
  CALL_CENTER: undefined,
  ASF: { partyType: 'ASF', label: 'Service Center', required: true },
  ENGINEER: { partyType: 'ASF', label: 'Home Service Center', required: true },
  WAREHOUSE: { partyType: 'CENTRAL_WAREHOUSE', label: 'Warehouse', required: true },
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

interface Props {
  scope: AccountScope;
  /** Roles shown in the create dialog; for the provider this is ['ADMIN']. */
  provisionableRoles: string[];
  entityLabel: string;
}

type Pending =
  | { kind: 'status'; account: ManagedAccount; next: 'Y' | 'N' }
  | { kind: 'reset'; account: ManagedAccount }
  | { kind: 'revoke'; account: ManagedAccount }
  | null;

export function AccountManagementPanel({ scope, provisionableRoles, entityLabel }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'Y' | 'N'>('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ProvisionInput>({ role: provisionableRoles[0], fullName: '', username: '', email: '', phoneNumber: '', locationId: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ManagedAccount | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', phoneNumber: '', locationId: '' });

  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const [secret, setSecret] = useState<{ username: string; password: string; context: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const query = useAccounts(scope, {
    search: search.trim() || undefined,
    status: status || undefined,
    role: roleFilter || undefined,
    page: page + 1,
    limit: rowsPerPage,
  });
  const m = useAccountMutations(scope);

  const roleForForm = form.role || provisionableRoles[0]!;
  const locRule = ROLE_LOCATION[roleForForm];

  const submitCreate = async () => {
    setFormError(null);
    if (locRule?.required && !form.locationId) {
      setFormError(`${locRule.label} is required for ${ROLE_LABELS[roleForForm]} accounts.`);
      return;
    }
    try {
      const res = await m.create.mutateAsync({
        ...form,
        role: scope === 'staff' ? roleForForm : undefined,
        phoneNumber: form.phoneNumber || undefined,
        locationId: locRule ? form.locationId || undefined : undefined,
      });
      setCreateOpen(false);
      setForm({ role: provisionableRoles[0], fullName: '', username: '', email: '', phoneNumber: '', locationId: '' });
      setSecret({ username: res.account.username, password: res.temporaryPassword, context: 'Account created' });
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const openEdit = (a: ManagedAccount) => {
    setEditing(a);
    setEditForm({ fullName: a.fullName, email: a.email, phoneNumber: a.phoneNumber || '', locationId: a.locationId || '' });
    setActionError(null);
  };

  const submitEdit = async () => {
    if (!editing) return;
    setActionError(null);
    const rule = ROLE_LOCATION[editing.roles[0] || ''];
    try {
      await m.update.mutateAsync({
        id: editing.userId,
        input: {
          fullName: editForm.fullName,
          email: editForm.email,
          phoneNumber: editForm.phoneNumber || undefined,
          ...(rule ? { locationId: editForm.locationId || undefined } : {}),
        },
      });
      setEditing(null);
      setToast('Account updated.');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    setActionError(null);
    try {
      if (pending.kind === 'status') {
        const res = await m.setStatus.mutateAsync({ id: pending.account.userId, isActive: pending.next, reason: reason || undefined });
        setToast(
          pending.next === 'N'
            ? `${pending.account.username} suspended; ${res.revokedSessions} active session(s) revoked.`
            : `${pending.account.username} reactivated.`
        );
      } else if (pending.kind === 'reset') {
        const res = await m.resetCredentials.mutateAsync(pending.account.userId);
        setSecret({
          username: res.account.username,
          password: res.temporaryPassword,
          context: `Credentials reset — ${res.revokedSessions} session(s) revoked`,
        });
      } else {
        const res = await m.revokeSessions.mutateAsync(pending.account.userId);
        setToast(`${res.revokedSessions} session(s) revoked for ${pending.account.username}.`);
      }
      setPending(null);
      setReason('');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const busy = m.setStatus.isPending || m.resetCredentials.isPending || m.revokeSessions.isPending;
  const items = query.data?.items || [];

  return (
    <Box>
      <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            placeholder="Search name, username or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          {provisionableRoles.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Role</InputLabel>
              <Select label="Role" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">All roles</MenuItem>
                {provisionableRoles.map((r) => (
                  <MenuItem key={r} value={r}>{ROLE_LABELS[r] || r}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value as '' | 'Y' | 'N'); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Y">Active</MenuItem>
              <MenuItem value="N">Suspended</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={() => query.refetch()}><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateOpen(true); setFormError(null); }}>
            New {entityLabel}
          </Button>
        </Stack>
      </Card>

      {query.isError && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(query.error)}</Alert>}

      <Card variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Organisation</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last sign-in</TableCell>
                <TableCell align="center">Sessions</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.isLoading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}><CircularProgress size={28} /></TableCell></TableRow>
              )}
              {!query.isLoading && items.length === 0 && (
                <TableRow><TableCell colSpan={7}><EmptyState title={`No ${entityLabel.toLowerCase()} accounts found`} description="Adjust filters or provision a new account." /></TableCell></TableRow>
              )}
              {items.map((a) => (
                <TableRow key={a.userId} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{a.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">{a.username} · {a.email}{a.phoneNumber ? ` · ${a.phoneNumber}` : ''}</Typography>
                  </TableCell>
                  <TableCell>
                    {a.roles.map((r) => <Chip key={r} size="small" label={ROLE_LABELS[r] || r} sx={{ mr: 0.5 }} />)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{a.locationName || '—'}</Typography>
                    {a.locationCode && <Typography variant="caption" color="text.secondary">{a.locationCode}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      <Chip size="small" color={a.isActive === 'Y' ? 'success' : 'default'} label={a.isActive === 'Y' ? 'Active' : 'Suspended'} />
                      {a.mustChangePassword === 'Y' && <Chip size="small" color="warning" variant="outlined" label="Password change pending" />}
                      {a.lockedUntil && new Date(a.lockedUntil) > new Date() && <Chip size="small" color="error" variant="outlined" label="Locked" />}
                    </Stack>
                  </TableCell>
                  <TableCell><Typography variant="body2">{formatDate(a.lastLoginAt)}</Typography></TableCell>
                  <TableCell align="center">{a.activeSessions}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit details"><IconButton size="small" onClick={() => openEdit(a)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Reset credentials"><IconButton size="small" onClick={() => { setPending({ kind: 'reset', account: a }); setActionError(null); }}><LockResetIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Revoke all sessions">
                      <span><IconButton size="small" disabled={a.activeSessions === 0} onClick={() => { setPending({ kind: 'revoke', account: a }); setActionError(null); }}><LogoutIcon fontSize="small" /></IconButton></span>
                    </Tooltip>
                    {a.isActive === 'Y' ? (
                      <Tooltip title="Suspend"><IconButton size="small" color="error" onClick={() => { setPending({ kind: 'status', account: a, next: 'N' }); setActionError(null); }}><BlockIcon fontSize="small" /></IconButton></Tooltip>
                    ) : (
                      <Tooltip title="Activate"><IconButton size="small" color="success" onClick={() => { setPending({ kind: 'status', account: a, next: 'Y' }); setActionError(null); }}><CheckCircleOutlineIcon fontSize="small" /></IconButton></Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={query.data?.total || 0}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Provision {entityLabel}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            {provisionableRoles.length > 1 && (
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select label="Role" value={roleForForm} onChange={(e) => setForm({ ...form, role: e.target.value, locationId: '' })}>
                  {provisionableRoles.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r] || r}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <TextField label="Full name" size="small" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <TextField
              label="Username"
              size="small"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              helperText="3–50 characters: lowercase letters, digits, dot, underscore or hyphen"
            />
            <TextField label="Email" type="email" size="small" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField label="Contact number" size="small" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} helperText="10-digit mobile number" />
            {locRule && (
              <LocationAutocomplete
                value={form.locationId}
                onChange={(id) => setForm({ ...form, locationId: id })}
                label={locRule.label}
                partyType={locRule.partyType}
                required={locRule.required}
                size="small"
              />
            )}
            <Alert severity="info" icon={<LockResetIcon fontSize="small" />}>
              A cryptographically generated temporary password is shown once after creation. The user must change it at first sign-in.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitCreate} disabled={m.create.isPending || !form.fullName || !form.username || !form.email}>
            {m.create.isPending ? 'Provisioning…' : 'Create account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit */}
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit {editing?.username}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {actionError && <Alert severity="error">{actionError}</Alert>}
            <TextField label="Full name" size="small" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
            <TextField label="Email" size="small" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            <TextField label="Contact number" size="small" value={editForm.phoneNumber} onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })} />
            {editing && ROLE_LOCATION[editing.roles[0] || ''] && (
              <LocationAutocomplete
                value={editForm.locationId}
                onChange={(id) => setEditForm({ ...editForm, locationId: id })}
                label={ROLE_LOCATION[editing.roles[0] || '']!.label}
                partyType={ROLE_LOCATION[editing.roles[0] || '']!.partyType}
                size="small"
              />
            )}
            <Typography variant="caption" color="text.secondary">Roles cannot be changed. Provision a new account for a different role.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitEdit} disabled={m.update.isPending}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm status / reset / revoke */}
      <Dialog open={Boolean(pending)} onClose={() => !busy && setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {pending?.kind === 'status' && (pending.next === 'N' ? 'Suspend account' : 'Activate account')}
          {pending?.kind === 'reset' && 'Reset credentials'}
          {pending?.kind === 'revoke' && 'Revoke sessions'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {actionError && <Alert severity="error">{actionError}</Alert>}
            <Typography variant="body2">
              {pending?.kind === 'status' && pending.next === 'N' && `Suspending ${pending.account.fullName} blocks sign-in and immediately revokes all active sessions.`}
              {pending?.kind === 'status' && pending.next === 'Y' && `Reactivate ${pending.account.fullName}? Existing credentials will work again.`}
              {pending?.kind === 'reset' && `A new temporary password will be issued to ${pending.account.fullName}. Their current password stops working and all sessions are revoked.`}
              {pending?.kind === 'revoke' && `Sign ${pending.account.fullName} out of all ${pending.account.activeSessions} active session(s)?`}
            </Typography>
            {pending?.kind === 'status' && pending.next === 'N' && (
              <TextField label="Reason (recorded in audit log)" size="small" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color={pending?.kind === 'status' && pending.next === 'N' ? 'error' : 'primary'} onClick={confirmPending} disabled={busy}>
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* One-time temporary credential */}
      <Dialog open={Boolean(secret)} maxWidth="sm" fullWidth>
        <DialogTitle>{secret?.context}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
            This temporary password is shown <strong>only once</strong>. Deliver it securely; the user must change it at first sign-in.
          </Alert>
          <Typography variant="body2" color="text.secondary">Username</Typography>
          <Typography variant="body1" fontWeight={600} sx={{ mb: 2 }}>{secret?.username}</Typography>
          <Typography variant="body2" color="text.secondary">Temporary password</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 18, px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'action.hover', letterSpacing: 1 }}>
              {secret?.password}
            </Box>
            <Tooltip title={copied ? 'Copied' : 'Copy'}>
              <IconButton
                onClick={async () => {
                  if (secret) await navigator.clipboard?.writeText(secret.password);
                  setCopied(true);
                }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => { setSecret(null); setCopied(false); }}>I have recorded it</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </Box>
  );
}
