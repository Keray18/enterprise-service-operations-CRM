'use client';

import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CategoryIcon from '@mui/icons-material/Category';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SettingsIcon from '@mui/icons-material/Settings';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Tooltip from '@mui/material/Tooltip';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { useAuth } from '../../providers/AuthProvider';

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'CALL CENTER',
    items: [
      {
        label: 'Call Center Workspace',
        href: '/call-center',
        icon: <HeadsetMicIcon fontSize="small" />,
        requiredPermission: 'calls:read',
      },
    ],
  },
  {
    title: 'SERVICE FRANCHISE',
    items: [
      {
        label: 'Franchise Queue & Jobs',
        href: '/asf',
        icon: <AssignmentIcon fontSize="small" />,
        requiredPermission: 'asf:read',
      },
    ],
  },
  {
    title: 'WAREHOUSE & STORES',
    items: [
      {
        label: 'Warehouse & PNA Hub',
        href: '/warehouse',
        icon: <LocalShippingIcon fontSize="small" />,
        requiredPermission: 'inventory:read',
      },
    ],
  },
  {
    title: 'ADMIN & FINANCE',
    items: [
      {
        label: 'Admin Console',
        href: '/admin',
        icon: <SettingsIcon fontSize="small" />,
        requiredPermission: 'users:read',
      },
      {
        label: 'Catalog Masters',
        href: '/admin/masters',
        icon: <CategoryIcon fontSize="small" />,
        requiredPermission: 'masters:manage',
      },
      {
        label: 'Finance & Settlements',
        href: '/finance',
        icon: <AccountBalanceWalletIcon fontSize="small" />,
        requiredPermission: 'finance:read',
      },
      {
        label: 'System Diagnostics',
        href: '/admin/diagnostics',
        icon: <DashboardIcon fontSize="small" />,
        requiredRole: 'ADMIN',
      },
    ],
  },
  {
    title: 'ANALYTICS & REPORTS',
    items: [
      {
        label: 'Reports & Telemetry',
        href: '/reports',
        icon: <AssessmentIcon fontSize="small" />,
        requiredPermission: 'reports:view',
      },
    ],
  },
];

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function AppSidebar({
  mobileOpen,
  onMobileClose,
  collapsed,
  onToggleCollapse,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { isAuthenticated, hasPermission, hasRole } = useAuth();

  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.requiredPermission && !item.requiredRole) return true;
      if (!isAuthenticated) return false;
      if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
      if (item.requiredRole && !hasRole(item.requiredRole)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Navigation list */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {filteredSections.map((section, idx) => (
          <React.Fragment key={section.title}>
            {idx > 0 && <Divider sx={{ my: 1 }} />}
            {!collapsed && (
              <ListSubheader
                sx={{
                  backgroundColor: 'transparent',
                  lineHeight: '24px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'text.secondary',
                  px: 2.5,
                  pt: 1,
                }}
              >
                {section.title}
              </ListSubheader>
            )}
            <List dense disablePadding>
              {section.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                const button = (
                  <ListItemButton
                    component={Link}
                    href={item.href}
                    onClick={() => mobileOpen && onMobileClose()}
                    selected={isActive}
                    sx={{
                      minHeight: 40,
                      px: collapsed ? 2.5 : 2,
                      mx: 1,
                      my: 0.25,
                      borderRadius: 1.5,
                      justifyContent: collapsed ? 'center' : 'initial',
                      '&.Mui-selected': {
                        backgroundColor: (th) =>
                          th.palette.mode === 'light' ? '#eef2ff' : 'rgba(79, 70, 229, 0.25)',
                        color: 'primary.main',
                        '& .MuiListItemIcon-root': {
                          color: 'primary.main',
                        },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: collapsed ? 0 : 1.75,
                        justifyContent: 'center',
                        color: isActive ? 'primary.main' : 'text.secondary',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{
                          fontSize: '0.8125rem',
                          fontWeight: isActive ? 600 : 500,
                        }}
                      />
                    )}
                  </ListItemButton>
                );

                return (
                  <ListItem key={item.href} disablePadding sx={{ display: 'block' }}>
                    {collapsed ? (
                      <Tooltip title={item.label} placement="right">
                        {button}
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </ListItem>
                );
              })}
            </List>
          </React.Fragment>
        ))}
      </Box>

      {/* Collapse toggle at bottom for desktop */}
      <Box
        sx={{
          p: 1.5,
          borderTop: (th) => `1px solid ${th.palette.divider}`,
          display: { xs: 'none', md: 'flex' },
          justifyContent: collapsed ? 'center' : 'flex-end',
        }}
      >
        <IconButton size="small" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile temporary drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop permanent drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
            boxSizing: 'border-box',
            transition: (th) =>
              th.transitions.create('width', {
                easing: th.transitions.easing.sharp,
                duration: th.transitions.duration.enteringScreen,
              }),
            overflowX: 'hidden',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
}
