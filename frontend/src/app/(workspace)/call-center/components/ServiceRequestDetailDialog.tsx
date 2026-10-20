'use client';

import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import DevicesIcon from '@mui/icons-material/Devices';
import BuildIcon from '@mui/icons-material/Build';
import HistoryIcon from '@mui/icons-material/History';
import SmsIcon from '@mui/icons-material/Sms';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import {
  ServiceRequest,
  useServiceRequestById,
  useServiceRequestEvents,
  useServiceRequestNotifications,
} from '../../../../lib/callCenterApi';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';
import { tokens } from '../../../../theme/tokens';

interface ServiceRequestDetailDialogProps {
  open: boolean;
  onClose: () => void;
  requestId?: string;
  initialRequest?: ServiceRequest | null;
}

export function ServiceRequestDetailDialog({
  open,
  onClose,
  requestId,
  initialRequest,
}: ServiceRequestDetailDialogProps) {
  const [activeTab, setActiveTab] = useState(0);

  const effectiveId = requestId || initialRequest?.requestId;

  const {
    data: fetchedRequest,
    isLoading: isLoadingRequest,
    error: requestError,
  } = useServiceRequestById(effectiveId);

  const request = fetchedRequest || initialRequest;

  const {
    data: events,
    isLoading: isLoadingEvents,
  } = useServiceRequestEvents(effectiveId);

  const {
    data: notifications,
    isLoading: isLoadingNotifications,
  } = useServiceRequestNotifications(effectiveId);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          pb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Service Request Details
          </Typography>
          {request && (
            <Chip
              label={request.jobNumber}
              color="primary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 700, fontFamily: 'monospace' }}
            />
          )}
          {request && (
            <StatusBadge status={request.status} />
          )}
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3, pt: 1 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          textColor="primary"
          indicatorColor="primary"
          aria-label="Service request tabs"
        >
          <Tab icon={<DevicesIcon fontSize="small" />} iconPosition="start" label="Overview" />
          <Tab
            icon={<HistoryIcon fontSize="small" />}
            iconPosition="start"
            label={`Timeline (${events?.length ?? 0})`}
          />
          <Tab
            icon={<SmsIcon fontSize="small" />}
            iconPosition="start"
            label={`Notifications (${notifications?.length ?? 0})`}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 3, minHeight: 380 }}>
        {isLoadingRequest && !request ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        ) : requestError && !request ? (
          <Alert severity="error">Failed to load service request details.</Alert>
        ) : !request ? (
          <Alert severity="info">No service request selected.</Alert>
        ) : (
          <>
            {/* TAB 0: OVERVIEW */}
            {activeTab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Section 1: Customer Details */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <PersonIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                      Customer & Contact Information
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Customer Name
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {request.customerName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        Code: {request.customerCode}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Primary Mobile
                      </Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                        {request.customerPhone || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Service Pincode & City
                      </Typography>
                      <Typography variant="body2">
                        {request.cityName ? `${request.cityName}, ` : ''}
                        {request.stateName ? `${request.stateName} - ` : ''}
                        <strong>{request.customerPincode}</strong>
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Service Address
                      </Typography>
                      <Typography variant="body2">
                        {request.customerAddress || 'N/A'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Section 2: Equipment & Purchase */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <DevicesIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                      Product & Warranty Details
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Brand / Product
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {request.brandName} • {request.productName}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Model
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {request.modelName} ({request.modelCode})
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Serial Number
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {request.serialNumber || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Purchase Date
                      </Typography>
                      <Typography variant="body2">
                        {request.purchaseDate ? new Date(request.purchaseDate).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Invoice No. & Dealer
                      </Typography>
                      <Typography variant="body2">
                        {request.invoiceNo || 'N/A'} {request.dealerName ? `(${request.dealerName})` : ''}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Warranty Classification
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          size="small"
                          label={request.warrantyStatus.replace('_', ' ')}
                          color={
                            request.warrantyStatus === 'IN_WARRANTY'
                              ? 'success'
                              : request.warrantyStatus === 'OUT_OF_WARRANTY'
                              ? 'warning'
                              : 'default'
                          }
                          sx={{ fontWeight: 600 }}
                        />
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Section 3: Call Details & Observations */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <BuildIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                      Complaint & Service Parameters
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Call Type
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {request.callType}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Service Delivery Type
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {request.serviceType.replace('_', ' ')}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="caption" color="text.secondary">
                        Assigned ASF / Service Center
                      </Typography>
                      <Typography variant="body2">
                        {request.assignedLocationName || 'Unassigned (Pending Queue)'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Voice of Customer (VOC) / Issue
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="primary.main">
                        {request.vocDescription || 'General Service Request'}
                      </Typography>
                    </Grid>
                    {request.problemDescription && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary">
                          Customer Observation / Notes
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', bgcolor: 'grey.50', p: 1.5, borderRadius: 1 }}>
                          {request.problemDescription}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Section 4: Operational Metadata */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Registered by: <strong>{request.registeredByUsername || 'System'}</strong> on{' '}
                    {new Date(request.registeredAt).toLocaleString()}
                  </Typography>
                  {request.sla48hExpiresAt && (
                    <Typography variant="caption" color="error.main" fontWeight={600}>
                      SLA 48h Target: {new Date(request.sla48hExpiresAt).toLocaleString()}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {/* TAB 1: TIMELINE */}
            {activeTab === 1 && (
              <Box>
                {isLoadingEvents ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : !events || events.length === 0 ? (
                  <Alert severity="info">No lifecycle events recorded for this request.</Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {events.map((evt, idx) => (
                      <Paper
                        key={evt.eventId}
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderLeft: (theme) => `4px solid ${idx === 0 ? theme.palette.primary.main : theme.palette.divider}`,
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              size="small"
                              label={evt.eventType}
                              color={evt.eventType === 'INITIAL_REGISTRATION' ? 'primary' : 'default'}
                              sx={{ fontWeight: 700 }}
                            />
                            <Typography variant="body2" fontWeight={600}>
                              {evt.fromState} → {evt.toState}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(evt.createdAt).toLocaleString()}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Actor: <strong>{evt.triggeredByUsername}</strong> ({evt.triggeredByRole})
                        </Typography>
                        {evt.remarks && (
                          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic' }}>
                            &ldquo;{evt.remarks}&rdquo;
                          </Typography>
                        )}
                      </Paper>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {/* TAB 2: NOTIFICATIONS OUTBOX */}
            {activeTab === 2 && (
              <Box>
                {isLoadingNotifications ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : !notifications || notifications.length === 0 ? (
                  <Alert severity="info">No outbox notifications queued for this request.</Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {notifications.map((notif) => (
                      <Paper key={notif.notificationId} variant="outlined" sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              size="small"
                              icon={<SmsIcon fontSize="small" />}
                              label={`${notif.channel} (${notif.templateCode})`}
                              variant="outlined"
                            />
                            <Chip
                              size="small"
                              label={notif.status}
                              color={
                                notif.status === 'SENT'
                                  ? 'success'
                                  : notif.status === 'QUEUED'
                                  ? 'primary'
                                  : 'error'
                              }
                              icon={
                                notif.status === 'SENT' ? (
                                  <CheckCircleOutlineIcon fontSize="small" />
                                ) : notif.status === 'QUEUED' ? (
                                  <ScheduleIcon fontSize="small" />
                                ) : (
                                  <ErrorOutlineIcon fontSize="small" />
                                )
                              }
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(notif.createdAt).toLocaleString()}
                          </Typography>
                        </Box>

                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          Recipient: <strong style={{ fontFamily: 'monospace' }}>{notif.recipient}</strong>
                          {notif.providerMessageId && ` • Provider ID: ${notif.providerMessageId}`}
                        </Typography>

                        <Box
                          sx={{
                            p: 1.5,
                            bgcolor: 'grey.100',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {notif.messageBody}
                        </Box>

                        {notif.errorMessage && (
                          <Alert severity="error" sx={{ mt: 1 }}>
                            Gateway Error: {notif.errorMessage}
                          </Alert>
                        )}
                      </Paper>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose} variant="outlined" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
