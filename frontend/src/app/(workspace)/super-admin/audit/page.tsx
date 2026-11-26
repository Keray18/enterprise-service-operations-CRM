'use client';

import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { useAuditLogs } from '../../../../lib/accountsApi';

const ACTIONS = [
  'ACCOUNT_CREATE',
  'ACCOUNT_UPDATE',
  'ACCOUNT_SUSPEND',
  'ACCOUNT_ACTIVATE',
  'CREDENTIAL_RESET',
  'SESSIONS_REVOKE',
  'PASSWORD_CHANGE',
  'FIRST_LOGIN_PASSWORD_CHANGE',
  'CONFIG_UPDATE',
  'BARCODE_MISMATCH',
  'REPLACEMENT_CLOSE',
  'CREDENTIAL_ROTATION',
];

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = useAuditLogs({
    search: search.trim() || undefined,
    action: action || undefined,
    outcome: outcome || undefined,
    startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
    endDate: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
    page: page + 1,
    limit: rowsPerPage,
  });

  return (
    <ProtectedRoute requiredRole="SUPER_ADMIN" requiredPermission="audit:read">
      <Box>
        <PageHeader title="System Audit Log" subtitle="Append-only record of account, credential, configuration and custody security events" />
        <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              size="small"
              placeholder="Search actor, action, record"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              sx={{ flex: 1 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Action</InputLabel>
              <Select label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
                <MenuItem value="">All actions</MenuItem>
                {ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Outcome</InputLabel>
              <Select label="Outcome" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(0); }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="SUCCESS">Success</MenuItem>
                <MenuItem value="FAILURE">Failure / denied</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} />
          </Stack>
        </Card>

        {logs.isError && <Alert severity="error" sx={{ mb: 2 }}>{logs.error instanceof Error ? logs.error.message : 'Failed to load audit log'}</Alert>}

        <Card variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Record</TableCell>
                  <TableCell>Outcome</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.isLoading && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={26} /></TableCell></TableRow>}
                {logs.data?.logs.length === 0 && <TableRow><TableCell colSpan={6} align="center"><Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>No audit events match the filters.</Typography></TableCell></TableRow>}
                {logs.data?.logs.map((l) => (
                  <React.Fragment key={l.eventId}>
                    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === l.eventId ? null : l.eventId)}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{l.actorUsername || 'system'}</Typography>
                        <Typography variant="caption" color="text.secondary">{l.actorRole || '—'}</Typography>
                      </TableCell>
                      <TableCell><Chip size="small" variant="outlined" label={l.action} /></TableCell>
                      <TableCell>{l.resource}</TableCell>
                      <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{l.recordIdentifier || '—'}</Typography></TableCell>
                      <TableCell><Chip size="small" color={l.outcome === 'SUCCESS' ? 'success' : 'error'} label={l.outcome} /></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, borderBottom: expanded === l.eventId ? undefined : 'none' }}>
                        <Collapse in={expanded === l.eventId} unmountOnExit>
                          <Box sx={{ py: 1.5 }}>
                            {l.justification && <Typography variant="body2" sx={{ mb: 1 }}><strong>Detail:</strong> {l.justification}</Typography>}
                            {l.changes && (
                              <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, overflowX: 'auto' }}>
                                {JSON.stringify(l.changes, null, 2)}
                              </Box>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              Correlation {l.correlationId || '—'} · IP {l.ipAddress || '—'}
                            </Typography>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={logs.data?.pagination.total || 0}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_e, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Card>
      </Box>
    </ProtectedRoute>
  );
}
