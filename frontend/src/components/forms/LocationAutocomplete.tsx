'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import StarIcon from '@mui/icons-material/Star';
import { Location, useLocation, useLocations } from '../../lib/catalogApi';

export interface LocationAutocompleteProps {
  value: string | null | undefined; // Selected locationId (UUID)
  onChange: (locationId: string, location?: Location | null) => void;
  label?: string;
  placeholder?: string;
  partyType?: string; // e.g. 'ASF', 'CENTRAL_WAREHOUSE'
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  includeTestFixtures?: boolean;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  allowClear?: boolean;
  autoFocus?: boolean;
}

export function LocationAutocomplete({
  value,
  onChange,
  label = 'Service Center',
  placeholder = 'Search by name, code, city, or pincode...',
  partyType = 'ASF',
  required = false,
  disabled = false,
  error = false,
  helperText,
  includeTestFixtures = false,
  size = 'small',
  fullWidth = true,
  allowClear = true,
  autoFocus = false,
}: LocationAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(inputValue.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [inputValue]);

  // Query operational locations matching search & partyType
  const {
    data: locationsData,
    isLoading,
    isFetching,
    isError,
    error: apiError,
    refetch,
  } = useLocations({
    search: debouncedSearch || undefined,
    partyType: partyType || undefined,
    isActive: 'Y',
    includeTestFixtures,
    limit: 50,
  });

  // Also query the specific location if value is set but not in search results
  const { data: initialLocation } = useLocation(
    value && value !== 'ALL' ? value : undefined
  );

  // Combine search results and ensure the selected item is present in options list
  const options = useMemo(() => {
    const list = [...(locationsData?.items || [])];
    if (initialLocation && !list.some((l) => l.locationId === initialLocation.locationId)) {
      list.unshift(initialLocation);
    }
    return list;
  }, [locationsData?.items, initialLocation]);

  // Currently selected option object
  const selectedOption = useMemo(() => {
    if (!value || value === 'ALL') return null;
    return options.find((l) => l.locationId === value) || initialLocation || null;
  }, [options, value, initialLocation]);

  return (
    <Autocomplete
      options={options}
      value={selectedOption}
      disabled={disabled}
      fullWidth={fullWidth}
      size={size}
      disableClearable={!allowClear}
      getOptionLabel={(option) => {
        if (typeof option === 'string') return option;
        return option.locationName || option.locationCode || '';
      }}
      isOptionEqualToValue={(option, val) => option.locationId === val.locationId}
      onInputChange={(_, newInputValue) => {
        setInputValue(newInputValue);
      }}
      onChange={(_, newValue) => {
        if (newValue && typeof newValue !== 'string') {
          onChange(newValue.locationId, newValue);
        } else {
          onChange('', null);
        }
      }}
      noOptionsText={
        isError ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 0.5 }}>
            <Typography variant="body2" color="error">
              Failed to load locations.
            </Typography>
            <Tooltip title="Retry">
              <IconButton size="small" onClick={() => refetch()} color="primary">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : isLoading || isFetching ? (
          'Searching locations...'
        ) : (
          'No matching operational service centers found.'
        )
      }
      renderOption={(props, option) => {
        // Build readable secondary text: City, State · CODE
        const geoParts: string[] = [];
        if (option.cityName || option.city) geoParts.push(option.cityName || option.city || '');
        if (option.stateName || option.state) geoParts.push(option.stateName || option.state || '');
        const geoStr = geoParts.filter(Boolean).join(', ');
        const codeStr = option.locationCode || option.code || '';
        const secondary = [geoStr, codeStr].filter(Boolean).join(' · ');

        return (
          <Box
            component="li"
            {...props}
            key={option.locationId}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start !important',
              py: 1,
              px: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              '&:last-child': { borderBottom: 'none' },
            }}
          >
            {/* Primary line: bold human-readable location name */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', justifyContent: 'space-between' }}>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {option.locationName || option.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {option.isDefault === 'Y' && (
                  <Chip
                    icon={<StarIcon sx={{ fontSize: '12px !important' }} />}
                    label="Default ASF"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                )}
                {option.partyType !== 'ASF' && (
                  <Chip
                    label={option.partyType}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                )}
              </Box>
            </Box>

            {/* Secondary line: city, state and location code */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
              <LocationOnIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
              <span>{secondary || 'Operational Location'}</span>
              {option.pincode && <span>· PIN {option.pincode}</span>}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selectedOption ? undefined : placeholder}
          required={required}
          autoFocus={autoFocus}
          error={error || isError}
          helperText={helperText || (isError ? 'Unable to load operational centers' : undefined)}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading || isFetching ? <CircularProgress color="inherit" size={18} sx={{ mr: 1 }} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

