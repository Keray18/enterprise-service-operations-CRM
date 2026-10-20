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
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { City, useCreateCity, useStates, useUpdateCity } from '../../../../../lib/catalogApi';

const citySchema = z.object({
  stateId: z.string().min(1, 'State is required'),
  cityName: z
    .string()
    .min(2, 'City name must be at least 2 characters')
    .max(100, 'Max 100 characters'),
  tier: z.enum(['TIER_1', 'TIER_2', 'TIER_3']).optional().or(z.literal('')),
  isActive: z.enum(['Y', 'N']),
});

type CityFormData = z.infer<typeof citySchema>;

interface CityFormDialogProps {
  open: boolean;
  cityToEdit: City | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function CityFormDialog({ open, cityToEdit, onClose, onSuccess }: CityFormDialogProps) {
  const isEditing = !!cityToEdit;
  const createCity = useCreateCity();
  const updateCity = useUpdateCity();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { data: statesData } = useStates({ limit: 100, isActive: 'Y' });
  const states = statesData?.items || [];

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CityFormData>({
    resolver: zodResolver(citySchema),
    defaultValues: {
      stateId: '',
      cityName: '',
      tier: 'TIER_2',
      isActive: 'Y',
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (cityToEdit) {
        reset({
          stateId: cityToEdit.stateId,
          cityName: cityToEdit.cityName,
          tier: (cityToEdit.tier as any) || 'TIER_2',
          isActive: cityToEdit.isActive,
        });
      } else {
        reset({
          stateId: '',
          cityName: '',
          tier: 'TIER_2',
          isActive: 'Y',
        });
      }
    }
  }, [open, cityToEdit, reset]);

  const onSubmit = async (values: CityFormData) => {
    setServerError(null);
    try {
      if (isEditing && cityToEdit) {
        await updateCity.mutateAsync({
          id: cityToEdit.cityId,
          payload: {
            stateId: values.stateId,
            cityName: values.cityName.trim(),
            isActive: values.isActive,
            versionNo: cityToEdit.versionNo,
          },
        });
        onSuccess(`City "${values.cityName}" updated successfully.`);
      } else {
        await createCity.mutateAsync({
          stateId: values.stateId,
          cityName: values.cityName.trim(),
          isActive: values.isActive,
        });
        onSuccess(`City "${values.cityName}" created successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save city record.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle sx={{ fontWeight: 600, borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {isEditing ? `Edit City: ${cityToEdit?.cityName}` : 'Add New City'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {serverError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {serverError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <Controller
              name="stateId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth required error={!!errors.stateId}>
                  <InputLabel id="state-select-label">Parent State / Territory</InputLabel>
                  <Select
                    {...field}
                    labelId="state-select-label"
                    label="Parent State / Territory"
                  >
                    {states.map((s) => (
                      <MenuItem key={s.stateId} value={s.stateId}>
                        {s.stateName} ({s.stateCode}) — {s.zone} Zone
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.stateId && <FormHelperText>{errors.stateId.message}</FormHelperText>}
                </FormControl>
              )}
            />

            <Controller
              name="cityName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="City Name"
                  fullWidth
                  required
                  error={!!errors.cityName}
                  helperText={errors.cityName?.message || 'Unique within the selected State'}
                />
              )}
            />

            <Controller
              name="tier"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel id="tier-select-label">Market Tier Classification</InputLabel>
                  <Select
                    {...field}
                    labelId="tier-select-label"
                    label="Market Tier Classification"
                  >
                    <MenuItem value="TIER_1">Tier 1 (Metro / Major Urban)</MenuItem>
                    <MenuItem value="TIER_2">Tier 2 (Emerging Urban / Regional Hub)</MenuItem>
                    <MenuItem value="TIER_3">Tier 3 (Semi-Urban / Rural)</MenuItem>
                  </Select>
                </FormControl>
              )}
            />

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
                      Active Status {field.value === 'Y' ? '(Active)' : '(Disabled)'}
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
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create City'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
