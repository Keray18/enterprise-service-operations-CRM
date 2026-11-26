'use client';

import SaveIcon from '@mui/icons-material/Save';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { ProviderConfigItem, useProviderConfig, useUpdateProviderConfig } from '../../../../lib/accountsApi';

function ConfigRow({ item, onSaved }: { item: ProviderConfigItem; onSaved: (msg: string) => void }) {
  const [value, setValue] = useState(item.configValue);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProviderConfig();
  const dirty = value !== item.configValue;

  const save = async (next = value) => {
    setError(null);
    try {
      await update.mutateAsync({ key: item.configKey, value: next });
      onSaved(`${item.configKey} updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setValue(item.configValue);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>{item.configKey}</Typography>
        <Typography variant="caption" color="text.secondary">{item.description}</Typography>
        {error && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{error}</Alert>}
      </TableCell>
      <TableCell><Chip size="small" variant="outlined" label={item.category} /></TableCell>
      <TableCell sx={{ minWidth: 200 }}>
        {!item.editable ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">{item.configValue}</Typography>
            <Chip size="small" label={item.isSensitive === 'Y' ? 'Sensitive' : 'Read-only'} />
          </Stack>
        ) : item.rule?.type === 'boolean' ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Switch
              checked={item.configValue === 'true'}
              disabled={update.isPending}
              onChange={(e) => save(e.target.checked ? 'true' : 'false')}
              color={item.configKey === 'app.maintenance_mode' ? 'warning' : 'primary'}
            />
            <Typography variant="body2">{item.configValue === 'true' ? 'Enabled' : 'Disabled'}</Typography>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputProps={item.rule?.type === 'int' ? { min: item.rule.min, max: item.rule.max } : undefined}
              helperText={item.rule?.type === 'int' ? `${item.rule.min}–${item.rule.max}` : undefined}
              sx={{ width: 120 }}
            />
            <Button size="small" variant="contained" startIcon={update.isPending ? <CircularProgress size={14} /> : <SaveIcon />} disabled={!dirty || update.isPending} onClick={() => save()}>
              Save
            </Button>
          </Stack>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary">
          {item.updatedBy || '—'}
          <br />
          {new Date(item.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </Typography>
      </TableCell>
    </TableRow>
  );
}

export default function ProviderConfigPage() {
  const config = useProviderConfig();
  const [toast, setToast] = useState<string | null>(null);

  return (
    <ProtectedRoute requiredRole="SUPER_ADMIN" requiredPermission="system:config">
      <Box>
        <PageHeader title="Provider Configuration" subtitle="Platform-wide security, notification and availability settings" />
        <Alert severity="warning" sx={{ mb: 2 }}>
          Maintenance mode blocks every client user (Admins and operational staff) from signing in or using the API; the provider console stays available.
          Database credentials, encryption keys and other secrets are not managed here.
        </Alert>
        {config.isError && <Alert severity="error" sx={{ mb: 2 }}>{config.error instanceof Error ? config.error.message : 'Failed to load configuration'}</Alert>}
        <Card variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Setting</TableCell><TableCell>Category</TableCell><TableCell>Value</TableCell><TableCell>Last changed</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {config.isLoading && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><CircularProgress size={26} /></TableCell></TableRow>}
                {config.data?.items.map((item) => <ConfigRow key={`${item.configKey}:${item.configValue}`} item={item} onSaved={setToast} />)}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
        <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)} message={toast} />
      </Box>
    </ProtectedRoute>
  );
}
