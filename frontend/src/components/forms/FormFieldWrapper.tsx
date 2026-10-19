import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import React from 'react';

interface FormFieldWrapperProps {
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
}

export function FormFieldWrapper({
  label,
  required = false,
  error,
  helperText,
  children,
}: FormFieldWrapperProps) {
  return (
    <Box sx={{ mb: 2 }}>
      <InputLabel
        sx={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'text.primary',
          mb: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {label}
        {required && <span style={{ color: '#ef4444' }}>*</span>}
      </InputLabel>

      {children}

      {error ? (
        <FormHelperText error sx={{ fontSize: '0.75rem', mt: 0.5 }}>
          {error}
        </FormHelperText>
      ) : helperText ? (
        <FormHelperText sx={{ fontSize: '0.75rem', mt: 0.5, color: 'text.secondary' }}>
          {helperText}
        </FormHelperText>
      ) : null}
    </Box>
  );
}
