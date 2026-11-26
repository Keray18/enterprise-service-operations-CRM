'use client';

import DnsIcon from '@mui/icons-material/Dns';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MemoryIcon from '@mui/icons-material/Memory';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SmsFailedIcon from '@mui/icons-material/SmsFailed';
import StorageIcon from '@mui/icons-material/Storage';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import React, { useState } from 'react';
import { PageHeader } from '../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useNotificationFailures, useProviderDashboard, useProviderHealth, WorkerStatus } from '../../../lib/accountsApi';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Provider Super Admins',
  ADMIN: 'Client Admins',
  CALL_CENTER: 'Call Center',
  ASF: 'Service Centers',
  ENGINEER: 'Field Engineers',
  WAREHOUSE: 'Warehouse',
};

function fmt(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const WORKER_COLOR: Record<WorkerStatus['state'], 'success' | 'warning' | 'error' | 'default'> = {
  HEALTHY: 'success',
  DEGRADED: 'warning',
  STALE: 'error',
  NOT_RUNNING: 'default',
};

function Stat({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone?: 'error' | 'warning' | 'success' }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: tone ? `${tone}.main` : 'text.secondary', mb: 1 }}>
          {icon}
          <Typography variant="caption" fontWeight={600} letterSpacing={0.5} textTransform="uppercase">{label}</Typography>
        </Stack>
        <Typography variant="h5" fontWeight={700}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboardPage() {
  const dashboard = useProviderDashboard();
  const health = useProviderHealth();
  const [failureStatus, setFailureStatus] = useState<'' | 'FAILED' | 'DEAD_LETTER'>('');
  const [failurePage, setFailurePage] = useState(0);
  const failures = useNotificationFailures({ status: failureStatus || undefined, page: failurePage + 1, limit: 10 });

  const h = health.data;
  const d = dashboard.data;
  const migrationIssues = (h?.database.migrations?.pending || 0) + (h?.database.migrations?.failed || 0) + (h?.database.migrations?.checksumMismatches.length || 0);

  return (
    <ProtectedRoute requiredRole="SUPER_ADMIN" requiredPermission="system:telemetry">
      <Box>
        <PageHeader
          title="Provider Console"
          subtitle="Platform health, client administration and operational telemetry"
          badge={<Chip size="small" color="secondary" label="Software Provider" />}
          actions={
            <Stack direction="row" spacing={1}>
              <Button component={Link} href="/super-admin/admins" variant="contained" startIcon={<PeopleIcon />}>Client Admins</Button>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => { health.refetch(); dashboard.refetch(); failures.refetch(); }}>Refresh</Button>
            </Stack>
          }
        />

        {(health.isError || dashboard.isError) && (
          <Alert severity="error" sx={{ mb: 2 }}>Telemetry could not be loaded: {(health.error || dashboard.error) instanceof Error ? (health.error || dashboard.error)!.message : 'unknown error'}</Alert>
        )}
        {(health.isLoading || dashboard.isLoading) && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}

        {h && d && (
          <>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Stat icon={<DnsIcon fontSize="small" />} label="Application" value={h.application.status} hint={`${h.application.environment} · Node ${h.application.nodeVersion} · up ${uptime(h.application.uptimeSeconds)}`} tone="success" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Stat
                  icon={<StorageIcon fontSize="small" />}
                  label="Database"
                  value={h.database.connected ? `${h.database.latencyMs ?? '—'} ms` : 'Unreachable'}
                  hint={h.database.pool ? `Pool ${h.database.pool.connectionsInUse ?? 0}/${h.database.pool.connectionsOpen ?? 0} in use (max ${h.database.pool.poolMax})` : h.database.error}
                  tone={h.database.connected ? 'success' : 'error'}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Stat icon={<SmsFailedIcon fontSize="small" />} label="Notification failures (24h)" value={h.notifications?.failuresLast24h ?? '—'} hint={`${h.notifications?.dueNow ?? 0} due now · ${h.notifications?.scheduledFuture ?? 0} scheduled`} tone={(h.notifications?.failuresLast24h || 0) > 0 ? 'warning' : undefined} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Stat icon={<MemoryIcon fontSize="small" />} label="Active sessions" value={d.activeSessions} hint={`${d.lockedAccounts} locked account(s)`} />
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>Accounts by role</Typography>
                    <Table size="small">
                      <TableHead><TableRow><TableCell>Role</TableCell><TableCell align="right">Active</TableCell><TableCell align="right">Total</TableCell><TableCell align="right">Pending first sign-in</TableCell></TableRow></TableHead>
                      <TableBody>
                        {d.accountsByRole.map((r) => (
                          <TableRow key={r.role}>
                            <TableCell>{ROLE_LABELS[r.role] || r.role}</TableCell>
                            <TableCell align="right">{r.active}</TableCell>
                            <TableCell align="right">{r.total}</TableCell>
                            <TableCell align="right">{r.pendingFirstLogin}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>Database schema</Typography>
                    {h.database.migrations ? (
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip size="small" color="success" label={`${h.database.migrations.applied} applied`} />
                          <Chip size="small" color={h.database.migrations.pending ? 'warning' : 'default'} label={`${h.database.migrations.pending} pending`} />
                          <Chip size="small" color={h.database.migrations.failed ? 'error' : 'default'} label={`${h.database.migrations.failed} failed`} />
                        </Stack>
                        {h.database.migrations.checksumMismatches.length > 0 && (
                          <Alert severity="error">Checksum mismatch: {h.database.migrations.checksumMismatches.join(', ')}</Alert>
                        )}
                        {h.database.migrations.missingSource.length > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Applied without source file (reconciled by a later migration): {h.database.migrations.missingSource.join(', ')}
                          </Typography>
                        )}
                        {migrationIssues === 0 && <Typography variant="body2" color="text.secondary">Schema is up to date.</Typography>}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">{h.database.schemaError || 'Unavailable while the database is unreachable.'}</Typography>
                    )}
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>Audit</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {d.audit.eventsToday} event(s) today · {d.audit.failureEvents} denied/failed of {d.audit.totalEvents} total ·{' '}
                      <Link href="/super-admin/audit">open audit log</Link>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <ScheduleIcon fontSize="small" color="action" />
                  <Typography variant="subtitle1" fontWeight={700}>Background workers</Typography>
                  <Typography variant="caption" color="text.secondary">Scheduler started {fmt(h.workers.schedulerStartedAt)}</Typography>
                </Stack>
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Job</TableCell><TableCell>State</TableCell><TableCell align="right">Runs</TableCell><TableCell align="right">Items</TableCell><TableCell>Last success</TableCell><TableCell>Last error</TableCell></TableRow></TableHead>
                    <TableBody>
                      {h.workers.jobs.map((w) => (
                        <TableRow key={w.key}>
                          <TableCell>{w.label}{w.intervalMs ? <Typography variant="caption" color="text.secondary" display="block">every {Math.round(w.intervalMs / 60000)} min</Typography> : null}</TableCell>
                          <TableCell><Chip size="small" color={WORKER_COLOR[w.state]} label={w.state.replace('_', ' ')} /></TableCell>
                          <TableCell align="right">{w.totalRuns}</TableCell>
                          <TableCell align="right">{w.itemsProcessed}</TableCell>
                          <TableCell>{fmt(w.lastSuccessAt)}</TableCell>
                          <TableCell sx={{ maxWidth: 280 }}>{w.lastErrorAt ? <><Typography variant="caption">{fmt(w.lastErrorAt)}</Typography><Typography variant="caption" color="error" display="block" noWrap title={w.lastErrorMessage || ''}>{w.lastErrorMessage}</Typography></> : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </>
        )}

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
              <ErrorOutlineIcon fontSize="small" color="warning" />
              <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>Notification delivery failures</Typography>
              <Select size="small" value={failureStatus} displayEmpty onChange={(e) => { setFailureStatus(e.target.value as '' | 'FAILED' | 'DEAD_LETTER'); setFailurePage(0); }}>
                <MenuItem value="">Failed &amp; dead-lettered</MenuItem>
                <MenuItem value="FAILED">Failed (retrying)</MenuItem>
                <MenuItem value="DEAD_LETTER">Dead letter</MenuItem>
              </Select>
            </Stack>
            <Typography variant="caption" color="text.secondary">Message content and Happy Codes are never shown; recipients are masked.</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>When</TableCell><TableCell>Template</TableCell><TableCell>Job</TableCell><TableCell>Recipient</TableCell><TableCell>Status</TableCell><TableCell align="right">Retries</TableCell><TableCell>Error</TableCell></TableRow></TableHead>
                <TableBody>
                  {failures.isLoading && <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={22} /></TableCell></TableRow>}
                  {failures.data?.items.length === 0 && <TableRow><TableCell colSpan={7} align="center"><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No delivery failures.</Typography></TableCell></TableRow>}
                  {failures.data?.items.map((f) => (
                    <TableRow key={f.notificationId}>
                      <TableCell>{fmt(f.updatedAt || f.createdAt)}</TableCell>
                      <TableCell>{f.templateCode}</TableCell>
                      <TableCell>{f.jobNumber || '—'}</TableCell>
                      <TableCell>{f.recipient}</TableCell>
                      <TableCell><Chip size="small" color={f.status === 'DEAD_LETTER' ? 'error' : 'warning'} label={f.status} /></TableCell>
                      <TableCell align="right">{f.retryCount}</TableCell>
                      <TableCell sx={{ maxWidth: 320 }}><Typography variant="caption" noWrap display="block" title={f.errorMessage || ''}>{f.errorMessage || '—'}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={failures.data?.total || 0} page={failurePage} rowsPerPage={10} rowsPerPageOptions={[10]} onPageChange={(_e, p) => setFailurePage(p)} />
          </CardContent>
        </Card>
      </Box>
    </ProtectedRoute>
  );
}
