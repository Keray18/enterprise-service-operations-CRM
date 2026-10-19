import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <Box sx={{ width: '100%', p: 1 }}>
      <Skeleton variant="rectangular" height={36} sx={{ mb: 1, borderRadius: 1 }} />
      {Array.from({ length: rows }).map((_, r) => (
        <Box key={r} sx={{ display: 'flex', gap: 2, my: 1.5 }}>
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} variant="text" width={`${100 / columns}%`} height={24} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function CardSkeleton() {
  return (
    <Box sx={{ p: 2.5, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
      <Skeleton variant="text" width="40%" height={28} sx={{ mb: 1.5 }} />
      <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1, mb: 1.5 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton variant="text" width="25%" height={20} />
        <Skeleton variant="text" width="25%" height={20} />
      </Box>
    </Box>
  );
}
