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
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Brand, useCreateBrand, useUpdateBrand } from '../../../../../lib/catalogApi';

const brandSchema = z.object({
  brandCode: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must not exceed 10 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Uppercase alphanumeric, dashes, and underscores only'),
  brandName: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Max 100 characters'),
  logoUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  isActive: z.enum(['Y', 'N']),
});

type BrandFormData = z.infer<typeof brandSchema>;

interface BrandFormDialogProps {
  open: boolean;
  brandToEdit: Brand | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function BrandFormDialog({ open, brandToEdit, onClose, onSuccess }: BrandFormDialogProps) {
  const isEditing = !!brandToEdit;
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      brandCode: '',
      brandName: '',
      logoUrl: '',
      isActive: 'Y',
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (brandToEdit) {
        reset({
          brandCode: brandToEdit.brandCode,
          brandName: brandToEdit.brandName,
          logoUrl: brandToEdit.logoUrl || '',
          isActive: brandToEdit.isActive,
        });
      } else {
        reset({
          brandCode: '',
          brandName: '',
          logoUrl: '',
          isActive: 'Y',
        });
      }
    }
  }, [open, brandToEdit, reset]);

  const onSubmit = async (values: BrandFormData) => {
    setServerError(null);
    try {
      if (isEditing && brandToEdit) {
        await updateBrand.mutateAsync({
          id: brandToEdit.brandId,
          payload: {
            brandName: values.brandName,
            logoUrl: values.logoUrl?.trim() || undefined,
            isActive: values.isActive,
            versionNo: brandToEdit.versionNo,
          },
        });
        onSuccess(`Brand "${values.brandName}" updated successfully.`);
      } else {
        await createBrand.mutateAsync({
          brandCode: values.brandCode.toUpperCase().trim(),
          brandName: values.brandName.trim(),
          logoUrl: values.logoUrl?.trim() || undefined,
          isActive: values.isActive,
        });
        onSuccess(`Brand "${values.brandName}" created successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save brand.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        {isEditing ? `Edit Brand: ${brandToEdit?.brandName}` : 'Register New Brand'}
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {serverError && <Alert severity="error">{serverError}</Alert>}

          <Controller
            name="brandCode"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Brand Code"
                placeholder="e.g. SKC"
                required
                disabled={isEditing}
                error={!!errors.brandCode}
                helperText={
                  isEditing
                    ? 'Brand codes cannot be modified once registered.'
                    : errors.brandCode?.message || 'Unique 2-10 character code (e.g. ASN, SKC, DNX)'
                }
                inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 10 }}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
              />
            )}
          />

          <Controller
            name="brandName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Brand Name"
                placeholder="e.g. Skatercat Enterprise"
                required
                error={!!errors.brandName}
                helperText={errors.brandName?.message}
              />
            )}
          />

          <Controller
            name="logoUrl"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Logo URL (Optional)"
                placeholder="https://cdn.example.com/brands/logo.png"
                error={!!errors.logoUrl}
                helperText={errors.logoUrl?.message || 'Public image URL for reports and franchise view'}
              />
            )}
          />

          <Controller
            name="isActive"
            control={control}
            render={({ field }) => (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={field.value === 'Y'}
                      onChange={(e) => field.onChange(e.target.checked ? 'Y' : 'N')}
                      color="primary"
                    />
                  }
                  label={field.value === 'Y' ? 'Active Status' : 'Inactive (Disabled for new tickets)'}
                />
              </Box>
            )}
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || createBrand.isPending || updateBrand.isPending}
          >
            {isSubmitting || createBrand.isPending || updateBrand.isPending
              ? 'Saving...'
              : isEditing
              ? 'Save Changes'
              : 'Create Brand'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
