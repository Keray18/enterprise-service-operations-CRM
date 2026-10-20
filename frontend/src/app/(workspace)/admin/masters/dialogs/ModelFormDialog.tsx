'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
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
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Model,
  useBrands,
  useCreateModel,
  useProducts,
  useUpdateModel,
} from '../../../../../lib/catalogApi';

const modelSchema = z.object({
  brandId: z.string().uuid('Please select a valid Brand'),
  productId: z.string().uuid('Please select a valid Product'),
  modelCode: z
    .string()
    .min(2, 'Model code must be at least 2 characters')
    .max(50, 'Max 50 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Uppercase alphanumeric, dashes, and underscores only'),
  modelName: z.string().min(2, 'Model name must be at least 2 characters').max(100, 'Max 100 characters'),
  technicalName: z.string().max(100, 'Max 100 characters').optional(),
  softwareVersion: z.string().max(50, 'Max 50 characters').optional(),
  serialNumberLength: z.coerce.number().int().min(0, 'Must be positive').default(15),
  checkSerialNumber: z.enum(['Y', 'N']),
  isJobCreationAllowed: z.enum(['Y', 'N']),
  isDoaAllowed: z.enum(['Y', 'N']),
  isRepairable: z.enum(['Y', 'N']),
  isReplacementAllowed: z.enum(['Y', 'N']),
  customerWarrantyDays: z.coerce.number().int().min(0, 'Must be non-negative').default(365),
  repairWarrantyDays: z.coerce.number().int().min(0, 'Must be non-negative').default(90),
  replacementWindowDays: z.coerce.number().int().min(0, 'Must be non-negative').default(15),
  doaDays: z.coerce.number().int().min(0, 'Must be non-negative').default(30),
  amcDays: z.coerce.number().int().min(0, 'Must be non-negative').default(365),
  amcAmount: z.coerce.number().min(0, 'Must be non-negative').default(0),
  isOutOfWarrantyServiced: z.enum(['Y', 'N']),
  standardServiceCharge: z.coerce.number().min(0, 'Must be non-negative').default(0),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format'),
  isActive: z.enum(['Y', 'N']),
});

type ModelFormData = z.infer<typeof modelSchema>;

const defaultModelValues: ModelFormData = {
  brandId: '',
  productId: '',
  modelCode: '',
  modelName: '',
  technicalName: '',
  softwareVersion: '',
  serialNumberLength: 15,
  checkSerialNumber: 'Y',
  isJobCreationAllowed: 'Y',
  isDoaAllowed: 'Y',
  isRepairable: 'Y',
  isReplacementAllowed: 'Y',
  customerWarrantyDays: 365,
  repairWarrantyDays: 90,
  replacementWindowDays: 15,
  doaDays: 30,
  amcDays: 365,
  amcAmount: 0,
  isOutOfWarrantyServiced: 'Y',
  standardServiceCharge: 0,
  releaseDate: new Date().toISOString().split('T')[0],
  isActive: 'Y',
};

interface ModelFormDialogProps {
  open: boolean;
  modelToEdit: Model | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function ModelFormDialog({ open, modelToEdit, onClose, onSuccess }: ModelFormDialogProps) {
  const isEditing = !!modelToEdit;
  const [activeTab, setActiveTab] = useState<number>(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const createModel = useCreateModel();
  const updateModel = useUpdateModel();

  // Load brands and products for selection
  const { data: brandsData } = useBrands({ limit: 100, isActive: 'Y' });
  const { data: productsData } = useProducts({ limit: 100, isActive: 'Y' });

  const brands = brandsData?.items || [];
  const products = productsData?.items || [];

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: defaultModelValues,
  });

  const checkSerial = watch('checkSerialNumber');

  useEffect(() => {
    if (open) {
      setServerError(null);
      setActiveTab(0);
      if (modelToEdit) {
        let releaseDateStr = '';
        if (modelToEdit.releaseDate) {
          const d = new Date(modelToEdit.releaseDate);
          releaseDateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
        }

        reset({
          brandId: modelToEdit.brandId,
          productId: modelToEdit.productId,
          modelCode: modelToEdit.modelCode,
          modelName: modelToEdit.modelName,
          technicalName: modelToEdit.technicalName || '',
          softwareVersion: modelToEdit.softwareVersion || '',
          serialNumberLength: modelToEdit.serialNumberLength,
          checkSerialNumber: modelToEdit.checkSerialNumber,
          isJobCreationAllowed: modelToEdit.isJobCreationAllowed,
          isDoaAllowed: modelToEdit.isDoaAllowed,
          isRepairable: modelToEdit.isRepairable,
          isReplacementAllowed: modelToEdit.isReplacementAllowed,
          customerWarrantyDays: modelToEdit.customerWarrantyDays,
          repairWarrantyDays: modelToEdit.repairWarrantyDays,
          replacementWindowDays: modelToEdit.replacementWindowDays,
          doaDays: modelToEdit.doaDays,
          amcDays: modelToEdit.amcDays,
          amcAmount: modelToEdit.amcAmount,
          isOutOfWarrantyServiced: modelToEdit.isOutOfWarrantyServiced,
          standardServiceCharge: modelToEdit.standardServiceCharge,
          releaseDate: releaseDateStr || new Date().toISOString().split('T')[0],
          isActive: modelToEdit.isActive,
        });
      } else {
        reset(defaultModelValues);
      }
    }
  }, [open, modelToEdit, reset]);

