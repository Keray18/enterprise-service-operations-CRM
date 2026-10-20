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
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Part,
  useBrands,
  useCreatePart,
  useHsnList,
  useProducts,
  useUpdatePart,
} from '../../../../../lib/catalogApi';

const partSchema = z.object({
  brandId: z.string().min(1, 'Brand is required'),
  productId: z.string().min(1, 'Product is required'),
  partCode: z
    .string()
    .min(2, 'Part code must be at least 2 characters')
    .max(50, 'Part code must not exceed 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Alphanumeric, dashes and underscores only'),
  vendorPartCode: z.string().max(50, 'Max 50 characters').optional().or(z.literal('')),
  partName: z
    .string()
    .min(2, 'Part name must be at least 2 characters')
    .max(150, 'Part name must not exceed 150 characters'),
  partDescription: z.string().max(500, 'Max 500 characters').optional().or(z.literal('')),
  hsnId: z.string().min(1, 'HSN / Tax code is required'),
  partCategory: z.enum(['SPARE', 'CONSUMABLE', 'ACCESSORY']),
  customerPrice: z.coerce.number().min(0, 'Customer price must be >= 0'),
  locationPrice: z.coerce.number().min(0, 'Location price must be >= 0'),
  faultyPartDispatchTo: z.string().min(1, 'Dispatch destination is required'),
  warrantyDays: z.coerce.number().int().min(0, 'Warranty days must be >= 0'),
  isActive: z.enum(['Y', 'N']),
});

type PartFormData = z.infer<typeof partSchema>;

