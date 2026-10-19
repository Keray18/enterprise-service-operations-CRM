import InboxIcon from '@mui/icons-material/Inbox';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon = <InboxIcon sx={{ fontSize: '3rem', color: 'text.secondary', opacity: 0.5 }} />,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        py: 6,
        px: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        borderRadius: 2,
        border: (theme) => `1px dashed ${theme.palette.divider}`,
        backgroundColor: (theme) =>
          theme.palette.mode === 'light' ? 'rgba(248, 250, 252, 0.5)' : 'rgba(15, 23, 42, 0.3)',
      }}
    >
      <Box sx={{ mb: 1.5 }}>{icon}</Box>
      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600, mb: 0.75 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420, mb: 2.5 }}>
        {description}
      </Typography>
      {action && <Box>{action}</Box>}
    </Box>
  );
}
