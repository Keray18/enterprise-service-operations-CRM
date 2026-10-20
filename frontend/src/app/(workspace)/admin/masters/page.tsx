'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import React, { useState } from 'react';
import { PageHeader } from '../../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../../components/layout/ProtectedRoute';
import { WorkspaceShell } from '../../../../components/layout/WorkspaceShell';
import { BrandManagementTab } from './BrandManagementTab';
import { CatalogAuditTab } from './CatalogAuditTab';
import { GeographyManagementTab } from './GeographyManagementTab';
import { HsnManagementTab } from './HsnManagementTab';
import { ModelManagementTab } from './ModelManagementTab';
import { PartManagementTab } from './PartManagementTab';
import { ProductManagementTab } from './ProductManagementTab';

export default function MasterDataCatalogPage() {
  const [currentTab, setCurrentTab] = useState<number>(0);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const handleNotify = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <WorkspaceShell>
      <ProtectedRoute requiredPermission="masters:read">
        <PageHeader
          title="Universal Catalog & Serviceability Console"
          subtitle="Configure enterprise Brands, Products, Models, Spare Parts, HSN/Tax policies, and Postal Serviceability."
          badge={<StatusBadge status="ACTIVE" label="Phase 1B.2 Live" />}
        />

        <Card sx={{ mb: 3 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            <Tabs
              value={currentTab}
              onChange={(_e, val) => setCurrentTab(val)}
              textColor="primary"
              indicatorColor="primary"
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Brands Master" />
              <Tab label="Products Master" />
              <Tab label="Models Master" />
              <Tab label="Parts Master" />
              <Tab label="HSN & Tax Master" />
              <Tab label="Geography & Serviceability" />
              <Tab label="Catalog Audit Trail" />
            </Tabs>
          </Box>

          <Box sx={{ p: 3 }}>
            {currentTab === 0 && <BrandManagementTab onNotify={handleNotify} />}
            {currentTab === 1 && <ProductManagementTab onNotify={handleNotify} />}
            {currentTab === 2 && <ModelManagementTab onNotify={handleNotify} />}
            {currentTab === 3 && <PartManagementTab onNotify={handleNotify} />}
            {currentTab === 4 && <HsnManagementTab onNotify={handleNotify} />}
            {currentTab === 5 && <GeographyManagementTab onNotify={handleNotify} />}
            {currentTab === 6 && <CatalogAuditTab />}
          </Box>
        </Card>

        {/* Feedback Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={5000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%', boxShadow: 3 }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </ProtectedRoute>
    </WorkspaceShell>
  );
}
