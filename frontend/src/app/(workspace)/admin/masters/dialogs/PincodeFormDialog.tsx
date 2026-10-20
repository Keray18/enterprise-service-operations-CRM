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
import {
  Pincode,
  useCities,
  useCreatePincode,
  useLocations,
  useStates,
  useUpdatePincode,
} from '../../../../../lib/catalogApi';

const pincodeSchema = z.object({
  pincode: z
    .string()
    .length(6, 'Pincode must be exactly 6 digits')
    .regex(/^[0-9]+$/, 'Numbers only, preserving leading zeroes'),
  stateId: z.string().min(1, 'State is required'),
  cityId: z.string().min(1, 'City is required'),
  defaultAsfId: z.string().optional().or(z.literal('')),
  isServiceable: z.enum(['Y', 'N']),
});

type PincodeFormData = z.infer<typeof pincodeSchema>;

interface PincodeFormDialogProps {
  open: boolean;
  pincodeToEdit: Pincode | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function PincodeFormDialog({ open, pincodeToEdit, onClose, onSuccess }: PincodeFormDialogProps) {
  const isEditing = !!pincodeToEdit;
  const createPincode = useCreatePincode();
  const updatePincode = useUpdatePincode();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { data: statesData } = useStates({ limit: 100, isActive: 'Y' });
  const states = statesData?.items || [];

  const { data: locationsData } = useLocations({ limit: 100, isActive: 'Y' });
  const locations = locationsData?.items || [];

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PincodeFormData>({
    resolver: zodResolver(pincodeSchema),
    defaultValues: {
      pincode: '',
      stateId: '',
      cityId: '',
      defaultAsfId: '',
      isServiceable: 'Y',
    },
  });

  const selectedStateId = watch('stateId');

  // Dynamically load cities for the selected state
  const { data: citiesData, isLoading: isLoadingCities } = useCities({
    stateId: selectedStateId || undefined,
    limit: 100,
    isActive: 'Y',
  });
  const cities = citiesData?.items || [];

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (pincodeToEdit) {
        reset({
          pincode: pincodeToEdit.pincode,
          stateId: pincodeToEdit.stateId,
          cityId: pincodeToEdit.cityId,
          defaultAsfId: pincodeToEdit.defaultAsfId || '',
          isServiceable: pincodeToEdit.isServiceable,
        });
      } else {
        reset({
          pincode: '',
          stateId: '',
          cityId: '',
          defaultAsfId: '',
          isServiceable: 'Y',
        });
      }
    }
  }, [open, pincodeToEdit, reset]);

  const onSubmit = async (values: PincodeFormData) => {
    setServerError(null);
    try {
      if (isEditing && pincodeToEdit) {
        await updatePincode.mutateAsync({
          id: pincodeToEdit.pincodeId,
          payload: {
            stateId: values.stateId,
            cityId: values.cityId,
            defaultAsfId: values.defaultAsfId?.trim() || undefined,
            isServiceable: values.isServiceable,
            versionNo: pincodeToEdit.versionNo,
          },
        });
        onSuccess(`Pincode "${values.pincode}" updated successfully.`);
      } else {
        await createPincode.mutateAsync({
          pincode: values.pincode.trim(),
          stateId: values.stateId,
          cityId: values.cityId,
          defaultAsfId: values.defaultAsfId?.trim() || undefined,
          isServiceable: values.isServiceable,
        });
        onSuccess(`Pincode "${values.pincode.trim()}" registered successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save pincode record.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle sx={{ fontWeight: 600, borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {isEditing ? `Edit Pincode: ${pincodeToEdit?.pincode}` : 'Register Serviceable Pincode'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {serverError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {serverError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <Controller
              name="pincode"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="6-Digit Postal Pincode"
                  fullWidth
                  required
                  disabled={isEditing}
                  error={!!errors.pincode}
                  helperText={errors.pincode?.message || 'Must preserve leading zeros (e.g. 011001)'}
                  inputProps={{ maxLength: 6 }}
                />
              )}
            />

            <Controller
              name="stateId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth required error={!!errors.stateId}>
                  <InputLabel id="pincode-state-label">State / Union Territory</InputLabel>
                  <Select
                    {...field}
                    labelId="pincode-state-label"
                    label="State / Union Territory"
                    onChange={(e) => {
                      field.onChange(e);
                      // Clear city selection when state changes
                      setValue('cityId', '');
                    }}
                  >
                    {states.map((s) => (
                      <MenuItem key={s.stateId} value={s.stateId}>
                        {s.stateName} ({s.stateCode})
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.stateId && <FormHelperText>{errors.stateId.message}</FormHelperText>}
                </FormControl>
              )}
            />

            <Controller
              name="cityId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth required error={!!errors.cityId} disabled={!selectedStateId || isLoadingCities}>
                  <InputLabel id="pincode-city-label">Assigned City</InputLabel>
                  <Select
                    {...field}
                    labelId="pincode-city-label"
                    label="Assigned City"
                  >
                    {cities.map((c) => (
                      <MenuItem key={c.cityId} value={c.cityId}>
                        {c.cityName}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.cityId && <FormHelperText>{errors.cityId.message}</FormHelperText>}
                  {!selectedStateId && <FormHelperText>Select a State first to view applicable cities</FormHelperText>}
                </FormControl>
              )}
            />

            <Controller
              name="defaultAsfId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel id="pincode-asf-label">Default Authorized Service Center (ASF)</InputLabel>
                  <Select
                    {...field}
                    labelId="pincode-asf-label"
                    label="Default Authorized Service Center (ASF)"
                  >
                    <MenuItem value="">
                      <em>None (Unassigned — Direct or Dynamic Dispatch)</em>
                    </MenuItem>
                    {locations.map((loc) => (
                      <MenuItem key={loc.locationId} value={loc.locationId}>
                        {loc.locationName} ({loc.locationCode}) — {loc.partyType}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>Default service partner for automated technician dispatch</FormHelperText>
                </FormControl>
              )}
            />

            <Controller
              name="isServiceable"
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
                      Serviceability Status {field.value === 'Y' ? '(Eligible for on-site call booking)' : '(Out of service area)'}
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
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Pincode'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
