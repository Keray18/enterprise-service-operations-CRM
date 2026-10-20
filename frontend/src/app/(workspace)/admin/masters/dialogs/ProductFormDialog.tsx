'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
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
import { Product, useCreateProduct, useProductCategories, useUpdateProduct } from '../../../../../lib/catalogApi';

const productSchema = z.object({
  productCode: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(20, 'Code must not exceed 20 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Uppercase alphanumeric, dashes, and underscores only'),
  productName: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Max 100 characters'),
  categoryFamily: z.string().min(2, 'Category family is required').max(50, 'Max 50 characters'),
  isActive: z.enum(['Y', 'N']),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormDialogProps {
  open: boolean;
  productToEdit: Product | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const COMMON_CATEGORIES = [
  'Air Conditioner',
  'Television & AV',
  'Washing Machine',
  'Refrigerator',
  'Microwave Oven',
  'Small Domestic Appliances',
  'Kitchen Appliances',
  'Water Purifier',
];

export function ProductFormDialog({ open, productToEdit, onClose, onSuccess }: ProductFormDialogProps) {
  const isEditing = !!productToEdit;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { data: serverCategories = [] } = useProductCategories();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Merge server categories with standard fallback categories
  const categoryOptions = React.useMemo(() => {
    const set = new Set([...serverCategories, ...COMMON_CATEGORIES]);
    return Array.from(set).sort();
  }, [serverCategories]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      productCode: '',
      productName: '',
      categoryFamily: '',
      isActive: 'Y',
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (productToEdit) {
        reset({
          productCode: productToEdit.productCode,
          productName: productToEdit.productName,
          categoryFamily: productToEdit.categoryFamily,
          isActive: productToEdit.isActive,
        });
      } else {
        reset({
          productCode: '',
          productName: '',
          categoryFamily: '',
          isActive: 'Y',
        });
      }
    }
  }, [open, productToEdit, reset]);

  const onSubmit = async (values: ProductFormData) => {
    setServerError(null);
    try {
      if (isEditing && productToEdit) {
        await updateProduct.mutateAsync({
          id: productToEdit.productId,
          payload: {
            productName: values.productName.trim(),
            categoryFamily: values.categoryFamily.trim(),
            isActive: values.isActive,
            versionNo: productToEdit.versionNo,
          },
        });
        onSuccess(`Product "${values.productName}" updated successfully.`);
      } else {
        await createProduct.mutateAsync({
          productCode: values.productCode.toUpperCase().trim(),
          productName: values.productName.trim(),
          categoryFamily: values.categoryFamily.trim(),
          isActive: values.isActive,
        });
        onSuccess(`Product "${values.productName}" created successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save product.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        {isEditing ? `Edit Product: ${productToEdit?.productName}` : 'Register New Product'}
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {serverError && <Alert severity="error">{serverError}</Alert>}

          <Controller
            name="productCode"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Product Code"
                placeholder="e.g. AC, LED, WM, REF"
                required
                disabled={isEditing}
                error={!!errors.productCode}
                helperText={
                  isEditing
                    ? 'Product codes cannot be modified once registered.'
                    : errors.productCode?.message || 'Unique 2-20 character product code'
                }
                inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 20 }}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
              />
            )}
          />

          <Controller
            name="productName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Product Line / Name"
                placeholder="e.g. Inverter Air Conditioner"
                required
                error={!!errors.productName}
                helperText={errors.productName?.message}
              />
            )}
          />

          <Controller
            name="categoryFamily"
            control={control}
            render={({ field }) => (
              <Autocomplete
                freeSolo
                options={categoryOptions}
                value={field.value}
                onChange={(_e, newValue) => field.onChange(newValue || '')}
                onInputChange={(_e, newInputValue) => field.onChange(newInputValue || '')}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Category Family"
                    placeholder="Select or enter category (e.g. Air Conditioner)"
                    required
                    error={!!errors.categoryFamily}
                    helperText={errors.categoryFamily?.message || 'High-level product classification'}
                  />
                )}
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
            disabled={isSubmitting || createProduct.isPending || updateProduct.isPending}
          >
            {isSubmitting || createProduct.isPending || updateProduct.isPending
              ? 'Saving...'
              : isEditing
              ? 'Save Changes'
              : 'Create Product'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