interface PartFormDialogProps {
  open: boolean;
  partToEdit: Part | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function PartFormDialog({ open, partToEdit, onClose, onSuccess }: PartFormDialogProps) {
  const isEditing = !!partToEdit;
  const createPart = useCreatePart();
  const updatePart = useUpdatePart();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Fetch available relation options
  const { data: brandsData } = useBrands({ limit: 100, isActive: 'Y' });
  const { data: productsData } = useProducts({ limit: 100, isActive: 'Y' });
  const { data: hsnData } = useHsnList({ limit: 100, isActive: 'Y' });

  const brands = brandsData?.items || [];
  const products = productsData?.items || [];
  const hsns = hsnData?.items || [];

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PartFormData>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      brandId: '',
      productId: '',
      partCode: '',
      vendorPartCode: '',
      partName: '',
      partDescription: '',
      hsnId: '',
      partCategory: 'SPARE',
      customerPrice: 0,
      locationPrice: 0,
      faultyPartDispatchTo: 'CENTRAL_WAREHOUSE',
      warrantyDays: 90,
      isActive: 'Y',
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (partToEdit) {
        reset({
          brandId: partToEdit.brandId,
          productId: partToEdit.productId,
          partCode: partToEdit.partCode,
          vendorPartCode: partToEdit.vendorPartCode || '',
          partName: partToEdit.partName,
          partDescription: partToEdit.partDescription || '',
          hsnId: partToEdit.hsnId,
          partCategory: partToEdit.partCategory,
          customerPrice: partToEdit.customerPrice,
          locationPrice: partToEdit.locationPrice,
          faultyPartDispatchTo: partToEdit.faultyPartDispatchTo || 'CENTRAL_WAREHOUSE',
          warrantyDays: partToEdit.warrantyDays,
          isActive: partToEdit.isActive,
        });
      } else {
        reset({
          brandId: '',
          productId: '',
          partCode: '',
          vendorPartCode: '',
          partName: '',
          partDescription: '',
          hsnId: '',
          partCategory: 'SPARE',
          customerPrice: 0,
          locationPrice: 0,
          faultyPartDispatchTo: 'CENTRAL_WAREHOUSE',
          warrantyDays: 90,
          isActive: 'Y',
        });
      }
    }
  }, [open, partToEdit, reset]);

  const onSubmit = async (values: PartFormData) => {
    setServerError(null);
    try {
      if (isEditing && partToEdit) {
        await updatePart.mutateAsync({
          id: partToEdit.partId,
          payload: {
            vendorPartCode: values.vendorPartCode?.trim() || undefined,
            partName: values.partName.trim(),
            partDescription: values.partDescription?.trim() || undefined,
            hsnId: values.hsnId,
            partCategory: values.partCategory,
            customerPrice: Number(values.customerPrice),
            locationPrice: Number(values.locationPrice),
            faultyPartDispatchTo: values.faultyPartDispatchTo.trim(),
            warrantyDays: Number(values.warrantyDays),
            isActive: values.isActive,
            versionNo: partToEdit.versionNo,
          },
        });
        onSuccess(`Part "${values.partCode}" updated successfully.`);
      } else {
        await createPart.mutateAsync({
          brandId: values.brandId,
          productId: values.productId,
          partCode: values.partCode.toUpperCase().trim(),
          vendorPartCode: values.vendorPartCode?.trim() || undefined,
          partName: values.partName.trim(),
          partDescription: values.partDescription?.trim() || undefined,
          hsnId: values.hsnId,
          partCategory: values.partCategory,
          customerPrice: Number(values.customerPrice),
          locationPrice: Number(values.locationPrice),
          faultyPartDispatchTo: values.faultyPartDispatchTo.trim(),
          warrantyDays: Number(values.warrantyDays),
          isActive: values.isActive,
        });
        onSuccess(`Part "${values.partCode.toUpperCase()}" registered successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save part record.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle sx={{ fontWeight: 600, borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {isEditing ? `Edit Part: ${partToEdit?.partCode}` : 'Register New Spare Part / Accessory'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {serverError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {serverError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            {/* Primary Classification */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Brand & Hierarchy Association
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="brandId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={!!errors.brandId} disabled={isEditing}>
                      <InputLabel id="brand-select-label">Brand</InputLabel>
                      <Select
                        {...field}
                        labelId="brand-select-label"
                        label="Brand"
                      >
                        {brands.map((b) => (
                          <MenuItem key={b.brandId} value={b.brandId}>
                            {b.brandName} ({b.brandCode})
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.brandId && <FormHelperText>{errors.brandId.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="productId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={!!errors.productId} disabled={isEditing}>
                      <InputLabel id="product-select-label">Product Line</InputLabel>
                      <Select
                        {...field}
                        labelId="product-select-label"
                        label="Product Line"
                      >
                        {products.map((p) => (
                          <MenuItem key={p.productId} value={p.productId}>
                            {p.productName} ({p.productCode})
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.productId && <FormHelperText>{errors.productId.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>

            {/* Part Identification */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 1 }}>
              Part Identification & Codes
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="partCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Part Code"
                      fullWidth
                      required
                      disabled={isEditing}
                      error={!!errors.partCode}
                      helperText={errors.partCode?.message || 'Unique within the selected Brand'}
                      inputProps={{ maxLength: 50, style: { textTransform: 'uppercase' } }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="vendorPartCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Vendor / OEM Part Code"
                      fullWidth
                      error={!!errors.vendorPartCode}
                      helperText={errors.vendorPartCode?.message || 'Manufacturer part number (optional)'}
                      inputProps={{ maxLength: 50 }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={8}>
                <Controller
                  name="partName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Part Name"
                      fullWidth
                      required
                      error={!!errors.partName}
                      helperText={errors.partName?.message || 'Descriptive component title'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="partCategory"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={!!errors.partCategory}>
                      <InputLabel id="category-select-label">Category</InputLabel>
                      <Select
                        {...field}
                        labelId="category-select-label"
                        label="Category"
                      >
                        <MenuItem value="SPARE">Spare Part</MenuItem>
                        <MenuItem value="CONSUMABLE">Consumable</MenuItem>
                        <MenuItem value="ACCESSORY">Accessory</MenuItem>
                      </Select>
                      {errors.partCategory && <FormHelperText>{errors.partCategory.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              </Grid>
            </Grid>

            <Controller
              name="partDescription"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Part Description & Technical Specs"
                  fullWidth
                  multiline
                  rows={2}
                  error={!!errors.partDescription}
                  helperText={errors.partDescription?.message || 'Component specifications, compatibility notes'}
                />
              )}
            />

            {/* Taxation & Commercials */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 1 }}>
              Taxation & Commercial Pricing
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="hsnId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={!!errors.hsnId}>
                      <InputLabel id="hsn-select-label">HSN & Tax Code</InputLabel>
                      <Select
                        {...field}
                        labelId="hsn-select-label"
                        label="HSN & Tax Code"
                      >
                        {hsns.map((h) => (
                          <MenuItem key={h.hsnId} value={h.hsnId}>
                            {h.hsnCode} — {h.hsnDescription} (IGST: {h.igstRate}%)
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.hsnId && <FormHelperText>{errors.hsnId.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <Controller
                  name="customerPrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Customer Price (MRP)"
                      type="number"
                      fullWidth
                      required
                      error={!!errors.customerPrice}
                      helperText={errors.customerPrice?.message}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      }}
                      inputProps={{ step: '0.01', min: '0' }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <Controller
                  name="locationPrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Transfer Price (LTP)"
                      type="number"
                      fullWidth
                      required
                      error={!!errors.locationPrice}
                      helperText={errors.locationPrice?.message || 'ASF transfer cost'}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      }}
                      inputProps={{ step: '0.01', min: '0' }}
                    />
                  )}
                />
              </Grid>
            </Grid>

            {/* Service & Reverse Logistics */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 1 }}>
              Reverse Logistics & Warranty
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="faultyPartDispatchTo"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth required error={!!errors.faultyPartDispatchTo}>
                      <InputLabel id="dispatch-select-label">Faulty Part Dispatch To</InputLabel>
                      <Select
                        {...field}
                        labelId="dispatch-select-label"
                        label="Faulty Part Dispatch To"
                      >
                        <MenuItem value="CENTRAL_WAREHOUSE">Central Warehouse</MenuItem>
                        <MenuItem value="REGIONAL_WAREHOUSE">Regional Warehouse</MenuItem>
                        <MenuItem value="VENDOR_RMA">OEM / Vendor Repair Center</MenuItem>
                        <MenuItem value="SCRAP_LOCAL">Local Scrap / Discard</MenuItem>
                      </Select>
                      {errors.faultyPartDispatchTo && (
                        <FormHelperText>{errors.faultyPartDispatchTo.message}</FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="warrantyDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Part Replacement Warranty"
                      type="number"
                      fullWidth
                      required
                      error={!!errors.warrantyDays}
                      helperText={errors.warrantyDays?.message || 'Days covered after repair replacement'}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">days</InputAdornment>,
                      }}
                      inputProps={{ step: '1', min: '0' }}
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
                      Active Status {field.value === 'Y' ? '(Active and billable on service tickets)' : '(Disabled)'}
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
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Part'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
