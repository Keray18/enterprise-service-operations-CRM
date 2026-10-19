import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import React from 'react';

interface ResponsiveCardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
}

export function ResponsiveCard({
  title,
  subtitle,
  action,
  children,
  footer,
  noPadding = false,
}: ResponsiveCardProps) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {(title || action) && (
        <Box
          sx={{
            px: 2.5,
            py: 1.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box>
            {title && (
              <Typography variant="h3" sx={{ fontSize: '0.975rem', fontWeight: 600 }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box>{action}</Box>}
        </Box>
      )}

      <Box sx={{ p: noPadding ? 0 : 2.5, flex: 1 }}>{children}</Box>

      {footer && (
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            backgroundColor: (theme) =>
              theme.palette.mode === 'light' ? 'rgba(241, 245, 249, 0.5)' : 'rgba(30, 41, 59, 0.4)',
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          {footer}
        </Box>
      )}
    </Card>
  );
}
