'use client';

import Box from '@mui/material/Box';
import React, { useState } from 'react';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { BreadcrumbBar } from './BreadcrumbBar';

interface WorkspaceShellProps {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}

export function WorkspaceShell({ children, headerActions }: WorkspaceShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* Sidebar */}
      <AppSidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* Main Content Column */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {/* Top Header */}
        <AppHeader
          onToggleMobileSidebar={() => setMobileOpen(!mobileOpen)}
        />

        {/* Breadcrumb row */}
        <BreadcrumbBar actions={headerActions} />

        {/* Primary Page Canvas */}
        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 2, sm: 3 },
            maxWidth: 1600,
            width: '100%',
            mx: 'auto',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
