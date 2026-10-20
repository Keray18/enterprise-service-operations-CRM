'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { Brand, useBrands, useToggleBrandStatus } from '../../../../lib/catalogApi';
import { useAuth } from '../../../../providers/AuthProvider';
import { BrandFormDialog } from './dialogs/BrandFormDialog';

interface BrandManagementTabProps {
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export function BrandManagementTab({ onNotify }: BrandManagementTabProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masters:manage');

  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Y' | 'N'>('ALL');

  // Dialog states
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [brandToEdit, setBrandToEdit] = useState<Brand | null>(null);

  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [brandToToggle, setBrandToToggle] = useState<Brand | null>(null);

  const toggleBrandStatus = useToggleBrandStatus();

  const { data, isLoading, isError, error, refetch } = useBrands({
    page: page + 1,
    limit: rowsPerPage,
    search: search.trim() || undefined,
    isActive: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const handleOpenCreate = () => {
    setBrandToEdit(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setBrandToEdit(brand);
    setFormOpen(true);
  };

  const handleOpenToggle = (brand: Brand) => {
    setBrandToToggle(brand);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!brandToToggle) return;
    try {
      const nextStatus = brandToToggle.isActive === 'Y' ? 'N' : 'Y';
      await toggleBrandStatus.mutateAsync({
        id: brandToToggle.brandId,
        payload: {
          isActive: nextStatus,
          versionNo: brandToToggle.versionNo,
        },
      });
      onNotify(
        `Brand "${brandToToggle.brandName}" ${
          nextStatus === 'Y' ? 'activated' : 'deactivated'
        } successfully.`,
        'success'
      );
      setConfirmOpen(false);
      setBrandToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update brand status', 'error');
    }
  };

  const columns = [
    {
      id: 'brandCode',
      label: 'Brand Code',
      width: 140,
      render: (row: Brand) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'primary.main',
              px: 1,
              py: 0.25,
              borderRadius: 1,
              backgroundColor: (th) =>
                th.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(99, 102, 241, 0.15)',
            }}
          >
            {row.brandCode}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'brandName',
      label: 'Brand Name',
      render: (row: Brand) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {row.brandName}
          </Typography>
          {row.logoUrl && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {row.logoUrl}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 130,
      render: (row: Brand) => (
        <StatusBadge
          status={row.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}
          label={row.isActive === 'Y' ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      id: 'versionNo',
      label: 'Version',
      width: 90,
      render: (row: Brand) => (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          v{row.versionNo}
        </Typography>
      ),
    },
    {
      id: 'updatedAt',
      label: 'Last Modified',
      width: 180,
      render: (row: Brand) => (
        <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
        </Typography>
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: 120,
      align: 'right' as const,
      render: (row: Brand) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit Brand' : 'Permission Required (masters:manage)'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleOpenEdit(row)}
                disabled={!canManage}
                aria-label="Edit Brand"
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
                ? 'Deactivate Brand'
                : 'Activate Brand'
            }
          >
            <span>
              <IconButton
                size="small"
                color={row.isActive === 'Y' ? 'error' : 'success'}
                onClick={() => handleOpenToggle(row)}
                disabled={!canManage}
                aria-label={row.isActive === 'Y' ? 'Deactivate Brand' : 'Activate Brand'}
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
        searchPlaceholder="Search brands by name or code (e.g. SKC, Daenyx)..."
        filters={
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="brand-status-filter-label">Status</InputLabel>
            <Select
              labelId="brand-status-filter-label"
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
        }
        actions={
          canManage && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
            >
              Register Brand
            </Button>
          )
        }
      />

      {isLoading && <TableSkeleton rows={6} />}

      {isError && (
        <ErrorDisplay
          title="Failed to Load Brands"
          message={error instanceof Error ? error.message : 'Unknown communication error occurred.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <EnterpriseTable
          columns={columns}
          data={data?.items || []}
          keyExtractor={(row) => row.brandId}
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
              title="No Brands Found"
              description={
                search || statusFilter !== 'ALL'
                  ? 'No brands matched your search and filter criteria.'
                  : 'No brand masters have been registered yet.'
              }
              action={
                canManage ? (
                  <Button variant="outlined" size="small" onClick={handleOpenCreate}>
                    Create First Brand
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {/* Brand Form Dialog */}
      <BrandFormDialog
        open={formOpen}
        brandToEdit={brandToEdit}
        onClose={() => setFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Confirmation Dialog for status toggle */}
      <ConfirmationDialog
        open={confirmOpen}
        title={brandToToggle?.isActive === 'Y' ? 'Deactivate Brand?' : 'Activate Brand?'}
        message={
          brandToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate brand "${brandToToggle?.brandName}" (${brandToToggle?.brandCode})? Deactivating will prevent new Models and Call Registrations for this brand.`
            : `Are you sure you want to activate brand "${brandToToggle?.brandName}" (${brandToToggle?.brandCode})?`
        }
        confirmLabel={brandToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={brandToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmToggle}
        onCancel={() => {
          setConfirmOpen(false);
          setBrandToToggle(null);
        }}
      />
    </Box>
  );
}
