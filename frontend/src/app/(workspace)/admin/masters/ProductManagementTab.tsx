'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
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
  Product,
  useProductCategories,
  useProducts,
  useToggleProductStatus,
} from '../../../../lib/catalogApi';
import { useAuth } from '../../../../providers/AuthProvider';
import { ProductFormDialog } from './dialogs/ProductFormDialog';

interface ProductManagementTabProps {
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export function ProductManagementTab({ onNotify }: ProductManagementTabProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masters:manage');

  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Y' | 'N'>('ALL');

  // Dialog states
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [productToToggle, setProductToToggle] = useState<Product | null>(null);

  const toggleProductStatus = useToggleProductStatus();
  const { data: categories = [] } = useProductCategories();

  const { data, isLoading, isError, error, refetch } = useProducts({
    page: page + 1,
    limit: rowsPerPage,
    search: search.trim() || undefined,
    categoryFamily: categoryFilter === 'ALL' ? undefined : categoryFilter,
    isActive: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const handleOpenCreate = () => {
    setProductToEdit(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setProductToEdit(product);
    setFormOpen(true);
  };

  const handleOpenToggle = (product: Product) => {
    setProductToToggle(product);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!productToToggle) return;
    try {
      const nextStatus = productToToggle.isActive === 'Y' ? 'N' : 'Y';
      await toggleProductStatus.mutateAsync({
        id: productToToggle.productId,
        payload: {
          isActive: nextStatus,
          versionNo: productToToggle.versionNo,
        },
      });
      onNotify(
        `Product "${productToToggle.productName}" ${
          nextStatus === 'Y' ? 'activated' : 'deactivated'
        } successfully.`,
        'success'
      );
      setConfirmOpen(false);
      setProductToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update product status', 'error');
    }
  };

  const columns = [
    {
      id: 'productCode',
      label: 'Product Code',
      width: 140,
      render: (row: Product) => (
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
            display: 'inline-block',
            backgroundColor: (th) =>
              th.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(99, 102, 241, 0.15)',
          }}
        >
          {row.productCode}
        </Typography>
      ),
    },
    {
      id: 'productName',
      label: 'Product Line / Name',
      render: (row: Product) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.productName}
        </Typography>
      ),
    },
    {
      id: 'categoryFamily',
      label: 'Category Family',
      width: 200,
      render: (row: Product) => (
        <Chip
          size="small"
          label={row.categoryFamily}
          sx={{
            fontWeight: 500,
            fontSize: '0.75rem',
            backgroundColor: (th) =>
              th.palette.mode === 'light' ? 'rgba(2, 132, 199, 0.08)' : 'rgba(56, 189, 248, 0.15)',
            color: 'info.main',
            border: '1px solid rgba(2, 132, 199, 0.2)',
          }}
        />
      ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 130,
      render: (row: Product) => (
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
      render: (row: Product) => (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          v{row.versionNo}
        </Typography>
      ),
    },
    {
      id: 'updatedAt',
      label: 'Last Modified',
      width: 180,
      render: (row: Product) => (
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
      render: (row: Product) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit Product' : 'Permission Required (masters:manage)'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleOpenEdit(row)}
                disabled={!canManage}
                aria-label="Edit Product"
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
                ? 'Deactivate Product'
                : 'Activate Product'
            }
          >
            <span>
              <IconButton
                size="small"
                color={row.isActive === 'Y' ? 'error' : 'success'}
                onClick={() => handleOpenToggle(row)}
                disabled={!canManage}
                aria-label={row.isActive === 'Y' ? 'Deactivate Product' : 'Activate Product'}
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
        searchPlaceholder="Search products by code or name (e.g. AC, Inverter)..."
        filters={
          <>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="product-category-filter-label">Category Family</InputLabel>
              <Select
                labelId="product-category-filter-label"
                value={categoryFilter}
                label="Category Family"
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="ALL">All Categories</MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="product-status-filter-label">Status</InputLabel>
              <Select
                labelId="product-status-filter-label"
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
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
            >
              Register Product
            </Button>
          )
        }
      />

      {isLoading && <TableSkeleton rows={6} />}

      {isError && (
        <ErrorDisplay
          title="Failed to Load Products"
          message={error instanceof Error ? error.message : 'Unknown communication error occurred.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <EnterpriseTable
          columns={columns}
          data={data?.items || []}
          keyExtractor={(row) => row.productId}
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
              title="No Products Found"
              description={
                search || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No products matched your search and filter criteria.'
                  : 'No product masters have been registered yet.'
              }
              action={
                canManage ? (
                  <Button variant="outlined" size="small" onClick={handleOpenCreate}>
                    Create First Product
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {/* Product Form Dialog */}
      <ProductFormDialog
        open={formOpen}
        productToEdit={productToEdit}
        onClose={() => setFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Confirmation Dialog for status toggle */}
      <ConfirmationDialog
        open={confirmOpen}
        title={productToToggle?.isActive === 'Y' ? 'Deactivate Product?' : 'Activate Product?'}
        message={
          productToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate product "${productToToggle?.productName}" (${productToToggle?.productCode})? Deactivating will prevent new Models and Call Registrations for this product.`
            : `Are you sure you want to activate product "${productToToggle?.productName}" (${productToToggle?.productCode})?`
        }
        confirmLabel={productToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={productToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmToggle}
        onCancel={() => {
          setConfirmOpen(false);
          setProductToToggle(null);
        }}
      />
    </Box>
  );
}
