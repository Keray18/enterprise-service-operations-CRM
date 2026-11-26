'use client';

import { CheckCircle, LockReset, RadioButtonUnchecked, Visibility, VisibilityOff } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { resolveDefaultWorkspace } from '../../lib/workspaceResolver';
import { useAuth } from '../../providers/AuthProvider';

const RULES: Array<{ label: string; test: (p: string, username: string) => boolean }> = [
  { label: 'At least 10 characters', test: (p) => p.length >= 10 },
  { label: 'An uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A digit (0-9)', test: (p) => /[0-9]/.test(p) },
  { label: 'A special character', test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
  { label: 'Does not contain your username', test: (p, u) => !u || !p.toLowerCase().includes(u.toLowerCase()) },
];

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login?redirect=%2Fchange-password');
  }, [isLoading, isAuthenticated, router]);

  const checks = useMemo(() => RULES.map((r) => ({ label: r.label, ok: r.test(next, user?.username || '') })), [next, user]);
  const allOk = checks.every((c) => c.ok) && next === confirm && next !== current && current.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allOk) return;
    setSaving(true);
    try {
      const updated = await changePassword({ currentPassword: current, newPassword: next });
      router.replace(resolveDefaultWorkspace(updated) || '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const adornment = (
    <InputAdornment position="end">
      <IconButton onClick={() => setShow((s) => !s)} edge="end" aria-label="toggle password visibility">
        {show ? <VisibilityOff /> : <Visibility />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', py: 6 }}>
      <Container maxWidth="sm">
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <LockReset color="primary" />
              <Typography variant="h5" fontWeight={700}>
                {user.mustChangePassword ? 'Set your password' : 'Change password'}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {user.mustChangePassword
                ? `Signed in as ${user.username} with a temporary password. Choose your own password to continue.`
                : 'Changing your password signs you out of all other sessions.'}
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={submit}>
              <Stack spacing={2}>
                <TextField
                  label={user.mustChangePassword ? 'Temporary password' : 'Current password'}
                  type={show ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                  InputProps={{ endAdornment: adornment }}
                />
                <TextField
                  label="New password"
                  type={show ? 'text' : 'password'}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <TextField
                  label="Confirm new password"
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  error={confirm.length > 0 && confirm !== next}
                  helperText={confirm.length > 0 && confirm !== next ? 'Passwords do not match' : ' '}
                />
                <Box>
                  {checks.map((c) => (
                    <Stack key={c.label} direction="row" spacing={1} alignItems="center">
                      {c.ok ? <CheckCircle fontSize="small" color="success" /> : <RadioButtonUnchecked fontSize="small" color="disabled" />}
                      <Typography variant="caption" color={c.ok ? 'text.primary' : 'text.secondary'}>{c.label}</Typography>
                    </Stack>
                  ))}
                  {next.length > 0 && next === current && (
                    <Typography variant="caption" color="error">New password must differ from the current one.</Typography>
                  )}
                </Box>
                <Button type="submit" variant="contained" size="large" disabled={!allOk || saving}>
                  {saving ? 'Saving…' : 'Save password and continue'}
                </Button>
                <Button variant="text" color="inherit" onClick={() => logout()}>
                  Sign out
                </Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
