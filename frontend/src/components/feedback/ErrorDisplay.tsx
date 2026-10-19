import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import React from 'react';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  code?: string;
  correlationId?: string;
  onRetry?: () => void;
}

export function ErrorDisplay({
  title = 'Operational Error',
  message,
  code,
  correlationId,
  onRetry,
}: ErrorDisplayProps) {
  return (
    <Paper
      sx={{
        p: 3,
        border: '1px solid #fecaca',
        backgroundColor: '#fff5f5',
        borderRadius: 2,
        maxWidth: 600,
        my: 2,
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <ErrorOutlineIcon sx={{ color: 'error.main', fontSize: '1.8rem', mt: 0.25 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h3" sx={{ color: 'error.dark', mb: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.primary', mb: 1.5 }}>
            {message}
          </Typography>

          {(code || correlationId) && (
            <Box
              sx={{
                p: 1.25,
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid #fee2e2',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: 'text.secondary',
                mb: 2,
              }}
            >
              {code && <div><strong>Error Code:</strong> {code}</div>}
              {correlationId && <div><strong>Trace ID:</strong> {correlationId}</div>}
            </Box>
          )}

          {onRetry && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
            >
              Retry Operation
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
