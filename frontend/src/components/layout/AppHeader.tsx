'use client';

import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SearchIcon from '@mui/icons-material/Search';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import React from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { useThemeMode } from '../../theme/ThemeRegistry';

interface AppHeaderProps {
  onToggleMobileSidebar: () => void;
  roleName?: string;
  userName?: string;
}

export function AppHeader({
  onToggleMobileSidebar,
  roleName,
  userName,
}: AppHeaderProps) {
  const theme = useTheme();
  const { toggleTheme } = useThemeMode();
  const { user, isAuthenticated, logout } = useAuth();

  const effectiveRole = roleName || (user?.roles[0] ? user.roles[0].replace(/_/g, ' ') : 'Guest');
  const effectiveName = userName || (user ? user.fullName : 'Guest User');

  return (
    <AppBar position="sticky" sx={{ zIndex: (th) => th.zIndex.drawer + 1 }}>
      <Toolbar sx={{ minHeight: '56px !important', px: { xs: 2, sm: 3 }, gap: 2 }}>
        {/* Mobile menu trigger */}
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onToggleMobileSidebar}
          sx={{ display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>

        {/* Application Brand Branding */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.9rem',
              letterSpacing: '-0.02em',
            }}
          >
            365
          </Box>
          <Typography
            variant="h2"
            sx={{
              fontSize: '1.05rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            AFTER-SALES SERVICE CRM
          </Typography>
        </Box>

        {/* Quick Search Entry point (Omnibox simulation) */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.5,
            borderRadius: 1.5,
            backgroundColor: (th) =>
              th.palette.mode === 'light' ? 'rgba(241, 245, 249, 0.8)' : 'rgba(30, 41, 59, 0.7)',
            border: (th) => `1px solid ${th.palette.divider}`,
            cursor: 'pointer',
            minWidth: 280,
            color: 'text.secondary',
            '&:hover': {
              borderColor: 'primary.main',
            },
          }}
        >
          <SearchIcon sx={{ fontSize: '1rem' }} />
          <Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
            Quick Search (Job #, Mobile, Serial)...
          </Typography>
          <Chip label="Ctrl+K" size="small" sx={{ height: 18, fontSize: '0.625rem', px: 0.5 }} />
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Role & User Badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isAuthenticated ? (
            <>
              <Chip
                size="small"
                label={effectiveRole}
                sx={{
                  backgroundColor: (th) =>
                    th.palette.mode === 'light' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.25)',
                  color: 'primary.main',
                  fontWeight: 600,
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              />

              {/* Theme switcher */}
              <Tooltip title={`Switch to ${theme.palette.mode === 'light' ? 'Dark' : 'Light'} Mode`}>
                <IconButton onClick={toggleTheme} size="small" color="inherit">
                  {theme.palette.mode === 'light' ? <Brightness4Icon fontSize="small" /> : <Brightness7Icon fontSize="small" />}
                </IconButton>
              </Tooltip>

              {/* User profile info */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  pl: 1,
                  borderLeft: (th) => `1px solid ${th.palette.divider}`,
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    backgroundColor: (th) => (th.palette.mode === 'light' ? '#e0e7ff' : '#312e81'),
                    color: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <PersonOutlineIcon sx={{ fontSize: '1.1rem' }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, display: { xs: 'none', lg: 'block' } }}>
                  {effectiveName}
                </Typography>
              </Box>

              {/* Sign out button */}
              <Tooltip title="Sign Out">
                <IconButton
                  id="header-logout-btn"
                  onClick={() => logout()}
                  size="small"
                  color="inherit"
                  aria-label="Sign out"
                  sx={{ ml: 0.5 }}
                >
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <>
              {/* Theme switcher */}
              <Tooltip title={`Switch to ${theme.palette.mode === 'light' ? 'Dark' : 'Light'} Mode`}>
                <IconButton onClick={toggleTheme} size="small" color="inherit">
                  {theme.palette.mode === 'light' ? <Brightness4Icon fontSize="small" /> : <Brightness7Icon fontSize="small" />}
                </IconButton>
              </Tooltip>

              <Button
                component={Link}
                href="/login"
                variant="outlined"
                size="small"
                color="primary"
                startIcon={<LoginIcon />}
                sx={{ fontWeight: 600 }}
              >
                Sign In
              </Button>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
