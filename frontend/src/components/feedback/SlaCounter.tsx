import AccessTimeIcon from '@mui/icons-material/AccessTime';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import React from 'react';
import { tokens } from '../../theme/tokens';

interface SlaCounterProps {
  remainingHours: number;
  totalHours?: number;
  breached?: boolean;
}

export function SlaCounter({ remainingHours, breached = false }: SlaCounterProps) {
  if (breached || remainingHours <= 0) {
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.5,
          borderRadius: 1,
          backgroundColor: tokens.colors.status.dangerSubtle,
          border: '1px solid #fecaca',
          color: tokens.colors.status.danger,
        }}
      >
        <AccessTimeIcon sx={{ fontSize: '0.9rem' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>
          SLA BREACHED
        </Typography>
      </Box>
    );
  }

  const isUrgent = remainingHours < 4;
  const isWarning = remainingHours >= 4 && remainingHours < 24;

  const bg = isUrgent
    ? tokens.colors.status.dangerSubtle
    : isWarning
    ? tokens.colors.status.warningSubtle
    : tokens.colors.status.successSubtle;

  const color = isUrgent
    ? tokens.colors.status.danger
    : isWarning
    ? tokens.colors.status.warning
    : tokens.colors.status.success;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        borderRadius: 1,
        backgroundColor: bg,
        border: `1px solid ${color}40`,
        color,
      }}
    >
      <AccessTimeIcon sx={{ fontSize: '0.9rem' }} />
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>
        {remainingHours > 24
          ? `${Math.floor(remainingHours / 24)}d ${remainingHours % 24}h remaining`
          : `${remainingHours}h remaining`}
      </Typography>
    </Box>
  );
}
