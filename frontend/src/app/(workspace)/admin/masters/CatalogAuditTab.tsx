'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
import { ErrorDisplay } from '../../../../components/feedback/ErrorDisplay';
import { TableSkeleton } from '../../../../components/feedback/LoadingSkeleton';
import { CatalogAudit, useCatalogAudit } from '../../../../lib/catalogApi';

export function CatalogAuditTab() {
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [selectedAudit, setSelectedAudit] = useState<CatalogAudit | null>(null);

  const { data, isLoading, isError, error, refetch } = useCatalogAudit({
    page: page + 1,
    limit: rowsPerPage,
    entityName: entityFilter === 'ALL' ? undefined : entityFilter,
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <Chip size="small" label="CREATE" color="primary" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
      case 'UPDATE':
        return <Chip size="small" label="UPDATE" color="info" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
      case 'ACTIVATE':
        return <Chip size="small" label="ACTIVATE" color="success" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
      case 'DEACTIVATE':
        return <Chip size="small" label="DEACTIVATE" color="warning" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
      default:
        return <Chip size="small" label={action} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
    }
  };

  const columns = [
    {
      id: 'createdAt',
      label: 'Timestamp',
      width: 180,
      render: (row: CatalogAudit) => (
        <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
        </Typography>
      ),
    },
    {
      id: 'entityName',
      label: 'Catalog Master',
      width: 140,
      render: (row: CatalogAudit) => (
        <Chip
          size="small"
          label={row.entityName}
          sx={{
            fontWeight: 700,
            fontSize: '0.7rem',
            backgroundColor: (th) =>
              th.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.08)' : 'rgba(99, 102, 241, 0.15)',
            color: 'primary.main',
          }}
        />
      ),
    },
    {
      id: 'action',
      label: 'Action Performed',
      width: 140,
      render: (row: CatalogAudit) => getActionBadge(row.action),
    },
    {
      id: 'entityId',
      label: 'Entity ID',
      width: 220,
      render: (row: CatalogAudit) => (
        <Typography
          variant="body2"
          sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}
        >
          {row.entityId}
        </Typography>
      ),
    },
    {
      id: 'performedByUsername',
      label: 'Actor / User',
      width: 160,
      render: (row: CatalogAudit) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.825rem' }}>
          {row.performedByUsername || row.performedBy}
        </Typography>
      ),
    },
    {
      id: 'details',
      label: 'Change Payload',
      render: (row: CatalogAudit) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: 'text.secondary',
              maxWidth: 320,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.changesJson || '(none)'}
          </Typography>
          {row.changesJson && (
            <Tooltip title="View Full Payload">
              <IconButton size="small" onClick={() => setSelectedAudit(row)}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <FilterToolbar
        searchPlaceholder=""
        filters={
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="audit-entity-filter-label">Filter Master Type</InputLabel>
            <Select
              labelId="audit-entity-filter-label"
              value={entityFilter}
              label="Filter Master Type"
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="ALL">All Catalog Entities</MenuItem>
              <MenuItem value="BRAND">Brand Master</MenuItem>
              <MenuItem value="PRODUCT">Product Master</MenuItem>
              <MenuItem value="MODEL">Model Master</MenuItem>
            </Select>
          </FormControl>
        }
      />

      {isLoading && <TableSkeleton rows={6} />}

      {isError && (
        <ErrorDisplay
          title="Failed to Load Catalog Audit Logs"
          message={error instanceof Error ? error.message : 'Unknown communication error occurred.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && (
        <EnterpriseTable
          columns={columns}
          data={data?.items || []}
          keyExtractor={(row) => row.auditId}
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
              title="No Audit Records"
              description="No catalog changes have been recorded yet."
            />
          }
        />
      )}

      {/* Payload Modal */}
      <Dialog
        open={!!selectedAudit}
        onClose={() => setSelectedAudit(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Audit Payload: {selectedAudit?.entityName} ({selectedAudit?.action})
        </DialogTitle>
        <DialogContent dividers>
          <Box
            component="pre"
            sx={{
              p: 2,
              m: 0,
              borderRadius: 1,
              backgroundColor: (th) =>
                th.palette.mode === 'light' ? '#f8fafc' : '#0f172a',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              overflowX: 'auto',
              maxHeight: 400,
            }}
          >
            {(() => {
              try {
                return JSON.stringify(JSON.parse(selectedAudit?.changesJson || '{}'), null, 2);
              } catch {
                return selectedAudit?.changesJson || 'None';
              }
            })()}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setSelectedAudit(null)} size="small">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