  const onSubmit = async (values: ModelFormData) => {
    setServerError(null);
    try {
      if (isEditing && modelToEdit) {
        await updateModel.mutateAsync({
          id: modelToEdit.modelId,
          payload: {
            brandId: values.brandId,
            productId: values.productId,
            modelName: values.modelName.trim(),
            technicalName: values.technicalName?.trim() || undefined,
            softwareVersion: values.softwareVersion?.trim() || undefined,
            serialNumberLength: Number(values.serialNumberLength),
            checkSerialNumber: values.checkSerialNumber,
            isJobCreationAllowed: values.isJobCreationAllowed,
            isDoaAllowed: values.isDoaAllowed,
            isRepairable: values.isRepairable,
            isReplacementAllowed: values.isReplacementAllowed,
            customerWarrantyDays: Number(values.customerWarrantyDays),
            repairWarrantyDays: Number(values.repairWarrantyDays),
            replacementWindowDays: Number(values.replacementWindowDays),
            doaDays: Number(values.doaDays),
            amcDays: Number(values.amcDays),
            amcAmount: Number(values.amcAmount),
            isOutOfWarrantyServiced: values.isOutOfWarrantyServiced,
            standardServiceCharge: Number(values.standardServiceCharge),
            releaseDate: values.releaseDate,
            isActive: values.isActive,
            versionNo: modelToEdit.versionNo,
          },
        });
        onSuccess(`Model "${values.modelName}" updated successfully.`);
      } else {
        await createModel.mutateAsync({
          brandId: values.brandId,
          productId: values.productId,
          modelCode: values.modelCode.toUpperCase().trim(),
          modelName: values.modelName.trim(),
          technicalName: values.technicalName?.trim() || undefined,
          softwareVersion: values.softwareVersion?.trim() || undefined,
          serialNumberLength: Number(values.serialNumberLength),
          checkSerialNumber: values.checkSerialNumber,
          isJobCreationAllowed: values.isJobCreationAllowed,
          isDoaAllowed: values.isDoaAllowed,
          isRepairable: values.isRepairable,
          isReplacementAllowed: values.isReplacementAllowed,
          customerWarrantyDays: Number(values.customerWarrantyDays),
          repairWarrantyDays: Number(values.repairWarrantyDays),
          replacementWindowDays: Number(values.replacementWindowDays),
          doaDays: Number(values.doaDays),
          amcDays: Number(values.amcDays),
          amcAmount: Number(values.amcAmount),
          isOutOfWarrantyServiced: values.isOutOfWarrantyServiced,
          standardServiceCharge: Number(values.standardServiceCharge),
          releaseDate: values.releaseDate,
          isActive: values.isActive,
        });
        onSuccess(`Model "${values.modelName}" registered successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save model.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>
        {isEditing ? `Edit Model: ${modelToEdit?.modelName}` : 'Register Enterprise Model Master'}
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)}>
          <Tab label="1. Basic Information" />
          <Tab label="2. Service Eligibility" />
          <Tab label="3. Warranty & AMC Settings" />
        </Tabs>
      </Box>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers sx={{ minHeight: 380 }}>
          {serverError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError}
            </Alert>
          )}

          {/* TAB 0: BASIC INFORMATION */}
          {activeTab === 0 && (
            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="brandId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth size="small" required error={!!errors.brandId}>
                      <InputLabel id="brand-select-label">Brand</InputLabel>
                      <Select
                        {...field}
                        labelId="brand-select-label"
                        label="Brand"
                        disabled={isEditing}
                      >
                        <MenuItem value="" disabled>
                          Select Brand
                        </MenuItem>
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
                    <FormControl fullWidth size="small" required error={!!errors.productId}>
                      <InputLabel id="product-select-label">Product</InputLabel>
                      <Select
                        {...field}
                        labelId="product-select-label"
                        label="Product"
                        disabled={isEditing}
                      >
                        <MenuItem value="" disabled>
                          Select Product
                        </MenuItem>
                        {products.map((p) => (
                          <MenuItem key={p.productId} value={p.productId}>
                            {p.productName} ({p.productCode} - {p.categoryFamily})
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.productId && (
                        <FormHelperText>{errors.productId.message}</FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="modelCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      label="Model Code"
                      placeholder="e.g. SKC-AC-15T-INV"
                      required
                      disabled={isEditing}
                      error={!!errors.modelCode}
                      helperText={
                        isEditing
                          ? 'Model codes cannot be changed once created.'
                          : errors.modelCode?.message || 'Unique per brand'
                      }
                      inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 50 }}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="modelName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      label="Model Name (Marketing / Commercial)"
                      placeholder="e.g. Skatercat 1.5T 5-Star Split AC"
                      required
                      error={!!errors.modelName}
                      helperText={errors.modelName?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="technicalName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      label="Technical / Engineering Name"
                      placeholder="e.g. MS-18INV-R32-V2"
                      error={!!errors.technicalName}
                      helperText={errors.technicalName?.message || 'Factory engineering code'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="softwareVersion"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      label="Software / Firmware Version"
                      placeholder="e.g. v2.4.1"
                      error={!!errors.softwareVersion}
                      helperText={errors.softwareVersion?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="releaseDate"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="date"
                      label="Market Release Date"
                      InputLabelProps={{ shrink: true }}
                      required
                      error={!!errors.releaseDate}
                      helperText={errors.releaseDate?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%',
                        pt: { xs: 0, sm: 1 },
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Switch
                            checked={field.value === 'Y'}
                            onChange={(e) => field.onChange(e.target.checked ? 'Y' : 'N')}
                            color="primary"
                          />
                        }
                        label={
                          field.value === 'Y' ? 'Active Model' : 'Inactive (Job creation barred)'
                        }
                      />
                    </Box>
                  )}
                />
              </Grid>
            </Grid>
          )}

          {/* TAB 1: SERVICE ELIGIBILITY */}
          {activeTab === 1 && (
            <Grid container spacing={2.5}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                  Serial Number & Barcode Verification
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="checkSerialNumber"
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
                      label="Enforce Serial Number Validation on Call Intake"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="serialNumberLength"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Expected Serial Number Length"
                      disabled={checkSerial !== 'Y'}
                      error={!!errors.serialNumberLength}
                      helperText={
                        checkSerial !== 'Y'
                          ? 'Validation disabled'
                          : errors.serialNumberLength?.message || 'Standard barcode length (e.g. 15 digits)'
                      }
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 1, mb: 1 }}>
                  Operational Service Permissions
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="isJobCreationAllowed"
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
                      label="Permit Job Card Creation"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="isRepairable"
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
                      label="Repairable in Field / Service Center"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="isDoaAllowed"
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
                      label="Dead on Arrival (DOA) Claim Allowed"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="isReplacementAllowed"
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
                      label="Unit Replacement Permitted"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="isOutOfWarrantyServiced"
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
                      label="Out of Warranty (OOW) Support"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="standardServiceCharge"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Standard Visit Charge (OOW)"
                      InputProps={{
                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      }}
                      error={!!errors.standardServiceCharge}
                      helperText={errors.standardServiceCharge?.message || 'Standard labor fee'}
                    />
                  )}
                />
              </Grid>
            </Grid>
          )}

          {/* TAB 2: WARRANTY & AMC SETTINGS */}
          {activeTab === 2 && (
            <Grid container spacing={2.5}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                  Standard SLA Windows (in Calendar Days)
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="customerWarrantyDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Customer Comprehensive Warranty (Days)"
                      error={!!errors.customerWarrantyDays}
                      helperText={errors.customerWarrantyDays?.message || 'e.g. 365 days (1 year)'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="repairWarrantyDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Post-Repair Warranty (Days)"
                      error={!!errors.repairWarrantyDays}
                      helperText={errors.repairWarrantyDays?.message || 'e.g. 90 days repeat warranty'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="replacementWindowDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Commercial Replacement Window (Days)"
                      error={!!errors.replacementWindowDays}
                      helperText={errors.replacementWindowDays?.message || 'e.g. 15 days from invoice'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="doaDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Dead On Arrival (DOA) Window (Days)"
                      error={!!errors.doaDays}
                      helperText={errors.doaDays?.message || 'e.g. 30 days from purchase'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 1, mb: 1 }}>
                  Annual Maintenance Contract (AMC) Policy
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="amcDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="AMC Duration (Days)"
                      error={!!errors.amcDays}
                      helperText={errors.amcDays?.message || 'Standard AMC term (365 days)'}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="amcAmount"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      size="small"
                      fullWidth
                      type="number"
                      label="Annual AMC Subscription Fee"
                      InputProps={{
                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      }}
                      error={!!errors.amcAmount}
                      helperText={errors.amcAmount?.message || 'Contract fee in INR'}
                    />
                  )}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {activeTab > 0 && (
              <Button size="small" onClick={() => setActiveTab((prev) => prev - 1)}>
                Back
              </Button>
            )}
            {activeTab < 2 && (
              <Button size="small" variant="outlined" onClick={() => setActiveTab((prev) => prev + 1)}>
                Next
              </Button>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={onClose} color="inherit" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || createModel.isPending || updateModel.isPending}
            >
              {isSubmitting || createModel.isPending || updateModel.isPending
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : 'Register Model'}
            </Button>
          </Box>
        </DialogActions>
      </form>
    </Dialog>
  );
}
