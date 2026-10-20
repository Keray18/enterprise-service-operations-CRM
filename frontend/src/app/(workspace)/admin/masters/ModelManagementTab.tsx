'use client';

import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
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
  Model,
  useBrands,
  useModels,
  useProducts,
  useToggleModelStatus,
} from '../../../../lib/catalogApi';
import { useAuth } from '../../../../providers/AuthProvider';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { BulkImportDialog } from './dialogs/BulkImportDialog';
import { ModelFormDialog } from './dialogs/ModelFormDialog';

interface ModelManagementTabProps {
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export function ModelManagementTab({ onNotify }: ModelManagementTabProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masters:manage');

  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [search, setSearch] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Y' | 'N'>('ALL');

  // Dialog states
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [modelToEdit, setModelToEdit] = useState<Model | null>(null);

  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [modelToToggle, setModelToToggle] = useState<Model | null>(null);

  const toggleModelStatus = useToggleModelStatus();

  // Load brands and products for filter dropdowns
  const { data: brandsData } = useBrands({ limit: 100 });
  const { data: productsData } = useProducts({ limit: 100 });

  const brands = brandsData?.items || [];
  const products = productsData?.items || [];

  const { data, isLoading, isError, error, refetch } = useModels({
    page: page + 1,
    limit: rowsPerPage,
    search: search.trim() || undefined,
    brandId: brandFilter === 'ALL' ? undefined : brandFilter,
    productId: productFilter === 'ALL' ? undefined : productFilter,
    isActive: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const handleOpenCreate = () => {
    setModelToEdit(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (model: Model) => {
    setModelToEdit(model);
    setFormOpen(true);
  };

  const handleOpenToggle = (model: Model) => {
    setModelToToggle(model);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!modelToToggle) return;
    try {
      const nextStatus = modelToToggle.isActive === 'Y' ? 'N' : 'Y';
      await toggleModelStatus.mutateAsync({
        id: modelToToggle.modelId,
        payload: {
          isActive: nextStatus,
          versionNo: modelToToggle.versionNo,
        },
      });
      onNotify(
        `Model "${modelToToggle.modelName}" ${
          nextStatus === 'Y' ? 'activated' : 'deactivated'
        } successfully.`,
        'success'
      );
      setConfirmOpen(false);
      setModelToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update model status', 'error');
    }
  };

  const columns = [
    {
      id: 'modelCode',
      label: 'Model Identification',
      width: 240,
      render: (row: Model) => (
        <Box>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '0.825rem',
              color: 'primary.main',
              px: 0.75,
              py: 0.2,
              borderRadius: 1,
              display: 'inline-block',
              backgroundColor: (th) =>
                th.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(99, 102, 241, 0.15)',
              mb: 0.5,
            }}
          >
            {row.modelCode}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.modelName}
          </Typography>
          {row.technicalName && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Tech: {row.technicalName}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'brandAndProduct',
      label: 'Brand & Product',
      width: 180,
      render: (row: Model) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {row.brandName || row.brandCode || '—'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {row.productName || row.productCode || '—'}
          </Typography>
          {row.categoryFamily && (
            <Chip
              size="small"
              label={row.categoryFamily}
              sx={{ height: 20, fontSize: '0.65rem', mt: 0.5 }}
            />
          )}
        </Box>
      ),
    },
    {
      id: 'eligibility',
      label: 'Service Eligibility',
      width: 170,
      render: (row: Model) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {row.isJobCreationAllowed === 'Y' ? (
              <CheckCircleOutlineIcon sx={{ fontSize: '0.9rem', color: 'success.main' }} />
            ) : (
              <HighlightOffIcon sx={{ fontSize: '0.9rem', color: 'error.main' }} />
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Job Creation
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {row.isRepairable === 'Y' ? (
              <CheckCircleOutlineIcon sx={{ fontSize: '0.9rem', color: 'success.main' }} />
            ) : (
              <HighlightOffIcon sx={{ fontSize: '0.9rem', color: 'error.main' }} />
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Field Repair
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {row.isDoaAllowed === 'Y' ? (
              <CheckCircleOutlineIcon sx={{ fontSize: '0.9rem', color: 'success.main' }} />
            ) : (
              <HighlightOffIcon sx={{ fontSize: '0.9rem', color: 'error.main' }} />
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              DOA Claim
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      id: 'warranty',
      label: 'Warranty & SLA',
      width: 160,
      render: (row: Model) => (
        <Box>
          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
            Std: {row.customerWarrantyDays}d
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            Repair: {row.repairWarrantyDays}d | DOA: {row.doaDays}d
          </Typography>
          {row.standardServiceCharge > 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Fee: ₹{row.standardServiceCharge}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 110,
      render: (row: Model) => (
        <StatusBadge
          status={row.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}
          label={row.isActive === 'Y' ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      id: 'versionNo',
      label: 'Version',
      width: 70,
      render: (row: Model) => (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          v{row.versionNo}
        </Typography>
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: 110,
      align: 'right' as const,
      render: (row: Model) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit Model' : 'Permission Required (masters:manage)'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleOpenEdit(row)}
                disabled={!canManage}
                aria-label="Edit Model"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip
            title={
              !canManage
                ? 'Permission Required (masters:manage)'
                : row.isActive === 'Y'
                ? 'Deactivate Model'
                : 'Activate Model'
            }
          >
            <span>
              <IconButton
                size="small"
                color={row.isActive === 'Y' ? 'error' : 'success'}
                onClick={() => handleOpenToggle(row)}
                disabled={!canManage}
                aria-label={row.isActive === 'Y' ? 'Deactivate Model' : 'Activate Model'}
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
      <FilterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(0);
        }}
        searchPlaceholder="Search models by code, name, or technical spec..."
        filters={
          <>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="model-brand-filter-label">Brand</InputLabel>
              <Select
                labelId="model-brand-filter-label"
                value={brandFilter}
                label="Brand"
                onChange={(e) => {
                  setBrandFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="ALL">All Brands</MenuItem>
                {brands.map((b) => (
                  <MenuItem key={b.brandId} value={b.brandId}>
                    {b.brandName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="model-product-filter-label">Product</InputLabel>
              <Select
                labelId="model-product-filter-label"
                value={productFilter}
                label="Product"
                onChange={(e) => {
                  setProductFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="ALL">All Products</MenuItem>
                {products.map((p) => (
                  <MenuItem key={p.productId} value={p.productId}>
                    {p.productName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="model-status-filter-label">Status</InputLabel>
              <Select
                labelId="model-status-filter-label"
                value={statusFilter}
                label="Status"
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'ALL' | 'Y' | 'N');
                  setPage(0);
                }}
              >
                <MenuItem value="ALL">All Statuses</MenuItem>
                <MenuItem value="Y">Active Only</MenuItem>
                <MenuItem value="N">Inactive Only</MenuItem>
              </Select>
            </FormControl>
          </>
        }
        actions={
          canManage && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {hasPermission('masters:import') && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FileUploadIcon />}
                  onClick={() => setImportOpen(true)}
                >
                  Import Models
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={handleOpenCreate}
              >
                Register Model
              </Button>
            </Box>
          )
        }
      />

      {isLoading && <TableSkeleton rows={6} />}

      {isError && (
        <ErrorDisplay
          title="Failed to Load Models"
          message={error instanceof Error ? error.message : 'Unknown communication error occurred.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <EnterpriseTable
          columns={columns}
          data={data?.items || []}
          keyExtractor={(row) => row.modelId}
          page={page}
          rowsPerPage={rowsPerPage}
          totalRecords={data?.total || 0}
          onPageChange={(newPage) => setPage(newPage)}
          onRowsPerPageChange={(newLimit) => {
            setRowsPerPage(newLimit);
            setPage(0);
          }}
          emptyState={
            <EmptyState
              title="No Models Found"
              description={
                search || brandFilter !== 'ALL' || productFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No models matched your search and filter criteria.'
                  : 'No model masters have been registered yet.'
              }
              action={
                canManage ? (
                  <Button variant="outlined" size="small" onClick={handleOpenCreate}>
                    Create First Model
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {/* Model Form Dialog */}
      <ModelFormDialog
        open={formOpen}
        modelToEdit={modelToEdit}
        onClose={() => setFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Bulk Excel Import Dialog */}
      <BulkImportDialog
        open={importOpen}
        entityType="MODEL"
        onClose={() => setImportOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Confirmation Dialog for status toggle */}
      <ConfirmationDialog
        open={confirmOpen}
        title={modelToToggle?.isActive === 'Y' ? 'Deactivate Model?' : 'Activate Model?'}
        message={
          modelToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate model "${modelToToggle?.modelName}" (${modelToToggle?.modelCode})? Job registration will be barred for this model.`
            : `Are you sure you want to activate model "${modelToToggle?.modelName}" (${modelToToggle?.modelCode})?`
        }
        confirmLabel={modelToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={modelToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmToggle}
        onCancel={() => {
          setConfirmOpen(false);
          setModelToToggle(null);
        }}
      />
    </Box>
  );
}
