'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Hsn, useCreateHsn, useUpdateHsn } from '../../../../../lib/catalogApi';

const hsnSchema = z.object({
  hsnCode: z
    .string()
    .min(2, 'HSN code must be at least 2 characters')
    .max(20, 'HSN code must not exceed 20 characters')
    .regex(/^[A-Za-z0-9]+$/, 'HSN code must be alphanumeric'),
  chapterNo: z.string().max(10, 'Max 10 characters').optional().or(z.literal('')),
  hsnDescription: z
    .string()
    .min(2, 'Description must be at least 2 characters')
    .max(255, 'Description must not exceed 255 characters'),
  cgstRate: z.coerce.number().min(0, 'CGST rate must be >= 0').max(100, 'Max 100%'),
  sgstRate: z.coerce.number().min(0, 'SGST rate must be >= 0').max(100, 'Max 100%'),
  igstRate: z.coerce.number().min(0, 'IGST rate must be >= 0').max(100, 'Max 100%'),
  isActive: z.enum(['Y', 'N']),
});

type HsnFormData = z.infer<typeof hsnSchema>;

interface HsnFormDialogProps {
  open: boolean;
  hsnToEdit: Hsn | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function HsnFormDialog({ open, hsnToEdit, onClose, onSuccess }: HsnFormDialogProps) {
  const isEditing = !!hsnToEdit;
  const createHsn = useCreateHsn();
  const updateHsn = useUpdateHsn();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<HsnFormData>({
    resolver: zodResolver(hsnSchema),
    defaultValues: {
      hsnCode: '',
      chapterNo: '',
      hsnDescription: '',
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 18,
      isActive: 'Y',
    },
  });

  const cgst = watch('cgstRate');
  const sgst = watch('sgstRate');

  // Auto-suggest IGST = CGST + SGST if IGST hasn't been manually set differently
  useEffect(() => {
    if (!isEditing && Number(cgst) >= 0 && Number(sgst) >= 0) {
      setValue('igstRate', Number(cgst) + Number(sgst));
    }
  }, [cgst, sgst, isEditing, setValue]);

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (hsnToEdit) {
        reset({
          hsnCode: hsnToEdit.hsnCode,
          chapterNo: hsnToEdit.chapterNo || '',
          hsnDescription: hsnToEdit.hsnDescription,
          cgstRate: hsnToEdit.cgstRate,
          sgstRate: hsnToEdit.sgstRate,
          igstRate: hsnToEdit.igstRate,
          isActive: hsnToEdit.isActive,
        });
      } else {
        reset({
          hsnCode: '',
          chapterNo: '',
          hsnDescription: '',
          cgstRate: 9,
          sgstRate: 9,
          igstRate: 18,
          isActive: 'Y',
        });
      }
    }
  }, [open, hsnToEdit, reset]);

  const onSubmit = async (values: HsnFormData) => {
    setServerError(null);
    try {
      if (isEditing && hsnToEdit) {
        await updateHsn.mutateAsync({
          id: hsnToEdit.hsnId,
          payload: {
            chapterNo: values.chapterNo?.trim() || undefined,
            hsnDescription: values.hsnDescription.trim(),
            cgstRate: Number(values.cgstRate),
            sgstRate: Number(values.sgstRate),
            igstRate: Number(values.igstRate),
            isActive: values.isActive,
            versionNo: hsnToEdit.versionNo,
          },
        });
        onSuccess(`HSN "${values.hsnCode}" updated successfully.`);
      } else {
        await createHsn.mutateAsync({
          hsnCode: values.hsnCode.toUpperCase().trim(),
          chapterNo: values.chapterNo?.trim() || undefined,
          hsnDescription: values.hsnDescription.trim(),
          cgstRate: Number(values.cgstRate),
          sgstRate: Number(values.sgstRate),
          igstRate: Number(values.igstRate),
          isActive: values.isActive,
        });
        onSuccess(`HSN "${values.hsnCode.toUpperCase()}" registered successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save HSN master record.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle sx={{ fontWeight: 600, borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {isEditing ? `Edit HSN: ${hsnToEdit?.hsnCode}` : 'Register New HSN / Tax Code'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {serverError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {serverError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <Controller
                  name="hsnCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="HSN Code"
                      fullWidth
                      required
                      disabled={isEditing}
                      error={!!errors.hsnCode}
                      helperText={errors.hsnCode?.message || 'Standard 4 to 8 digit code'}
                      inputProps={{ maxLength: 20, style: { textTransform: 'uppercase' } }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="chapterNo"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Chapter No."
                      fullWidth
                      error={!!errors.chapterNo}
                      helperText={errors.chapterNo?.message || 'Optional'}
                      inputProps={{ maxLength: 10 }}
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Controller
              name="hsnDescription"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="HSN Description"
                  fullWidth
                  required
                  multiline
                  rows={2}
                  error={!!errors.hsnDescription}
                  helperText={errors.hsnDescription?.message || 'Authoritative commodity or goods description'}
                />
              )}
            />

            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 1 }}>
              Applicable Tax Slabs (Percentages)
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Controller
                  name="cgstRate"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="CGST (%)"
                      type="number"
                      fullWidth
                      required
                      error={!!errors.cgstRate}
                      helperText={errors.cgstRate?.message}
                      inputProps={{ step: '0.01', min: '0', max: '100' }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="sgstRate"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="SGST (%)"
                      type="number"
                      fullWidth
                      required
                      error={!!errors.sgstRate}
                      helperText={errors.sgstRate?.message}
                      inputProps={{ step: '0.01', min: '0', max: '100' }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="igstRate"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="IGST (%)"
                      type="number"
                      fullWidth
                      required
                      error={!!errors.igstRate}
                      helperText={errors.igstRate?.message || 'Inter-state rate'}
                      inputProps={{ step: '0.01', min: '0', max: '100' }}
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch
                      checked={field.value === 'Y'}
                      onChange={(e) => field.onChange(e.target.checked ? 'Y' : 'N')}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Active Status {field.value === 'Y' ? '(Available for Part assignment)' : '(Disabled)'}
                    </Typography>
                  }
                  sx={{ mt: 1 }}
                />
              )}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={onClose} disabled={isSubmitting} color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create HSN'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
