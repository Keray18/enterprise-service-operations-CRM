'use client';

import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { EnterpriseTable } from '../../../../components/data-display/DataTablePrimitives';
import { EmptyState } from '../../../../components/data-display/EmptyState';
import { FilterToolbar } from '../../../../components/data-display/FilterToolbar';
import { ConfirmationDialog } from '../../../../components/dialogs/ConfirmationDialog';
import { ErrorDisplay } from '../../../../components/feedback/ErrorDisplay';
import { TableSkeleton } from '../../../../components/feedback/LoadingSkeleton';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';
import {
  catalogApi,
  City,
  Pincode,
  PincodeLookup,
  State,
  useCities,
  usePincodes,
  useStates,
  useToggleCityStatus,
  useTogglePincodeStatus,
  useToggleStateStatus,
} from '../../../../lib/catalogApi';
import { useAuth } from '../../../../providers/AuthProvider';
import { CityFormDialog } from './dialogs/CityFormDialog';
import { PincodeFormDialog } from './dialogs/PincodeFormDialog';
import { StateFormDialog } from './dialogs/StateFormDialog';

interface GeographyManagementTabProps {
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export function GeographyManagementTab({ onNotify }: GeographyManagementTabProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masters:manage');

  const [subTab, setSubTab] = useState<number>(0);

  // States Master Tab State
  const [statePage, setStatePage] = useState<number>(0);
  const [stateLimit, setStateLimit] = useState<number>(10);
  const [stateSearch, setStateSearch] = useState<string>('');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [stateFormOpen, setStateFormOpen] = useState<boolean>(false);
  const [stateToEdit, setStateToEdit] = useState<State | null>(null);
  const [stateConfirmOpen, setStateConfirmOpen] = useState<boolean>(false);
  const [stateToToggle, setStateToToggle] = useState<State | null>(null);
  const toggleStateStatus = useToggleStateStatus();

  // Cities Master Tab State
  const [cityPage, setCityPage] = useState<number>(0);
  const [cityLimit, setCityLimit] = useState<number>(10);
  const [citySearch, setCitySearch] = useState<string>('');
  const [cityStateFilter, setCityStateFilter] = useState<string>('ALL');
  const [cityFormOpen, setCityFormOpen] = useState<boolean>(false);
  const [cityToEdit, setCityToEdit] = useState<City | null>(null);
  const [cityConfirmOpen, setCityConfirmOpen] = useState<boolean>(false);
  const [cityToToggle, setCityToToggle] = useState<City | null>(null);
  const toggleCityStatus = useToggleCityStatus();

  // Pincodes & Serviceability Tab State
  const [pincodePage, setPincodePage] = useState<number>(0);
  const [pincodeLimit, setPincodeLimit] = useState<number>(10);
  const [pincodeSearch, setPincodeSearch] = useState<string>('');
  const [pincodeStateFilter, setPincodeStateFilter] = useState<string>('ALL');
  const [serviceableFilter, setServiceableFilter] = useState<string>('ALL');
  const [pincodeFormOpen, setPincodeFormOpen] = useState<boolean>(false);
  const [pincodeToEdit, setPincodeToEdit] = useState<Pincode | null>(null);
  const [pincodeConfirmOpen, setPincodeConfirmOpen] = useState<boolean>(false);
  const [pincodeToToggle, setPincodeToToggle] = useState<Pincode | null>(null);
  const togglePincodeStatus = useTogglePincodeStatus();

  // Fast Pincode Lookup Widget State
  const [lookupQuery, setLookupQuery] = useState<string>('');
  const [lookupResult, setLookupResult] = useState<PincodeLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Queries
  const { data: statesList } = useStates({ limit: 100, isActive: 'Y' });
  const allActiveStates = statesList?.items || [];

  const {
    data: statesData,
    isLoading: statesLoading,
    isError: statesIsError,
    error: statesError,
    refetch: refetchStates,
  } = useStates({
    page: statePage + 1,
    limit: stateLimit,
    search: stateSearch.trim() || undefined,
    zone: zoneFilter === 'ALL' ? undefined : zoneFilter,
  });

  const {
    data: citiesData,
    isLoading: citiesLoading,
    isError: citiesIsError,
    error: citiesError,
    refetch: refetchCities,
  } = useCities({
    page: cityPage + 1,
    limit: cityLimit,
    search: citySearch.trim() || undefined,
    stateId: cityStateFilter === 'ALL' ? undefined : cityStateFilter,
  });

  const {
    data: pincodesData,
    isLoading: pincodesLoading,
    isError: pincodesIsError,
    error: pincodesError,
    refetch: refetchPincodes,
  } = usePincodes({
    page: pincodePage + 1,
    limit: pincodeLimit,
    search: pincodeSearch.trim() || undefined,
    stateId: pincodeStateFilter === 'ALL' ? undefined : pincodeStateFilter,
    isServiceable: serviceableFilter === 'ALL' ? undefined : (serviceableFilter as any),
  });

  // Fast Pincode Lookup Handler
  const handleLookup = async () => {
    if (!lookupQuery || lookupQuery.trim().length !== 6) {
      setLookupError('Enter a valid 6-digit postal pincode.');
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const res = await catalogApi.lookupPincode(lookupQuery.trim());
      setLookupResult(res);
    } catch (err: any) {
      setLookupError(err.message || 'Pincode not found in database.');
    } finally {
      setLookupLoading(false);
    }
  };

  // State actions
  const handleConfirmStateToggle = async () => {
    if (!stateToToggle) return;
    try {
      const next = stateToToggle.isActive === 'Y' ? 'N' : 'Y';
      await toggleStateStatus.mutateAsync({
        id: stateToToggle.stateId,
        payload: { isActive: next, versionNo: stateToToggle.versionNo },
      });
      onNotify(
        `State "${stateToToggle.stateName}" ${next === 'Y' ? 'activated' : 'deactivated'} successfully.`
      );
      setStateConfirmOpen(false);
      setStateToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update state status', 'error');
    }
  };

  // City actions
  const handleConfirmCityToggle = async () => {
    if (!cityToToggle) return;
    try {
      const next = cityToToggle.isActive === 'Y' ? 'N' : 'Y';
      await toggleCityStatus.mutateAsync({
        id: cityToToggle.cityId,
        payload: { isActive: next, versionNo: cityToToggle.versionNo },
      });
      onNotify(
        `City "${cityToToggle.cityName}" ${next === 'Y' ? 'activated' : 'deactivated'} successfully.`
      );
      setCityConfirmOpen(false);
      setCityToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update city status', 'error');
    }
  };

  // Pincode actions
  const handleConfirmPincodeToggle = async () => {
    if (!pincodeToToggle) return;
    try {
      const next = pincodeToToggle.isServiceable === 'Y' ? 'N' : 'Y';
      await togglePincodeStatus.mutateAsync({
        id: pincodeToToggle.pincodeId,
        payload: { isServiceable: next, versionNo: pincodeToToggle.versionNo },
      });
      onNotify(
        `Pincode "${pincodeToToggle.pincode}" marked as ${
          next === 'Y' ? 'Serviceable' : 'Non-Serviceable'
        }.`
      );
      setPincodeConfirmOpen(false);
      setPincodeToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update pincode serviceability', 'error');
    }
  };

  // ==========================================
  // COLUMNS DEFINITIONS
  // ==========================================

  const stateColumns = [
    {
      id: 'stateCode',
      label: 'State Code',
      width: 130,
      render: (row: State) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
          {row.stateCode}
        </Typography>
      ),
    },
    {
      id: 'stateName',
      label: 'State / UT Name',
      render: (row: State) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {row.stateName}
        </Typography>
      ),
    },
    {
      id: 'zone',
      label: 'Zone',
      width: 140,
      render: (row: State) => (
        <Chip
          label={`${row.zone} ZONE`}
          size="small"
          variant="outlined"
          color="primary"
          sx={{ fontWeight: 600, fontSize: '0.72rem' }}
        />
      ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 110,
      render: (row: State) => (
        <StatusBadge
          status={row.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}
          label={row.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: 100,
      align: 'right' as const,
      render: (row: State) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit State' : 'View only'}>
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setStateToEdit(row);
                  setStateFormOpen(true);
                }}
                disabled={!canManage}
                color="primary"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={row.isActive === 'Y' ? 'Deactivate State' : 'Activate State'}>
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setStateToToggle(row);
                  setStateConfirmOpen(true);
                }}
                disabled={!canManage}
                color={row.isActive === 'Y' ? 'warning' : 'success'}
              >
                <PowerSettingsNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const cityColumns = [
    {
      id: 'cityName',
      label: 'City Name',
      render: (row: City) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.cityName}
        </Typography>
      ),
    },
    {
      id: 'state',
      label: 'State / Territory',
      width: 220,
      render: (row: City) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {row.stateName} ({row.stateCode})
          </Typography>
          {row.zone && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {row.zone} Zone
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'tier',
      label: 'Market Tier',
      width: 120,
      render: (row: City) =>
        row.tier ? (
          <Chip label={row.tier.replace('_', ' ')} size="small" variant="outlined" sx={{ fontSize: '0.72rem' }} />
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Unassigned
          </Typography>
        ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 110,
      render: (row: City) => (
        <StatusBadge
          status={row.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}
          label={row.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: 100,
      align: 'right' as const,
      render: (row: City) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit City' : 'View only'}>
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setCityToEdit(row);
                  setCityFormOpen(true);
                }}
                disabled={!canManage}
                color="primary"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={row.isActive === 'Y' ? 'Deactivate City' : 'Activate City'}>
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setCityToToggle(row);
                  setCityConfirmOpen(true);
                }}
                disabled={!canManage}
                color={row.isActive === 'Y' ? 'warning' : 'success'}
              >
                <PowerSettingsNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const pincodeColumns = [
    {
      id: 'pincode',
      label: 'Pincode',
      width: 120,
      render: (row: Pincode) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
          {row.pincode}
        </Typography>
      ),
    },
    {
      id: 'cityName',
      label: 'City',
      width: 180,
      render: (row: Pincode) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {row.cityName}
        </Typography>
      ),
    },
    {
      id: 'stateName',
      label: 'State',
      width: 180,
      render: (row: Pincode) => (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {row.stateName} ({row.stateCode})
        </Typography>
      ),
    },
    {
      id: 'asf',
      label: 'Default Service Partner (ASF)',
      render: (row: Pincode) =>
        row.defaultAsfName ? (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {row.defaultAsfName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              {row.defaultAsfCode}
            </Typography>
          </Box>
        ) : (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            Unassigned (Dynamic Routing)
          </Typography>
        ),
    },
    {
      id: 'isServiceable',
      label: 'Serviceability',
      width: 140,
      render: (row: Pincode) => (
        <Chip
          label={row.isServiceable === 'Y' ? 'SERVICEABLE' : 'OUT OF AREA'}
          size="small"
          color={row.isServiceable === 'Y' ? 'success' : 'error'}
          sx={{ fontWeight: 600, fontSize: '0.72rem' }}
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: 100,
      align: 'right' as const,
      render: (row: Pincode) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit Pincode Mapping' : 'View only'}>
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setPincodeToEdit(row);
                  setPincodeFormOpen(true);
                }}
                disabled={!canManage}
                color="primary"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip
            title={
              row.isServiceable === 'Y'
                ? 'Mark as Non-Serviceable'
                : 'Mark as Serviceable'
            }
          >
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setPincodeToToggle(row);
                  setPincodeConfirmOpen(true);
                }}
                disabled={!canManage}
                color={row.isServiceable === 'Y' ? 'error' : 'success'}
              >
                <PowerSettingsNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      {/* Sub-Tabs Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={subTab}
          onChange={(_e, val) => setSubTab(val)}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="Pincodes & Serviceability" />
          <Tab label="Cities Master" />
          <Tab label="States Master" />
        </Tabs>
      </Box>

      {/* ==================================================================== */}
      {/* SUB-TAB 0: PINCODES & SERVICEABILITY */}
      {/* ==================================================================== */}
      {subTab === 0 && (
        <Box>
          {/* Quick Pincode Resolution Widget */}
          <Card
            variant="outlined"
            sx={{
              p: 2.5,
              mb: 3,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'primary.light',
              borderRadius: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'primary.main' }}>
              ⚡ High-Speed Server-Side Pincode Resolution Tester
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Simulate call center intake lookups. Test real-time geographic validation and service partner mapping.
            </Typography>

            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Enter 6-Digit Pincode"
                  size="small"
                  fullWidth
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLookup();
                  }}
                  inputProps={{ maxLength: 6 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={handleLookup} disabled={lookupLoading}>
                          {lookupLoading ? <CircularProgress size={18} /> : <SearchIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={8}>
                {lookupResult && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 2,
                      p: 1.5,
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {lookupResult.isServiceable === 'Y' ? (
                        <CheckCircleOutlineIcon color="success" fontSize="small" />
                      ) : (
                        <HighlightOffIcon color="error" fontSize="small" />
                      )}
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {lookupResult.cityName}, {lookupResult.stateName} ({lookupResult.stateCode})
                      </Typography>
                    </Box>

                    <Chip
                      size="small"
                      label={lookupResult.isServiceable === 'Y' ? 'SERVICEABLE' : 'OUT OF AREA'}
                      color={lookupResult.isServiceable === 'Y' ? 'success' : 'error'}
                      sx={{ fontWeight: 600, fontSize: '0.72rem' }}
                    />

                    {lookupResult.defaultAsfName ? (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Default ASF: <strong>{lookupResult.defaultAsfName}</strong> ({lookupResult.defaultAsfCode})
                      </Typography>
                    ) : (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        ASF: Unassigned
                      </Typography>
                    )}
                  </Box>
                )}

                {lookupError && (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    {lookupError}
                  </Alert>
                )}
              </Grid>
            </Grid>
          </Card>

          {/* Filter Toolbar for Pincodes */}
          <FilterToolbar
            searchPlaceholder="Search pincode or city name..."
            searchValue={pincodeSearch}
            onSearchChange={(val) => {
              setPincodeSearch(val);
              setPincodePage(0);
            }}
            filters={
              <>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="pincode-state-filter-label">State</InputLabel>
                  <Select
                    labelId="pincode-state-filter-label"
                    value={pincodeStateFilter}
                    label="State"
                    onChange={(e) => {
                      setPincodeStateFilter(e.target.value);
                      setPincodePage(0);
                    }}
                  >
                    <MenuItem value="ALL">All States</MenuItem>
                    {allActiveStates.map((s) => (
                      <MenuItem key={s.stateId} value={s.stateId}>
                        {s.stateName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel id="pincode-serviceable-filter-label">Serviceability</InputLabel>
                  <Select
                    labelId="pincode-serviceable-filter-label"
                    value={serviceableFilter}
                    label="Serviceability"
                    onChange={(e) => {
                      setServiceableFilter(e.target.value);
                      setPincodePage(0);
                    }}
                  >
                    <MenuItem value="ALL">All Statuses</MenuItem>
                    <MenuItem value="Y">Serviceable Only</MenuItem>
                    <MenuItem value="N">Non-Serviceable</MenuItem>
                  </Select>
                </FormControl>
              </>
            }
            actions={
              canManage && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setPincodeToEdit(null);
                    setPincodeFormOpen(true);
                  }}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Register Pincode
                </Button>
              )
            }
          />

          {pincodesLoading && <TableSkeleton rows={8} />}

          {pincodesIsError && (
            <ErrorDisplay
              title="Failed to Load Pincodes"
              message={pincodesError instanceof Error ? pincodesError.message : 'Unknown communication error.'}
              onRetry={() => refetchPincodes()}
            />
          )}

          {!pincodesLoading && !pincodesIsError && (
            <EnterpriseTable
              columns={pincodeColumns}
              data={pincodesData?.items || []}
              keyExtractor={(row) => row.pincodeId}
              page={pincodePage}
              rowsPerPage={pincodeLimit}
              totalRecords={pincodesData?.total || 0}
              onPageChange={(p) => setPincodePage(p)}
              onRowsPerPageChange={(l) => {
                setPincodeLimit(l);
                setPincodePage(0);
              }}
              emptyState={
                <EmptyState
                  title="No Pincodes Found"
                  description="Adjust your search criteria or register a new postal code."
                />
              }
            />
          )}
        </Box>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 1: CITIES MASTER */}
      {/* ==================================================================== */}
      {subTab === 1 && (
        <Box>
          <FilterToolbar
            searchPlaceholder="Search city name..."
            searchValue={citySearch}
            onSearchChange={(val) => {
              setCitySearch(val);
              setCityPage(0);
            }}
            filters={
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="city-state-filter-label">State</InputLabel>
                <Select
                  labelId="city-state-filter-label"
                  value={cityStateFilter}
                  label="State"
                  onChange={(e) => {
                    setCityStateFilter(e.target.value);
                    setCityPage(0);
                  }}
                >
                  <MenuItem value="ALL">All States</MenuItem>
                  {allActiveStates.map((s) => (
                    <MenuItem key={s.stateId} value={s.stateId}>
                      {s.stateName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            }
            actions={
              canManage && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setCityToEdit(null);
                    setCityFormOpen(true);
                  }}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Add City
                </Button>
              )
            }
          />

          {citiesLoading && <TableSkeleton rows={8} />}

          {citiesIsError && (
            <ErrorDisplay
              title="Failed to Load Cities"
              message={citiesError instanceof Error ? citiesError.message : 'Unknown communication error.'}
              onRetry={() => refetchCities()}
            />
          )}

          {!citiesLoading && !citiesIsError && (
            <EnterpriseTable
              columns={cityColumns}
              data={citiesData?.items || []}
              keyExtractor={(row) => row.cityId}
              page={cityPage}
              rowsPerPage={cityLimit}
              totalRecords={citiesData?.total || 0}
              onPageChange={(p) => setCityPage(p)}
              onRowsPerPageChange={(l) => {
                setCityLimit(l);
                setCityPage(0);
              }}
              emptyState={
                <EmptyState
                  title="No Cities Found"
                  description="Adjust your filters or add a new city under a parent state."
                />
              }
            />
          )}
        </Box>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: STATES MASTER */}
      {/* ==================================================================== */}
      {subTab === 2 && (
        <Box>
          <FilterToolbar
            searchPlaceholder="Search state code or name..."
            searchValue={stateSearch}
            onSearchChange={(val) => {
              setStateSearch(val);
              setStatePage(0);
            }}
            filters={
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="state-zone-filter-label">Zone</InputLabel>
                <Select
                  labelId="state-zone-filter-label"
                  value={zoneFilter}
                  label="Zone"
                  onChange={(e) => {
                    setZoneFilter(e.target.value);
                    setStatePage(0);
                  }}
                >
                  <MenuItem value="ALL">All Zones</MenuItem>
                  <MenuItem value="NORTH">North Zone</MenuItem>
                  <MenuItem value="SOUTH">South Zone</MenuItem>
                  <MenuItem value="EAST">East Zone</MenuItem>
                  <MenuItem value="WEST">West Zone</MenuItem>
                  <MenuItem value="CENTRAL">Central Zone</MenuItem>
                  <MenuItem value="NORTH_EAST">North East Zone</MenuItem>
                </Select>
              </FormControl>
            }
            actions={
              canManage && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setStateToEdit(null);
                    setStateFormOpen(true);
                  }}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Add State
                </Button>
              )
            }
          />

          {statesLoading && <TableSkeleton rows={8} />}

          {statesIsError && (
            <ErrorDisplay
              title="Failed to Load States"
              message={statesError instanceof Error ? statesError.message : 'Unknown communication error.'}
              onRetry={() => refetchStates()}
            />
          )}

          {!statesLoading && !statesIsError && (
            <EnterpriseTable
              columns={stateColumns}
              data={statesData?.items || []}
              keyExtractor={(row) => row.stateId}
              page={statePage}
              rowsPerPage={stateLimit}
              totalRecords={statesData?.total || 0}
              onPageChange={(p) => setStatePage(p)}
              onRowsPerPageChange={(l) => {
                setStateLimit(l);
                setStatePage(0);
              }}
              emptyState={
                <EmptyState
                  title="No States Found"
                  description="Adjust your search criteria or create a new state."
                />
              }
            />
          )}
        </Box>
      )}

      {/* ==================================================================== */}
      {/* DIALOGS & CONFIRMATIONS */}
      {/* ==================================================================== */}

      {/* State Dialog & Confirmation */}
      <StateFormDialog
        open={stateFormOpen}
        stateToEdit={stateToEdit}
        onClose={() => setStateFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      <ConfirmationDialog
        open={stateConfirmOpen}
        title={stateToToggle?.isActive === 'Y' ? 'Deactivate State' : 'Activate State'}
        message={
          stateToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate state "${stateToToggle?.stateName}"? Deactivation will be rejected if active cities or serviceable pincodes are linked to it.`
            : `Are you sure you want to reactivate state "${stateToToggle?.stateName}"?`
        }
        confirmLabel={stateToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={stateToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmStateToggle}
        onCancel={() => {
          setStateConfirmOpen(false);
          setStateToToggle(null);
        }}
      />

      {/* City Dialog & Confirmation */}
      <CityFormDialog
        open={cityFormOpen}
        cityToEdit={cityToEdit}
        onClose={() => setCityFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      <ConfirmationDialog
        open={cityConfirmOpen}
        title={cityToToggle?.isActive === 'Y' ? 'Deactivate City' : 'Activate City'}
        message={
          cityToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate city "${cityToToggle?.cityName}"? Deactivation will be rejected if active serviceable pincodes are linked to it.`
            : `Are you sure you want to reactivate city "${cityToToggle?.cityName}"?`
        }
        confirmLabel={cityToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={cityToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmCityToggle}
        onCancel={() => {
          setCityConfirmOpen(false);
          setCityToToggle(null);
        }}
      />

      {/* Pincode Dialog & Confirmation */}
      <PincodeFormDialog
        open={pincodeFormOpen}
        pincodeToEdit={pincodeToEdit}
        onClose={() => setPincodeFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      <ConfirmationDialog
        open={pincodeConfirmOpen}
        title={
          pincodeToToggle?.isServiceable === 'Y'
            ? 'Mark Pincode as Non-Serviceable'
            : 'Mark Pincode as Serviceable'
        }
        message={
          pincodeToToggle?.isServiceable === 'Y'
            ? `Are you sure you want to mark pincode "${pincodeToToggle?.pincode}" (${pincodeToToggle?.cityName}) as non-serviceable? Technicians will not be dispatchable to this area.`
            : `Are you sure you want to restore serviceability for pincode "${pincodeToToggle?.pincode}"? Call center intake will immediately accept on-site booking for this postal area.`
        }
        confirmLabel={pincodeToToggle?.isServiceable === 'Y' ? 'Mark Non-Serviceable' : 'Mark Serviceable'}
        isDestructive={pincodeToToggle?.isServiceable === 'Y'}
        onConfirm={handleConfirmPincodeToggle}
        onCancel={() => {
          setPincodeConfirmOpen(false);
          setPincodeToToggle(null);
        }}
      />
    </Box>
  );
}
