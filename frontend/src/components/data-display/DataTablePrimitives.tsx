import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import React from 'react';

interface Column<T> {
  id: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
  render?: (row: T) => React.ReactNode;
}

interface EnterpriseTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  page?: number;
  rowsPerPage?: number;
  totalRecords?: number;
  onPageChange?: (newPage: number) => void;
  onRowsPerPageChange?: (newRowsPerPage: number) => void;
  emptyState?: React.ReactNode;
}

export function EnterpriseTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  page = 0,
  rowsPerPage = 10,
  totalRecords = data.length,
  onPageChange,
  onRowsPerPageChange,
  emptyState,
}: EnterpriseTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <Box>{emptyState}</Box>;
  }

  return (
    <Box
      sx={{
        width: '100%',
        overflow: 'hidden',
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        backgroundColor: 'background.paper',
      }}
    >
      <TableContainer sx={{ maxHeight: 560 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align || 'left'}
                  style={{ width: col.width }}
                  sx={{ py: 1.25 }}
                >
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={keyExtractor(row)} hover>
                {columns.map((col) => (
                  <TableCell key={col.id} align={col.align || 'left'} sx={{ py: 1 }}>
                    {col.render ? col.render(row) : row[col.id]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {onPageChange && (
        <TablePagination
          rowsPerPageOptions={[10, 25, 50]}
          component="div"
          count={totalRecords}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_e, newPage) => onPageChange(newPage)}
          onRowsPerPageChange={(e) => onRowsPerPageChange?.(parseInt(e.target.value, 10))}
          sx={{ borderTop: (theme) => `1px solid ${theme.palette.divider}` }}
        />
      )}
    </Box>
  );
}
