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
import { State, useCreateState, useUpdateState } from '../../../../../lib/catalogApi';

const stateSchema = z.object({
  stateCode: z
    .string()
    .min(2, 'State code must be at least 2 characters')
    .max(10, 'State code must not exceed 10 characters')
    .regex(/^[A-Za-z]+$/, 'Letters only (e.g. MH, DL, KA)'),
  stateName: z
    .string()
    .min(2, 'State name must be at least 2 characters')
    .max(100, 'Max 100 characters'),
  zone: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'NORTH_EAST']),
  isActive: z.enum(['Y', 'N']),
});

type StateFormData = z.infer<typeof stateSchema>;

interface StateFormDialogProps {
  open: boolean;
  stateToEdit: State | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function StateFormDialog({ open, stateToEdit, onClose, onSuccess }: StateFormDialogProps) {
  const isEditing = !!stateToEdit;
  const createState = useCreateState();
  const updateState = useUpdateState();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StateFormData>({
    resolver: zodResolver(stateSchema),
    defaultValues: {
      stateCode: '',
      stateName: '',
      zone: 'WEST',
      isActive: 'Y',
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      if (stateToEdit) {
        reset({
          stateCode: stateToEdit.stateCode,
          stateName: stateToEdit.stateName,
          zone: stateToEdit.zone,
          isActive: stateToEdit.isActive,
        });
      } else {
        reset({
          stateCode: '',
          stateName: '',
          zone: 'WEST',
          isActive: 'Y',
        });
      }
    }
  }, [open, stateToEdit, reset]);

  const onSubmit = async (values: StateFormData) => {
    setServerError(null);
    try {
      if (isEditing && stateToEdit) {
        await updateState.mutateAsync({
          id: stateToEdit.stateId,
          payload: {
            stateName: values.stateName.trim(),
            zone: values.zone,
            isActive: values.isActive,
            versionNo: stateToEdit.versionNo,
          },
        });
        onSuccess(`State "${values.stateName}" updated successfully.`);
      } else {
        await createState.mutateAsync({
          stateCode: values.stateCode.toUpperCase().trim(),
          stateName: values.stateName.trim(),
          zone: values.zone,
          isActive: values.isActive,
        });
        onSuccess(`State "${values.stateName}" created successfully.`);
      }
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save state record.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle sx={{ fontWeight: 600, borderBottom: 1, borderColor: 'divider', pb: 2 }}>
          {isEditing ? `Edit State: ${stateToEdit?.stateName}` : 'Add New State / Territory'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {serverError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {serverError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <Controller
              name="stateCode"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="State Code"
                  fullWidth
                  required
                  disabled={isEditing}
                  error={!!errors.stateCode}
                  helperText={errors.stateCode?.message || 'Standard 2 or 3-letter abbreviation (e.g. MH, DL, KA)'}
                  inputProps={{ maxLength: 10, style: { textTransform: 'uppercase' } }}
                />
              )}
            />

            <Controller
              name="stateName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="State / Union Territory Name"
                  fullWidth
                  required
                  error={!!errors.stateName}
                  helperText={errors.stateName?.message}
                />
              )}
            />

            <Controller
              name="zone"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth required error={!!errors.zone}>
                  <InputLabel id="zone-select-label">Operational Zone</InputLabel>
                  <Select
                    {...field}
                    labelId="zone-select-label"
                    label="Operational Zone"
                  >
                    <MenuItem value="NORTH">North Zone</MenuItem>
                    <MenuItem value="SOUTH">South Zone</MenuItem>
                    <MenuItem value="EAST">East Zone</MenuItem>
                    <MenuItem value="WEST">West Zone</MenuItem>
                    <MenuItem value="CENTRAL">Central Zone</MenuItem>
                    <MenuItem value="NORTH_EAST">North East Zone</MenuItem>
                  </Select>
                  {errors.zone && <FormHelperText>{errors.zone.message}</FormHelperText>}
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
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create State'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
