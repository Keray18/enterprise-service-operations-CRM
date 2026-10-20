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
  Part,
  useBrands,
  useParts,
  useProducts,
  useTogglePartStatus,
} from '../../../../lib/catalogApi';
import { useAuth } from '../../../../providers/AuthProvider';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { BulkImportDialog } from './dialogs/BulkImportDialog';
import { PartFormDialog } from './dialogs/PartFormDialog';

interface PartManagementTabProps {
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export function PartManagementTab({ onNotify }: PartManagementTabProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masters:manage');

  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [search, setSearch] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Y' | 'N'>('ALL');

  // Dialog states
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [partToEdit, setPartToEdit] = useState<Part | null>(null);

  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [partToToggle, setPartToToggle] = useState<Part | null>(null);

  const togglePartStatus = useTogglePartStatus();

  // Fetch filter options
  const { data: brandsData } = useBrands({ limit: 100, isActive: 'Y' });
  const { data: productsData } = useProducts({ limit: 100, isActive: 'Y' });

  const brands = brandsData?.items || [];
  const products = productsData?.items || [];

  const { data, isLoading, isError, error, refetch } = useParts({
    page: page + 1,
    limit: rowsPerPage,
    search: search.trim() || undefined,
    brandId: brandFilter === 'ALL' ? undefined : brandFilter,
    productId: productFilter === 'ALL' ? undefined : productFilter,
    category: categoryFilter === 'ALL' ? undefined : categoryFilter,
    isActive: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const handleOpenCreate = () => {
    setPartToEdit(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (part: Part) => {
    setPartToEdit(part);
    setFormOpen(true);
  };

  const handleOpenToggle = (part: Part) => {
    setPartToToggle(part);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!partToToggle) return;
    try {
      const nextStatus = partToToggle.isActive === 'Y' ? 'N' : 'Y';
      await togglePartStatus.mutateAsync({
        id: partToToggle.partId,
        payload: {
          isActive: nextStatus,
          versionNo: partToToggle.versionNo,
        },
      });
      onNotify(
        `Part "${partToToggle.partCode}" ${
          nextStatus === 'Y' ? 'activated' : 'deactivated'
        } successfully.`,
        'success'
      );
      setConfirmOpen(false);
      setPartToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update part status', 'error');
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'SPARE':
        return 'primary';
      case 'CONSUMABLE':
        return 'secondary';
      case 'ACCESSORY':
        return 'info';
      default:
        return 'default';
    }
  };

  const columns = [
    {
      id: 'partCode',
      label: 'Part Code & Identifiers',
      width: 170,
      render: (row: Part) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
            {row.partCode}
          </Typography>
          {row.vendorPartCode && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              OEM: {row.vendorPartCode}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'partName',
      label: 'Part Name & Description',
      render: (row: Part) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {row.partName}
          </Typography>
          {row.partDescription && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
              {row.partDescription}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'brandProduct',
      label: 'Brand / Product',
      width: 160,
      render: (row: Part) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {row.brandName || row.brandCode}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {row.productName || row.productCode}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'category',
      label: 'Category',
      width: 120,
      render: (row: Part) => (
        <Chip
          label={row.partCategory}
          size="small"
          color={getCategoryColor(row.partCategory) as any}
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: '0.72rem' }}
        />
      ),
    },
    {
      id: 'hsn',
      label: 'HSN Code',
      width: 100,
      render: (row: Part) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
          {row.hsnCode || '—'}
        </Typography>
      ),
    },
    {
      id: 'prices',
      label: 'Commercials (MRP / LTP)',
      width: 170,
      render: (row: Part) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            ₹{Number(row.customerPrice).toFixed(2)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            LTP: ₹{Number(row.locationPrice).toFixed(2)}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'warrantyDays',
      label: 'Warranty',
      width: 100,
      render: (row: Part) => (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {row.warrantyDays} days
        </Typography>
      ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 100,
      render: (row: Part) => (
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
      render: (row: Part) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit Part Details' : 'View only'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleOpenEdit(row)}
                disabled={!canManage}
                color="primary"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={row.isActive === 'Y' ? 'Deactivate Part' : 'Activate Part'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleOpenToggle(row)}
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

  return (
    <Box>
      <FilterToolbar
        searchPlaceholder="Search part code, OEM vendor code, or name..."
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(0);
        }}
        filters={
          <>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="part-brand-filter-label">Brand</InputLabel>
              <Select
                labelId="part-brand-filter-label"
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

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="part-product-filter-label">Product</InputLabel>
              <Select
                labelId="part-product-filter-label"
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
              <InputLabel id="part-category-filter-label">Category</InputLabel>
              <Select
                labelId="part-category-filter-label"
                value={categoryFilter}
                label="Category"
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="ALL">All Categories</MenuItem>
                <MenuItem value="SPARE">Spare Parts</MenuItem>
                <MenuItem value="CONSUMABLE">Consumables</MenuItem>
                <MenuItem value="ACCESSORY">Accessories</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="part-status-filter-label">Status</InputLabel>
              <Select
                labelId="part-status-filter-label"
                value={statusFilter}
                label="Status"
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(0);
                }}
              >
                <MenuItem value="ALL">All</MenuItem>
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
                  startIcon={<FileUploadIcon />}
                  onClick={() => setImportOpen(true)}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Import Parts
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenCreate}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Add Part Code
              </Button>
            </Box>
          )
        }
      />

      {isLoading && <TableSkeleton rows={8} />}

      {isError && (
        <ErrorDisplay
          title="Failed to Load Part Codes"
          message={error instanceof Error ? error.message : 'Unknown communication error occurred.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <EnterpriseTable
          columns={columns}
          data={data?.items || []}
          keyExtractor={(row) => row.partId}
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
              title="No Part Codes Found"
              description="Adjust your search filters or click 'Add Part Code' to create a new component record."
            />
          }
        />
      )}

      {/* Form Dialog */}
      <PartFormDialog
        open={formOpen}
        partToEdit={partToEdit}
        onClose={() => setFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Bulk Excel Import Dialog */}
      <BulkImportDialog
        open={importOpen}
        entityType="PART"
        onClose={() => setImportOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Toggle Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmOpen}
        title={partToToggle?.isActive === 'Y' ? 'Deactivate Part Code' : 'Activate Part Code'}
        message={
          partToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate part "${partToToggle?.partCode}" (${partToToggle?.partName})? It will no longer be selectable on future service work orders.`
            : `Are you sure you want to reactivate part "${partToToggle?.partCode}"? It will become immediately billable and dispatchable.`
        }
        confirmLabel={partToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={partToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmToggle}
        onCancel={() => {
          setConfirmOpen(false);
          setPartToToggle(null);
        }}
      />
    </Box>
  );
}
