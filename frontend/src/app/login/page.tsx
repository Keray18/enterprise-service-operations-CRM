'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  LockOutlined,
  Security,
  Visibility,
  VisibilityOff,
  ArrowForward,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { sanitizeRedirect } from '../../lib/sanitizeRedirect';
import { useAuth } from '../../providers/AuthProvider';

const loginFormSchema = z.object({
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginFormSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const redirectTarget = sanitizeRedirect(rawRedirect, '/');

  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  // If already logged in, redirect away
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [authLoading, isAuthenticated, redirectTarget, router]);

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    try {
      await login(data);
      router.replace(redirectTarget);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials. Please try again.';
      setErrorMessage(msg);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 4,
      }}
    >
      <Container maxWidth="xs">
        <Card
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 3.5 },
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
            borderRadius: 2,
          }}
        >
          <CardContent sx={{ p: '0 !important' }}>
            {/* Header Brand Identity */}
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 48,
                  height: 48,
                  borderRadius: 1.5,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  mb: 1.5,
                }}
              >
                <LockOutlined sx={{ fontSize: 26 }} />
              </Box>
              <Typography variant="h5" component="h1" fontWeight={700} gutterBottom>
                CRM Portal Sign In
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Enterprise After-Sales Service & Inventory Management
              </Typography>
            </Box>

            {/* Error Feedback Banner */}
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setErrorMessage(null)}>
                {errorMessage}
              </Alert>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Controller
                  name="username"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="username-input"
                      label="Username or Email"
                      variant="outlined"
                      fullWidth
                      autoComplete="username"
                      autoFocus
                      disabled={isSubmitting}
                      error={!!errors.username}
                      helperText={errors.username?.message}
                      InputLabelProps={{ shrink: true }}
                    />
                  )}
                />

                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      id="password-input"
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      variant="outlined"
                      fullWidth
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      error={!!errors.password}
                      helperText={errors.password?.message}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              onClick={() => setShowPassword((prev) => !prev)}
                              edge="end"
                              size="small"
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />

                <Button
                  id="login-submit-btn"
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  fullWidth
                  disabled={isSubmitting}
                  endIcon={
                    isSubmitting ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <ArrowForward />
                    )
                  }
                  sx={{ py: 1.25, fontWeight: 600, mt: 0.5 }}
                >
                  {isSubmitting ? 'Authenticating...' : 'Sign In'}
                </Button>
              </Box>
            </form>

            <Divider sx={{ my: 3 }} />

            {/* Security Notice */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <Security sx={{ fontSize: 16 }} />
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                Secured via HttpOnly credentials & CSRF protection
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
          }}
        >
          <CircularProgress size={36} color="primary" />
        </Box>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
