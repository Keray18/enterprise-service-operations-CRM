'use client';

import HomeIcon from '@mui/icons-material/Home';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

interface BreadcrumbBarProps {
  actions?: React.ReactNode;
}

export function BreadcrumbBar({ actions }: BreadcrumbBarProps) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1.25,
        px: { xs: 2, sm: 3 },
        borderBottom: (th) => `1px solid ${th.palette.divider}`,
        backgroundColor: (th) =>
          th.palette.mode === 'light' ? 'rgba(248, 250, 252, 0.8)' : 'rgba(15, 23, 42, 0.5)',
      }}
    >
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />}
        aria-label="breadcrumb"
        sx={{ fontSize: '0.8125rem' }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <HomeIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
          <span>Home</span>
        </Link>

        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const href = `/${segments.slice(0, index + 1).join('/')}`;
          const formatted = segment
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

          return isLast ? (
            <Typography key={href} color="text.primary" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {formatted}
            </Typography>
          ) : (
            <Link key={href} href={href} style={{ color: 'inherit', textDecoration: 'none' }}>
              {formatted}
            </Link>
          );
        })}
      </Breadcrumbs>

      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{actions}</Box>}
    </Box>
  );
}
