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
import { Hsn, useHsnList, useToggleHsnStatus } from '../../../../lib/catalogApi';
import { useAuth } from '../../../../providers/AuthProvider';
import { HsnFormDialog } from './dialogs/HsnFormDialog';

interface HsnManagementTabProps {
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export function HsnManagementTab({ onNotify }: HsnManagementTabProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('masters:manage');

  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Y' | 'N'>('ALL');

  // Dialog states
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [hsnToEdit, setHsnToEdit] = useState<Hsn | null>(null);

  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [hsnToToggle, setHsnToToggle] = useState<Hsn | null>(null);

  const toggleHsnStatus = useToggleHsnStatus();

  const { data, isLoading, isError, error, refetch } = useHsnList({
    page: page + 1,
    limit: rowsPerPage,
    search: search.trim() || undefined,
    isActive: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const handleOpenCreate = () => {
    setHsnToEdit(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (hsn: Hsn) => {
    setHsnToEdit(hsn);
    setFormOpen(true);
  };

  const handleOpenToggle = (hsn: Hsn) => {
    setHsnToToggle(hsn);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!hsnToToggle) return;
    try {
      const nextStatus = hsnToToggle.isActive === 'Y' ? 'N' : 'Y';
      await toggleHsnStatus.mutateAsync({
        id: hsnToToggle.hsnId,
        payload: {
          isActive: nextStatus,
          versionNo: hsnToToggle.versionNo,
        },
      });
      onNotify(
        `HSN "${hsnToToggle.hsnCode}" ${
          nextStatus === 'Y' ? 'activated' : 'deactivated'
        } successfully.`,
        'success'
      );
      setConfirmOpen(false);
      setHsnToToggle(null);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update HSN status', 'error');
    }
  };

  const columns = [
    {
      id: 'hsnCode',
      label: 'HSN Code',
      width: 130,
      render: (row: Hsn) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
          {row.hsnCode}
        </Typography>
      ),
    },
    {
      id: 'chapterNo',
      label: 'Chapter',
      width: 90,
      render: (row: Hsn) => (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          {row.chapterNo || '—'}
        </Typography>
      ),
    },
    {
      id: 'hsnDescription',
      label: 'Description',
      render: (row: Hsn) => (
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {row.hsnDescription}
        </Typography>
      ),
    },
    {
      id: 'cgstRate',
      label: 'CGST',
      width: 90,
      render: (row: Hsn) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {row.cgstRate}%
        </Typography>
      ),
    },
    {
      id: 'sgstRate',
      label: 'SGST',
      width: 90,
      render: (row: Hsn) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {row.sgstRate}%
        </Typography>
      ),
    },
    {
      id: 'igstRate',
      label: 'IGST',
      width: 90,
      render: (row: Hsn) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
          {row.igstRate}%
        </Typography>
      ),
    },
    {
      id: 'isActive',
      label: 'Status',
      width: 110,
      render: (row: Hsn) => (
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
      render: (row: Hsn) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title={canManage ? 'Edit HSN Details' : 'View only'}>
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

          <Tooltip title={row.isActive === 'Y' ? 'Deactivate HSN' : 'Activate HSN'}>
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
        searchPlaceholder="Search HSN code or description..."
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(0);
        }}
        filters={
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="hsn-status-filter-label">Status</InputLabel>
            <Select
              labelId="hsn-status-filter-label"
              value={statusFilter}
              label="Status"
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
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
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Register HSN
            </Button>
          )
        }
      />

      {isLoading && <TableSkeleton rows={6} />}

      {isError && (
        <ErrorDisplay
          title="Failed to Load HSN Records"
          message={error instanceof Error ? error.message : 'Unknown communication error occurred.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <EnterpriseTable
          columns={columns}
          data={data?.items || []}
          keyExtractor={(row) => row.hsnId}
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
              title="No HSN Records Found"
              description="Adjust your search filters or click 'Register HSN' to create a new tax code."
            />
          }
        />
      )}

      {/* Form Dialog */}
      <HsnFormDialog
        open={formOpen}
        hsnToEdit={hsnToEdit}
        onClose={() => setFormOpen(false)}
        onSuccess={(msg) => onNotify(msg, 'success')}
      />

      {/* Toggle Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmOpen}
        title={hsnToToggle?.isActive === 'Y' ? 'Deactivate HSN Code' : 'Activate HSN Code'}
        message={
          hsnToToggle?.isActive === 'Y'
            ? `Are you sure you want to deactivate HSN "${hsnToToggle?.hsnCode}"? Spare parts already referencing this HSN will retain it, but new parts cannot be assigned this tax classification.`
            : `Are you sure you want to reactivate HSN "${hsnToToggle?.hsnCode}"? It will become immediately available for part code assignments.`
        }
        confirmLabel={hsnToToggle?.isActive === 'Y' ? 'Deactivate' : 'Activate'}
        isDestructive={hsnToToggle?.isActive === 'Y'}
        onConfirm={handleConfirmToggle}
        onCancel={() => {
          setConfirmOpen(false);
          setHsnToToggle(null);
        }}
      />
    </Box>
  );
}
