import Chip from '@mui/material/Chip';
import React from 'react';
import { tokens } from '../../theme/tokens';

export type OperationalStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REGISTERED'
  | 'ACKNOWLEDGED'
  | 'APPOINTMENT_SCHEDULED'
  | 'TECHNICIAN_CHECKED_IN'
  | 'IN_PROGRESS'
  | 'PENDING_SPARE_PART'
  | 'REPLACEMENT_APPROVED'
  | 'CLOSED'
  | 'REPLACED'
  | 'CANCELLED'
  | 'IN_WARRANTY'
  | 'OUT_OF_WARRANTY'
  | 'HEALTHY'
  | 'DEGRADED';

interface StatusBadgeProps {
  status: OperationalStatus | string;
  label?: string;
  size?: 'small' | 'medium';
}

export function StatusBadge({ status, label, size = 'small' }: StatusBadgeProps) {
  const normStatus = status.toUpperCase().replace(/\s+/g, '_');
  const displayText = label || normStatus.replace(/_/g, ' ');

  // Color mapping based on design tokens
  let bg: string = tokens.colors.brand.subtleLight;
  let color: string = tokens.colors.brand.primary;
  let border: string = 'transparent';

  switch (normStatus) {
    case 'ACTIVE':
    case 'CLOSED':
    case 'REPLACED':
    case 'IN_WARRANTY':
    case 'HEALTHY':
      bg = tokens.colors.status.successSubtle;
      color = tokens.colors.status.success;
      border = '#a7f3d0';
      break;
    case 'ACKNOWLEDGED':
    case 'TECHNICIAN_CHECKED_IN':
    case 'IN_PROGRESS':
      bg = tokens.colors.status.infoSubtle;
      color = tokens.colors.status.info;
      border = '#bae6fd';
      break;
    case 'PENDING_SPARE_PART':
    case 'APPOINTMENT_SCHEDULED':
    case 'DEGRADED':
      bg = tokens.colors.status.warningSubtle;
      color = tokens.colors.status.warning;
      border = '#fde68a';
      break;
    case 'INACTIVE':
      bg = '#f1f5f9';
      color = '#64748b';
      border = '#cbd5e1';
      break;
    case 'CANCELLED':
    case 'OUT_OF_WARRANTY':
    case 'BREACHED':
      bg = tokens.colors.status.dangerSubtle;
      color = tokens.colors.status.danger;
      border = '#fecaca';
      break;
    case 'REGISTERED':
    default:
      bg = '#f1f5f9';
      color = '#475569';
      border = '#cbd5e1';
      break;
  }

  return (
    <Chip
      size={size}
      label={displayText}
      sx={{
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        fontSize: size === 'small' ? '0.6875rem' : '0.75rem',
        letterSpacing: '0.02em',
      }}
    />
  );
}
