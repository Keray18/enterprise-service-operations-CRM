'use client';

import KeyboardIcon from '@mui/icons-material/Keyboard';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import React, { useEffect, useRef } from 'react';
import type { BarcodeCapture, CaptureMethod } from '../../lib/replacementApi';

interface Props {
  value: BarcodeCapture;
  onChange: (value: BarcodeCapture) => void;
  /** Called when a scanner terminates input with Enter. */
  onSubmit?: () => void;
  label?: string;
  expectedHint?: string;
  error?: string | null;
  autoFocus?: boolean;
}

/**
 * Barcode capture. Hardware scanners behave as keyboards: they type the code into the focused field
 * and finish with Enter, so "Scanner" mode keeps focus here and submits on Enter. "Manual" mode is
 * for typing a code that cannot be scanned. The server validates the value against part master data.
 */
export function BarcodeScanField({ value, onChange, onSubmit, label = 'Part barcode', expectedHint, error, autoFocus = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && value.captureMethod === 'SCANNER') inputRef.current?.focus();
  }, [autoFocus, value.captureMethod]);

  return (
    <Stack spacing={1}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={value.captureMethod}
        onChange={(_e, m: CaptureMethod | null) => m && onChange({ ...value, captureMethod: m })}
      >
        <ToggleButton value="SCANNER"><QrCodeScannerIcon fontSize="small" sx={{ mr: 0.5 }} />Scanner</ToggleButton>
        <ToggleButton value="MANUAL"><KeyboardIcon fontSize="small" sx={{ mr: 0.5 }} />Manual entry</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        inputRef={inputRef}
        label={label}
        size="small"
        value={value.barcode}
        onChange={(e) => onChange({ ...value, barcode: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (value.barcode.trim()) onSubmit?.();
          }
        }}
        placeholder={value.captureMethod === 'SCANNER' ? 'Scan the unit label…' : 'Type the part code printed on the label'}
        error={Boolean(error)}
        helperText={error || expectedHint || ' '}
        autoComplete="off"
        InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon fontSize="small" /></InputAdornment> }}
      />
      {value.captureMethod === 'SCANNER' && (
        <Typography variant="caption" color="text.secondary">Point the scanner at the part label; the code is submitted automatically.</Typography>
      )}
    </Stack>
  );
}
