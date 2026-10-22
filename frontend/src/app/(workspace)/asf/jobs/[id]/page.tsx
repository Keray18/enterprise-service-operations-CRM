'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Rating from '@mui/material/Rating';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import BuildIcon from '@mui/icons-material/Build';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import GavelIcon from '@mui/icons-material/Gavel';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyIcon from '@mui/icons-material/Key';
import LockResetIcon from '@mui/icons-material/LockReset';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonIcon from '@mui/icons-material/Person';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import SendIcon from '@mui/icons-material/Send';
import StarIcon from '@mui/icons-material/Star';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { PageHeader } from '../../../../../components/data-display/PageHeader';
import { StatusBadge } from '../../../../../components/feedback/StatusBadge';
import { ProtectedRoute } from '../../../../../components/layout/ProtectedRoute';
import { useParts } from '../../../../../lib/catalogApi';
import { useAcknowledgeDispatch } from '../../../../../lib/warehouseApi';
import {
  AttachmentType,
  CANCELLATION_REASON_LABELS,
  CancellationReasonCode,
  job360Api,
  PartEntryType,
  REPLACEMENT_REASON_LABELS,
  ReplacementReasonCode,
  RepairOutcomeAction,
  useAddPart,
  useCustomerEstimateDecision,
  useDeleteAttachment,
  useEngineeringMasters,
  useInitiateClosure,
  useJob360,
  useProvideSpecialPartEstimate,
  useRecordDiagnosis,
  useRecordRepair,
  useRegenerateHappyCode,
  useRemovePart,
  useRequestCancellation,
  useRequestReplacement,
  useReviewCancellation,
  useReviewReplacement,
  useSubmitFeedback,
  useUploadAttachment,
  useVerifyHappyCode,
} from '../../../../../lib/job360Api';
import { TechnicianCheckInDialog } from '../../components/TechnicianCheckInDialog';

export default function Job360WorkspacePage() {
  const params = useParams();
  const idOrJobNumber = (params?.id as string) || '';

  const { data: jobData, isLoading, isError, error, refetch, isFetching } = useJob360(idOrJobNumber);

  const [activeTab, setActiveTab] = useState<string>('diagnosis');
  const [checkInModalOpen, setCheckInModalOpen] = useState<boolean>(false);
  const [addPartModalOpen, setAddPartModalOpen] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Diagnosis Form State
  const [voeDescription, setVoeDescription] = useState<string>('');
  const [selectedFaultId, setSelectedFaultId] = useState<string>('');
  const [selectedDefectId, setSelectedDefectId] = useState<string>('');
  const [observations, setObservations] = useState<string>('');
  const [physicalSerialVerified, setPhysicalSerialVerified] = useState<boolean>(true);

  // Repair Form State
  const [selectedRepairCodeId, setSelectedRepairCodeId] = useState<string>('');
  const [selectedRepairAction, setSelectedRepairAction] = useState<RepairOutcomeAction>('REPAIRED_WITHOUT_PART');
  const [repairRemarks, setRepairRemarks] = useState<string>('');
  const [repairAt, setRepairAt] = useState<'ON_SITE' | 'IN_HOUSE'>('ON_SITE');
  const [replacementReason, setReplacementReason] = useState<string>('');
  const [replacementRemarks, setReplacementRemarks] = useState<string>('');
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancellationRemarks, setCancellationRemarks] = useState<string>('');
  const [specialPartRemarks, setSpecialPartRemarks] = useState<string>('');

  // Add Part Form State
  const [partSearch, setPartSearch] = useState<string>('');
  const [selectedPart, setSelectedPart] = useState<any>(null);
  const [partQuantity, setPartQuantity] = useState<number>(1);
  const [partEntryType, setPartEntryType] = useState<PartEntryType>('USED');
  const [partIsChargeable, setPartIsChargeable] = useState<boolean>(false);
  const [partDefectiveSerial, setPartDefectiveSerial] = useState<string>('');
  const [partNewSerial, setPartNewSerial] = useState<string>('');
  const [partRemarks, setPartRemarks] = useState<string>('');

  // Special Part Estimate State
  const [estimateQuotationAmount, setEstimateQuotationAmount] = useState<string>('');
  const [estimateQuotationRemarks, setEstimateQuotationRemarks] = useState<string>('');
  const [customerDecisionRemarks, setCustomerDecisionRemarks] = useState<string>('');

  // Attachment Upload State
  const [selectedAttachmentType, setSelectedAttachmentType] = useState<AttachmentType>('PRODUCT_PHOTO');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Phase 2C State: Closure & Happy Code
  const [closureRemarks, setClosureRemarks] = useState<string>('');
  const [happyCodeInput, setHappyCodeInput] = useState<string>('');
  const [isSupervisorOverride, setIsSupervisorOverride] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [csatRating, setCsatRating] = useState<number>(5);
  const [feedbackRemarksInput, setFeedbackRemarksInput] = useState<string>('');
  const [qualityAnalysisInput, setQualityAnalysisInput] = useState<string>('');

  // Phase 2C State: Replacement
  const [replacementModalOpen, setReplacementModalOpen] = useState<boolean>(false);
  const [selectedReplacementReasonCode, setSelectedReplacementReasonCode] = useState<ReplacementReasonCode>('REASON_1');
  const [replacementTechRemarks, setReplacementTechRemarks] = useState<string>('');
  const [replacementReviewModalOpen, setReplacementReviewModalOpen] = useState<boolean>(false);
  const [replacementReviewDecision, setReplacementReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [replacementReviewRemarks, setReplacementReviewRemarks] = useState<string>('');

  // Phase 2C State: Cancellation
  const [cancellationModalOpen, setCancellationModalOpen] = useState<boolean>(false);
  const [selectedCancellationReasonCode, setSelectedCancellationReasonCode] = useState<CancellationReasonCode>('REASON_1');
  const [cancellationRemarksInput, setCancellationRemarksInput] = useState<string>('');
  const [cancellationReviewModalOpen, setCancellationReviewModalOpen] = useState<boolean>(false);
  const [cancellationReviewDecision, setCancellationReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [cancellationReviewRemarks, setCancellationReviewRemarks] = useState<string>('');

  const serviceRequest = jobData?.serviceRequest;
  const verification = jobData?.verification;
  const parts = jobData?.parts || [];
  const attachments = jobData?.attachments || [];
  const events = jobData?.events || [];
  const notifications = jobData?.notifications || [];
  const feedback = jobData?.feedback;
  const replacementRequest = jobData?.replacementRequest;
  const cancellationRequest = jobData?.cancellationRequest;
  const warehouse = jobData?.warehouse;
  const availableActions = jobData?.availableActions;

  // Masters
  const mastersQuery = useEngineeringMasters(serviceRequest?.brandId, serviceRequest?.productId);
  const faults = mastersQuery.data?.faults || [];
  const defects = mastersQuery.data?.defects || [];
  const repairCodes = mastersQuery.data?.repairCodes || [];

  // Parts catalogue for lookup
  const partsListQuery = useParts({
    brandId: serviceRequest?.brandId,
    productId: serviceRequest?.productId,
    search: partSearch.trim() || undefined,
    isActive: 'Y',
    limit: 30,
    page: 1,
  });

  // Mutations
  const recordDiagnosisMutation = useRecordDiagnosis(serviceRequest?.requestId || '');
  const recordRepairMutation = useRecordRepair(serviceRequest?.requestId || '');
  const addPartMutation = useAddPart(serviceRequest?.requestId || '');
  const removePartMutation = useRemovePart(serviceRequest?.requestId || '');
  const provideEstimateMutation = useProvideSpecialPartEstimate(serviceRequest?.requestId || '');
  const customerEstimateMutation = useCustomerEstimateDecision(serviceRequest?.requestId || '');
  const uploadAttachmentMutation = useUploadAttachment(serviceRequest?.requestId || '');
  const deleteAttachmentMutation = useDeleteAttachment(serviceRequest?.requestId || '');

  // Phase 2C Mutations
  const initiateClosureMutation = useInitiateClosure(serviceRequest?.requestId || '');
  const regenerateHappyCodeMutation = useRegenerateHappyCode(serviceRequest?.requestId || '');
  const verifyHappyCodeMutation = useVerifyHappyCode(serviceRequest?.requestId || '');
  const submitFeedbackMutation = useSubmitFeedback(serviceRequest?.requestId || '');
  const requestReplacementMutation = useRequestReplacement(serviceRequest?.requestId || '');
  const reviewReplacementMutation = useReviewReplacement(serviceRequest?.requestId || '');
  const requestCancellationMutation = useRequestCancellation(serviceRequest?.requestId || '');
  const reviewCancellationMutation = useReviewCancellation(serviceRequest?.requestId || '');
  const acknowledgeDispatchMutation = useAcknowledgeDispatch();

  // Prepopulate diagnosis form if exists
  React.useEffect(() => {
    if (serviceRequest) {
      if (serviceRequest.voeDescription) setVoeDescription(serviceRequest.voeDescription);
      if (serviceRequest.faultId) setSelectedFaultId(serviceRequest.faultId);
      if (serviceRequest.defectId) setSelectedDefectId(serviceRequest.defectId);
      if (serviceRequest.observations) setObservations(serviceRequest.observations);
      if (serviceRequest.repairCodeId) setSelectedRepairCodeId(serviceRequest.repairCodeId);
      if (serviceRequest.repairAction) setSelectedRepairAction(serviceRequest.repairAction as any);
      if (serviceRequest.repairRemarks) setRepairRemarks(serviceRequest.repairRemarks);
    }
  }, [serviceRequest]);

  // Handlers
  const handleSaveDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFaultId) {
      setActionErrorMsg('Please select a Fault Classification.');
      return;
    }

    try {
      await recordDiagnosisMutation.mutateAsync({
        voeDescription: voeDescription.trim(),
        faultId: selectedFaultId,
        defectId: selectedDefectId || undefined,
        observations: observations.trim() || undefined,
        physicalSerialVerified,
      });
      setActionSuccessMsg('Diagnosis recorded successfully! State updated to IN_PROGRESS_REPAIR.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to save diagnosis.');
    }
  };

  const handleSaveRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepairCodeId) {
      setActionErrorMsg('Please select a Repair Code master.');
      return;
    }

    try {
      await recordRepairMutation.mutateAsync({
        repairCodeId: selectedRepairCodeId,
        repairAction: selectedRepairAction,
        repairRemarks: repairRemarks.trim() || undefined,
        repairAt,
        replacementReason: selectedRepairAction === 'REQUEST_REPLACEMENT' ? replacementReason : undefined,
        replacementRemarks: selectedRepairAction === 'REQUEST_REPLACEMENT' ? replacementRemarks : undefined,
        cancellationReason: selectedRepairAction === 'REQUEST_CANCELLATION' ? cancellationReason : undefined,
        cancellationRemarks: selectedRepairAction === 'REQUEST_CANCELLATION' ? cancellationRemarks : undefined,
        specialPartRemarks: selectedRepairAction === 'PENDING_SPECIAL_PART_ESTIMATE' ? specialPartRemarks : undefined,
      });
      setActionSuccessMsg('Repair outcome recorded successfully.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to record repair outcome.');
    }
  };

  const handleAddPartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPart?.partId) {
      setActionErrorMsg('Please select a compatible part code from the catalogue.');
      return;
    }

    try {
      await addPartMutation.mutateAsync({
        partId: selectedPart.partId,
        quantity: partQuantity,
        entryType: partEntryType,
        isChargeableToCustomer: partIsChargeable,
        defectiveSerialNo: partDefectiveSerial.trim() || undefined,
        newPartSerialNo: partNewSerial.trim() || undefined,
        remarks: partRemarks.trim() || undefined,
      });
      setAddPartModalOpen(false);
      setSelectedPart(null);
      setPartQuantity(1);
      setPartDefectiveSerial('');
      setPartNewSerial('');
      setPartRemarks('');
      setActionSuccessMsg('Part recorded on job.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to add part.');
    }
  };

  const handleDeletePart = async (partEntryId: string) => {
    if (!window.confirm('Are you sure you want to remove this part entry?')) return;
    try {
      await removePartMutation.mutateAsync(partEntryId);
      setActionSuccessMsg('Part removed from job.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to remove part.');
    }
  };

  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setActionErrorMsg('Please choose an image or PDF file to upload.');
      return;
    }

    try {
      await uploadAttachmentMutation.mutateAsync({
        attachmentType: selectedAttachmentType,
        file: selectedFile,
      });
      setSelectedFile(null);
      setActionSuccessMsg('Evidence attachment uploaded securely.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to upload attachment.');
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this evidence attachment?')) return;
    try {
      await deleteAttachmentMutation.mutateAsync(attachmentId);
      setActionSuccessMsg('Evidence attachment deleted.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to delete attachment.');
    }
  };

  const handleProvideEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(estimateQuotationAmount);
    if (isNaN(amount) || amount <= 0) {
      setActionErrorMsg('Please enter a valid positive estimate amount.');
      return;
    }

    try {
      await provideEstimateMutation.mutateAsync({
        estimateAmount: amount,
        remarks: estimateQuotationRemarks.trim() || undefined,
      });
      setActionSuccessMsg('Special part quotation recorded.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to record quotation.');
    }
  };

  const handleCustomerEstimateDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    try {
      await customerEstimateMutation.mutateAsync({
        decision,
        customerRemarks: customerDecisionRemarks.trim() || undefined,
      });
      setActionSuccessMsg(`Customer decision (${decision}) recorded.`);
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to record estimate decision.');
    }
  };

  // Phase 2C Handlers
  const handleInitiateClosure = async () => {
    try {
      const res = await initiateClosureMutation.mutateAsync({
        remarks: closureRemarks.trim() || undefined,
      });
      setActionSuccessMsg(res.message || 'Repair completed. Happy Code generated and sent to customer via SMS 4.');
      setClosureRemarks('');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to initiate closure.');
    }
  };

  const handleRegenerateHappyCode = async () => {
    try {
      const res = await regenerateHappyCodeMutation.mutateAsync();
      setActionSuccessMsg(res.message || 'Happy Code regenerated and dispatched via SMS 5.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to regenerate Happy Code.');
    }
  };

  const handleVerifyHappyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupervisorOverride && (!happyCodeInput || happyCodeInput.trim().length !== 6)) {
      setActionErrorMsg('Please enter a valid 6-digit numeric Happy Code.');
      return;
    }
    if (isSupervisorOverride && (!overrideReason || overrideReason.trim().length < 10)) {
      setActionErrorMsg('Supervisor override requires written justification of at least 10 characters.');
      return;
    }

    try {
      const res = await verifyHappyCodeMutation.mutateAsync({
        happyCode: isSupervisorOverride ? undefined : happyCodeInput.trim(),
        isSupervisorOverride,
        overrideReason: isSupervisorOverride ? overrideReason.trim() : undefined,
        feedback: csatRating ? {
          rating: csatRating,
          feedbackRemarks: feedbackRemarksInput.trim() || undefined,
          qualityAnalysis: qualityAnalysisInput.trim() || undefined,
        } : undefined,
      });
      setActionSuccessMsg(res.message || 'Service call verified and closed successfully!');
      setHappyCodeInput('');
      setOverrideReason('');
      setIsSupervisorOverride(false);
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Happy Code verification failed.');
    }
  };

  const handleSubmitStandaloneFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await submitFeedbackMutation.mutateAsync({
        rating: csatRating,
        feedbackRemarks: feedbackRemarksInput.trim() || undefined,
        qualityAnalysis: qualityAnalysisInput.trim() || undefined,
      });
      setActionSuccessMsg(res.message || 'Customer feedback recorded successfully.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to record customer feedback.');
    }
  };

  const handleRequestReplacementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await requestReplacementMutation.mutateAsync({
        reasonCode: selectedReplacementReasonCode,
        technicianRemarks: replacementTechRemarks.trim() || undefined,
      });
      setReplacementModalOpen(false);
      setReplacementTechRemarks('');
      setActionSuccessMsg(res.message || 'Replacement request submitted for Head Office review.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to request replacement.');
    }
  };

  const handleReviewReplacementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const repId = jobData?.replacementRequest?.replacementId;
    if (!repId) return;

    try {
      const res = await reviewReplacementMutation.mutateAsync({
        replacementId: repId,
        payload: {
          decision: replacementReviewDecision,
          reviewRemarks: replacementReviewRemarks.trim() || undefined,
        },
      });
      setReplacementReviewModalOpen(false);
      setReplacementReviewRemarks('');
      setActionSuccessMsg(
        res.decision === 'APPROVED'
          ? `Replacement approved! Issued Approval No: ${res.approvalNumber}. Customer notified via SMS 8.`
          : 'Replacement request rejected. Job returned to in-progress repair.'
      );
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to review replacement request.');
    }
  };

  const handleRequestCancellationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await requestCancellationMutation.mutateAsync({
        reasonCode: selectedCancellationReasonCode,
        remarks: cancellationRemarksInput.trim() || undefined,
      });
      setCancellationModalOpen(false);
      setCancellationRemarksInput('');
      setActionSuccessMsg(res.message || 'Cancellation request submitted for supervisor review.');
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to request cancellation.');
    }
  };

  const handleReviewCancellationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cancId = jobData?.cancellationRequest?.cancellationId;
    if (!cancId) return;

    try {
      const res = await reviewCancellationMutation.mutateAsync({
        cancellationId: cancId,
        payload: {
          decision: cancellationReviewDecision,
          reviewRemarks: cancellationReviewRemarks.trim() || undefined,
        },
      });
      setCancellationReviewModalOpen(false);
      setCancellationReviewRemarks('');
      setActionSuccessMsg(
        res.decision === 'APPROVED'
          ? 'Cancellation approved. Service call cancelled and SMS 7 dispatched to customer.'
          : 'Cancellation request rejected. Job returned to in-progress repair.'
      );
      refetch();
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to review cancellation request.');
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute requiredPermission="calls:read">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </ProtectedRoute>
    );
  }

  if (isError || !serviceRequest) {
    return (
      <ProtectedRoute requiredPermission="calls:read">
        <Box sx={{ p: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            component={Link}
            href="/asf"
            sx={{ mb: 2, textTransform: 'none' }}
          >
            Back to ASF Queue
          </Button>
          <Alert severity="error">
            {(error as any)?.message || `Service request '${idOrJobNumber}' could not be loaded.`}
          </Alert>
        </Box>
      </ProtectedRoute>
    );
  }

  const isCheckedIn = Boolean(verification?.isCheckedIn);
  const remainingHappyCodeAttempts = Math.max(0, 5 - (verification?.happyCodeAttempts || 0));
  const happyCodeRegenCount = verification?.happyCodeRegeneratedCount || 0;

  return (
    <ProtectedRoute requiredPermission="calls:read">
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
          {/* Top Navigation & Status Bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              component={Link}
              href="/asf"
              variant="outlined"
              size="small"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              ASF Queue
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="Refresh Job Details">
                <IconButton onClick={() => refetch()} disabled={isFetching} size="small">
                  <RefreshIcon sx={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Job 360 Header Banner */}
          <Paper
            elevation={2}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
            }}
          >
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={7}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>
                    {serviceRequest.jobNumber}
                  </Typography>
                  <StatusBadge status={serviceRequest.status} />
                  <Chip
                    label={serviceRequest.warrantyStatus}
                    color={serviceRequest.warrantyStatus === 'IN_WARRANTY' ? 'success' : 'warning'}
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                  <Chip
                    label={serviceRequest.callType}
                    size="small"
                    variant="outlined"
                    sx={{ color: '#94a3b8', borderColor: '#475569' }}
                  />
                  {serviceRequest.status === 'REPLACEMENT_APPROVED' && (
                    <Chip
                      icon={<PublishedWithChangesIcon />}
                      label={`Approval No: ${serviceRequest.replacementApprovalNo || 'Generated'}`}
                      color="secondary"
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  )}
                  {serviceRequest.status === 'CALL_CLOSURE_SUBMITTED' && (
                    <Chip
                      icon={<SecurityIcon />}
                      label="Awaiting Happy Code"
                      color="warning"
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  )}
                  {serviceRequest.status === 'CLOSED' && (
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="Service Closed"
                      color="success"
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  )}
                </Box>
                <Typography variant="body2" sx={{ color: '#cbd5e1' }}>
                  {serviceRequest.problemDescription || serviceRequest.vocDescription || 'No description provided'}
                </Typography>
              </Grid>

              <Grid item xs={12} md={5}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: { xs: 'flex-start', md: 'flex-end' },
                    gap: 1,
                  }}
                >
                  {isCheckedIn ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleIcon color="success" />
                      <Typography variant="body2" sx={{ color: '#4ade80', fontWeight: 600 }}>
                        Technician Checked In
                        {verification?.checkedInAt && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 6 }}>
                            ({new Date(verification.checkedInAt).toLocaleString()})
                          </span>
                        )}
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningAmberIcon color="warning" />
                      <Typography variant="body2" sx={{ color: '#facc15', fontWeight: 600 }}>
                        Awaiting Technician OTP Check-In
                      </Typography>
                      {availableActions?.canCheckIn && (
                        <Button
                          size="small"
                          variant="contained"
                          color="warning"
                          onClick={() => setCheckInModalOpen(true)}
                          startIcon={<KeyIcon />}
                          sx={{ textTransform: 'none', ml: 1, fontWeight: 700 }}
                        >
                          Check-In
                        </Button>
                      )}
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 2, color: '#94a3b8', fontSize: '0.8rem' }}>
                    <span>
                      Registered:{' '}
                      {serviceRequest.registeredAt
                        ? new Date(serviceRequest.registeredAt).toLocaleDateString()
                        : 'N/A'}
                    </span>
                    <span>•</span>
                    <span>
                      Franchise: <strong>{serviceRequest.assignedLocationName || 'Central'}</strong>
                    </span>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Feedback Alerts */}
          {actionSuccessMsg && (
            <Alert severity="success" onClose={() => setActionSuccessMsg(null)} sx={{ mb: 2 }}>
              {actionSuccessMsg}
            </Alert>
          )}
          {actionErrorMsg && (
            <Alert severity="error" onClose={() => setActionErrorMsg(null)} sx={{ mb: 2 }}>
              {actionErrorMsg}
            </Alert>
          )}

          {/* 3 Overview Cards: Customer, Product, Technician */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Customer & Address Card */}
            <Grid item xs={12} md={4}>
              <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                <CardContent>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    Customer Details
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
                    {serviceRequest.customerName || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                    {serviceRequest.customerPhone || 'N/A'}
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="body2" color="text.secondary">
                    {serviceRequest.customerAddress || 'No address provided'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Pincode: <strong>{serviceRequest.customerPincode || 'N/A'}</strong>
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Product & Asset Card */}
            <Grid item xs={12} md={4}>
              <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                <CardContent>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    Product & Asset
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
                    {serviceRequest.brandName} • {serviceRequest.productName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Model: <strong>{serviceRequest.modelCode || serviceRequest.modelName || 'Standard'}</strong>
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Serial No:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {serviceRequest.serialNumber || 'NOT RECORDED'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Purchase Date:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {serviceRequest.purchaseDate
                        ? new Date(serviceRequest.purchaseDate).toLocaleDateString()
                        : 'N/A'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Field Technician & Appointment Card */}
            <Grid item xs={12} md={4}>
              <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                <CardContent>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    Field Technician & Appointment
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
                    {serviceRequest.assignedEngineerName || 'Unassigned'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Phone: {serviceRequest.assignedEngineerPhone || 'N/A'}
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Appointment Date:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {serviceRequest.appointmentDate
                        ? new Date(serviceRequest.appointmentDate).toLocaleDateString()
                        : 'Not scheduled'}{' '}
                      ({serviceRequest.appointmentSlot || 'N/A'})
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Check-In Gate:
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: isCheckedIn ? 'success.main' : 'warning.main',
                      }}
                    >
                      {isCheckedIn ? 'PASSED (CONFIRMED)' : 'PENDING CHECK-IN'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Operational Tabs Navigation */}
          <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Tabs
              value={activeTab}
              onChange={(_, val) => setActiveTab(val)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
            >
              <Tab value="diagnosis" label="1. Diagnosis & VOE" sx={{ fontWeight: 600, textTransform: 'none' }} />
              <Tab value="repair" label="2. Repair Actions" sx={{ fontWeight: 600, textTransform: 'none' }} />
              <Tab
                value="parts"
                label={`3. Spare Parts & Costs (${parts.length})`}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              />
              <Tab
                value="evidence"
                label={`4. Evidence & Photos (${attachments.length})`}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              />
              {(serviceRequest.status === 'PENDING_SPECIAL_PART_ESTIMATE' ||
                serviceRequest.status === 'SPECIAL_PART_ESTIMATE_PROVIDED') && (
                <Tab value="quotation" label="Special Part Quotation" sx={{ fontWeight: 600, textTransform: 'none' }} />
              )}
              <Tab
                value="closure"
                label="5. Closure & Happy Code"
                icon={<CheckCircleOutlineIcon fontSize="small" />}
                iconPosition="start"
                sx={{ fontWeight: 600, textTransform: 'none' }}
              />
              <Tab
                value="escalations"
                label="6. Replacement & Cancellation"
                icon={<PublishedWithChangesIcon fontSize="small" />}
                iconPosition="start"
                sx={{ fontWeight: 600, textTransform: 'none' }}
              />
              <Tab
                value="events"
                label={`7. Lifecycle Events (${events.length})`}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              />
              <Tab
                value="outbox"
                label={`8. SMS Outbox (${notifications.length})`}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              />
            </Tabs>

            {/* TAB 1: DIAGNOSIS & OBSERVATIONS */}
            {activeTab === 'diagnosis' && (
              <Box sx={{ p: 3 }}>
                {!isCheckedIn && (
                  <Alert severity="warning" sx={{ mb: 3 }}>
                    Technician OTP Check-In is mandatory before diagnosing this unit. Please complete on-site
                    OTP verification first.
                  </Alert>
                )}

                {serviceRequest.diagnosedAt && (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    Diagnosis recorded by{' '}
                    <strong>{serviceRequest.diagnosedByName || serviceRequest.diagnosedBy}</strong> on{' '}
                    {new Date(serviceRequest.diagnosedAt).toLocaleString()}.
                  </Alert>
                )}

                <Box component="form" onSubmit={handleSaveDiagnosis}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth required disabled={!availableActions?.canDiagnose}>
                        <InputLabel id="fault-label">Fault Classification (Master)</InputLabel>
                        <Select
                          labelId="fault-label"
                          value={selectedFaultId}
                          label="Fault Classification (Master)"
                          onChange={(e) => setSelectedFaultId(e.target.value)}
                        >
                          {faults.map((f) => (
                            <MenuItem key={f.faultId} value={f.faultId}>
                              <strong>{f.faultCode}</strong> — {f.faultDescription} ({f.category})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth disabled={!availableActions?.canDiagnose}>
                        <InputLabel id="defect-label">Defect Taxonomy (Optional)</InputLabel>
                        <Select
                          labelId="defect-label"
                          value={selectedDefectId}
                          label="Defect Taxonomy (Optional)"
                          onChange={(e) => setSelectedDefectId(e.target.value)}
                        >
                          <MenuItem value="">
                            <em>None / Not Specified</em>
                          </MenuItem>
                          {defects.map((d) => (
                            <MenuItem key={d.defectId} value={d.defectId}>
                              <strong>{d.defectCode}</strong> — {d.defectDescription}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        required
                        multiline
                        rows={3}
                        label="Voice of Engineer (VOE) — Detailed Symptom Analysis"
                        placeholder="Detailed technical description of observed symptom and physical test outcome..."
                        value={voeDescription}
                        onChange={(e) => setVoeDescription(e.target.value)}
                        disabled={!availableActions?.canDiagnose}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        multiline
                        rows={2}
                        label="Physical Observations & Component Notes"
                        placeholder="Wear and tear, voltage checks, moisture or physical damage remarks..."
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        disabled={!availableActions?.canDiagnose}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={physicalSerialVerified}
                            onChange={(e) => setPhysicalSerialVerified(e.target.checked)}
                            disabled={!availableActions?.canDiagnose}
                            color="success"
                          />
                        }
                        label="Physical product serial number verified against job card"
                      />
                    </Grid>

                    {availableActions?.canDiagnose && (
                      <Grid item xs={12}>
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          size="large"
                          disabled={recordDiagnosisMutation.isPending}
                          startIcon={<BuildIcon />}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          {recordDiagnosisMutation.isPending ? 'Saving Diagnosis...' : 'Save Diagnosis & Proceed'}
                        </Button>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </Box>
            )}

            {/* TAB 2: REPAIR ACTIONS */}
            {activeTab === 'repair' && (
              <Box sx={{ p: 3 }}>
                {!availableActions?.canRecordRepair && (
                  <Alert severity="info" sx={{ mb: 3 }}>
                    Repair actions can be recorded when the ticket is in <strong>IN_PROGRESS_REPAIR</strong>{' '}
                    or when awaiting customer estimate approval. Current status is{' '}
                    <strong>{serviceRequest.status}</strong>.
                  </Alert>
                )}

                <Box component="form" onSubmit={handleSaveRepair}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth required disabled={!availableActions?.canRecordRepair}>
                        <InputLabel id="repair-code-label">Repair Code (Master)</InputLabel>
                        <Select
                          labelId="repair-code-label"
                          value={selectedRepairCodeId}
                          label="Repair Code (Master)"
                          onChange={(e) => setSelectedRepairCodeId(e.target.value)}
                        >
                          {repairCodes.map((rc) => (
                            <MenuItem key={rc.repairCodeId} value={rc.repairCodeId}>
                              <strong>{rc.repairCode}</strong> — {rc.repairAction} ({rc.repairLevel})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth required disabled={!availableActions?.canRecordRepair}>
                        <InputLabel id="repair-action-label">Repair Outcome Action</InputLabel>
                        <Select
                          labelId="repair-action-label"
                          value={selectedRepairAction}
                          label="Repair Outcome Action"
                          onChange={(e) => setSelectedRepairAction(e.target.value as any)}
                        >
                          <MenuItem value="REPAIRED_WITHOUT_PART">
                            Repaired without Part (Adjustment / Firmware)
                          </MenuItem>
                          <MenuItem value="REPAIRED_WITH_PART">
                            Repaired with Spare Part (Requires Part Entry)
                          </MenuItem>
                          <MenuItem value="REPAIRED_WITH_CONSUMABLE">
                            Repaired with Consumable
                          </MenuItem>
                          <MenuItem value="PENDING_SPARE_PART">
                            Pending Spare Part (Awaiting Warehouse Supply)
                          </MenuItem>
                          <MenuItem value="PENDING_SPECIAL_PART_ESTIMATE">
                            Pending Special Part Estimate (Quotation Required)
                          </MenuItem>
                          <MenuItem value="REQUEST_REPLACEMENT">
                            Request for Unit Replacement
                          </MenuItem>
                          <MenuItem value="REQUEST_CANCELLATION">
                            Request for Job Cancellation
                          </MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>

                    {/* Conditional replacement inputs */}
                    {selectedRepairAction === 'REQUEST_REPLACEMENT' && (
                      <>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            required
                            label="Replacement Reason"
                            placeholder="e.g. UNREPAIRABLE_PANEL_CRACK, REPEATED_FAILURE..."
                            value={replacementReason}
                            onChange={(e) => setReplacementReason(e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Replacement Technical Remarks"
                            value={replacementRemarks}
                            onChange={(e) => setReplacementRemarks(e.target.value)}
                          />
                        </Grid>
                      </>
                    )}

                    {/* Conditional cancellation inputs */}
                    {selectedRepairAction === 'REQUEST_CANCELLATION' && (
                      <>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            required
                            label="Cancellation Reason"
                            placeholder="e.g. CUSTOMER_REFUSED_REPAIR, DUPLICATE_TICKET..."
                            value={cancellationReason}
                            onChange={(e) => setCancellationReason(e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Cancellation Remarks"
                            value={cancellationRemarks}
                            onChange={(e) => setCancellationRemarks(e.target.value)}
                          />
                        </Grid>
                      </>
                    )}

                    {/* Conditional special part estimate input */}
                    {selectedRepairAction === 'PENDING_SPECIAL_PART_ESTIMATE' && (
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          required
                          multiline
                          rows={2}
                          label="Special Part Technical Requirement"
                          placeholder="Describe the specialized, non-standard component required for quotation..."
                          value={specialPartRemarks}
                          onChange={(e) => setSpecialPartRemarks(e.target.value)}
                        />
                      </Grid>
                    )}

                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth disabled={!availableActions?.canRecordRepair}>
                        <InputLabel id="repair-at-label">Service Execution Location</InputLabel>
                        <Select
                          labelId="repair-at-label"
                          value={repairAt}
                          label="Service Execution Location"
                          onChange={(e) => setRepairAt(e.target.value as any)}
                        >
                          <MenuItem value="ON_SITE">On-Site (Customer Premises)</MenuItem>
                          <MenuItem value="IN_HOUSE">In-House (Transferred to Service Center)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="General Repair Remarks"
                        placeholder="Additional technical observations or customer handover notes..."
                        value={repairRemarks}
                        onChange={(e) => setRepairRemarks(e.target.value)}
                        disabled={!availableActions?.canRecordRepair}
                      />
                    </Grid>

                    {availableActions?.canRecordRepair && (
                      <Grid item xs={12}>
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          size="large"
                          disabled={recordRepairMutation.isPending}
                          startIcon={<CheckCircleIcon />}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          {recordRepairMutation.isPending ? 'Recording Outcome...' : 'Submit Repair Outcome'}
                        </Button>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </Box>
            )}

            {/* TAB 3: SPARE PARTS & COSTS */}
            {activeTab === 'parts' && (
              <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Spare Parts & Consumables
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Parts added will be priced using server-side catalog masters.
                    </Typography>
                  </Box>
                  {availableActions?.canAddParts && (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<BuildIcon />}
                      onClick={() => setAddPartModalOpen(true)}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Add Part
                    </Button>
                  )}
                </Box>

                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Part Code</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Part Description</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Qty
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Unit Price
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Total (₹)
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Billable</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            No spare parts or consumables recorded on this job yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        parts.map((p) => (
                          <TableRow key={p.partEntryId}>
                            <TableCell sx={{ fontWeight: 600 }}>{p.partCode}</TableCell>
                            <TableCell>{p.partName}</TableCell>
                            <TableCell>
                              <Chip label={p.partCategory} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>{p.entryType}</TableCell>
                            <TableCell align="right">{p.quantity}</TableCell>
                            <TableCell align="right">₹{p.unitPrice?.toFixed(2)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              ₹{p.totalPrice?.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={p.isChargeableToCustomer === 'Y' ? 'YES' : 'NO'}
                                size="small"
                                color={p.isChargeableToCustomer === 'Y' ? 'warning' : 'default'}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={p.status} />
                            </TableCell>
                            <TableCell align="center">
                              {availableActions?.canAddParts && p.status !== 'COMMITTED' && (
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeletePart(p.partEntryId)}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Financial Summary */}
                <Box sx={{ maxWidth: 400, ml: 'auto' }}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      Estimated Charges Breakdown
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Labor / Inspection:
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        ₹{(serviceRequest.laborCharge || 0).toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Billable Spare Parts:
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        ₹{(serviceRequest.partsTotalCharge || 0).toFixed(2)}
                      </Typography>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        Total Payable:
                      </Typography>
                      <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 800 }}>
                        ₹{(serviceRequest.totalEstimateAmount || 0).toFixed(2)}
                      </Typography>
                    </Box>
                  </Paper>
                </Box>

                {/* Warehouse Logistics & Dispatches */}
                {Boolean(warehouse?.reservations?.length || warehouse?.dispatches?.length) && (
                  <Box sx={{ mt: 4 }}>
                    <Divider sx={{ mb: 3 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <LocalShippingIcon color="primary" />
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Warehouse Logistics & Fulfillment Tracking
                      </Typography>
                    </Box>

                    {/* Active Reservations */}
                    {Boolean(warehouse?.reservations && warehouse.reservations.length > 0) && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          Warehouse Part Reservations ({warehouse!.reservations.length})
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Reservation ID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Reserved Qty</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Reserved Date</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Release Details</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {warehouse!.reservations.map((res) => (
                                <TableRow key={res.reservationId}>
                                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                    {res.reservationId.slice(0, 8)}...
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 700 }}>{res.quantity}</TableCell>
                                  <TableCell>
                                    <Chip
                                      label={res.status}
                                      size="small"
                                      color={
                                        res.status === 'RESERVED'
                                          ? 'warning'
                                          : res.status === 'FULFILLED'
                                          ? 'success'
                                          : 'default'
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>{new Date(res.reservedAt).toLocaleString()}</TableCell>
                                  <TableCell>
                                    {res.releasedAt ? (
                                      <Typography variant="caption" color="text.secondary">
                                        Released: {new Date(res.releasedAt).toLocaleDateString()} (
                                        {res.releaseReason || 'Cancellation / Removal'})
                                      </Typography>
                                    ) : (
                                      'Active'
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}

                    {/* Dispatches & Delivery Challans */}
                    {Boolean(warehouse?.dispatches && warehouse.dispatches.length > 0) && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          Outbound Dispatches & Delivery Challans ({warehouse!.dispatches.length})
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead sx={{ bgcolor: 'action.hover' }}>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Challan No</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Dispatch Mode</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Transporter / Tracking</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">
                                  Taxable (₹)
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">
                                  Total Value (₹)
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Dispatched At</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">
                                  Action
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {warehouse!.dispatches.map((disp) => (
                                <TableRow key={disp.dispatchId}>
                                  <TableCell sx={{ fontWeight: 700 }}>{disp.challanNumber}</TableCell>
                                  <TableCell>{disp.dispatchMode}</TableCell>
                                  <TableCell>
                                    <Typography variant="body2">{disp.transporterName || '—'}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      AWB: {disp.docketNo || '—'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right">₹{disp.subtotalTaxable.toFixed(2)}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    ₹{disp.totalAmount.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      label={disp.status}
                                      size="small"
                                      color={disp.status === 'DELIVERED' ? 'success' : 'primary'}
                                    />
                                  </TableCell>
                                  <TableCell>{new Date(disp.dispatchedAt).toLocaleString()}</TableCell>
                                  <TableCell align="center">
                                    {disp.status === 'DISPATCHED' && (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="success"
                                        onClick={async () => {
                                          if (
                                            window.confirm(
                                              'Acknowledge arrival of this delivery challan and transfer stock to on-hand?'
                                            )
                                          ) {
                                            await acknowledgeDispatchMutation.mutateAsync(disp.dispatchId);
                                            refetch();
                                          }
                                        }}
                                        disabled={acknowledgeDispatchMutation.isPending}
                                        sx={{ textTransform: 'none', py: 0.2 }}
                                      >
                                        Acknowledge
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* TAB 4: EVIDENCE & ATTACHMENTS */}
            {activeTab === 'evidence' && (
              <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Evidence & Photographic Records
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Mandatory photo evidence for warranty validation and claim reimbursement audits.
                    </Typography>
                  </Box>
                </Box>

                {/* Upload Form */}
                {availableActions?.canUploadAttachments && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: '#f8fafc' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                      Upload New Evidence Attachment
                    </Typography>
                    <Box
                      component="form"
                      onSubmit={handleUploadAttachment}
                      sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
                    >
                      <FormControl size="small" sx={{ minWidth: 240 }}>
                        <InputLabel id="attachment-type-label">Evidence Classification</InputLabel>
                        <Select
                          labelId="attachment-type-label"
                          value={selectedAttachmentType}
                          label="Evidence Classification"
                          onChange={(e) => setSelectedAttachmentType(e.target.value as any)}
                        >
                          <MenuItem value="SERIAL_NUMBER_PLATE">Product Serial Number Plate</MenuItem>
                          <MenuItem value="PART_FRONT">Defective Part (Front View)</MenuItem>
                          <MenuItem value="PART_BACK">Defective Part (Back / Burn View)</MenuItem>
                          <MenuItem value="PRODUCT_PHOTO">Repaired Unit Working State</MenuItem>
                          <MenuItem value="SIGNED_JOBSHEET">Signed Customer Jobsheet Copy</MenuItem>
                          <MenuItem value="INVOICE_COPY">Purchase Invoice / Bill Proof</MenuItem>
                          <MenuItem value="OTHER_EVIDENCE">Other Supporting Evidence</MenuItem>
                        </Select>
                      </FormControl>

                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={<CloudUploadIcon />}
                        size="small"
                        sx={{ textTransform: 'none' }}
                      >
                        {selectedFile ? selectedFile.name : 'Choose File (Max 10MB)'}
                        <input
                          type="file"
                          hidden
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                      </Button>

                      <Button
                        type="submit"
                        variant="contained"
                        disabled={!selectedFile || uploadAttachmentMutation.isPending}
                        size="small"
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        {uploadAttachmentMutation.isPending ? 'Uploading...' : 'Save Attachment'}
                      </Button>
                    </Box>
                  </Paper>
                )}

                {/* Attachments List */}
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Classification</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Filename</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Format</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Uploaded By</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {attachments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            No evidence files uploaded for this service call.
                          </TableCell>
                        </TableRow>
                      ) : (
                        attachments.map((att) => (
                          <TableRow key={att.attachmentId}>
                            <TableCell sx={{ fontWeight: 600 }}>
                              <Chip label={att.attachmentType} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>{att.originalName}</TableCell>
                            <TableCell>{att.mimeType}</TableCell>
                            <TableCell>{(att.fileSizeBytes / 1024).toFixed(1)} KB</TableCell>
                            <TableCell>{att.uploadedByUsername}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {new Date(att.uploadedAt).toLocaleString()}
                            </TableCell>
                            <TableCell align="center">
                              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                                <Tooltip title="View / Download Evidence">
                                  <IconButton
                                    size="small"
                                    component="a"
                                    href={job360Api.getAttachmentStreamUrl(att.attachmentId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <DownloadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                {availableActions?.canUploadAttachments && (
                                  <Tooltip title="Delete Evidence">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleDeleteAttachment(att.attachmentId)}
                                    >
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* TAB: SPECIAL PART QUOTATION */}
            {activeTab === 'quotation' && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Special Part Estimate Quotation Workflow
                </Typography>

                <Alert severity="warning" sx={{ mb: 3 }}>
                  This service call requires a non-standard component estimate. Work is paused until quotation
                  and customer approval are confirmed.
                </Alert>

                {availableActions?.canProvideEstimate && (
                  <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                      Central Warehouse / Logistics Quotation Entry
                    </Typography>
                    <Box component="form" onSubmit={handleProvideEstimate}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            required
                            type="number"
                            label="Special Part Total Quotation (₹)"
                            value={estimateQuotationAmount}
                            onChange={(e) => setEstimateQuotationAmount(e.target.value)}
                            inputProps={{ step: '0.01', min: '1' }}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Warehouse Procurement Remarks / Lead Time"
                            value={estimateQuotationRemarks}
                            onChange={(e) => setEstimateQuotationRemarks(e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <Button
                            type="submit"
                            variant="contained"
                            disabled={provideEstimateMutation.isPending}
                            sx={{ textTransform: 'none', fontWeight: 700 }}
                          >
                            Submit Quotation to Customer
                          </Button>
                        </Grid>
                      </Grid>
                    </Box>
                  </Paper>
                )}

                {serviceRequest.status === 'SPECIAL_PART_ESTIMATE_PROVIDED' && (
                  <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                      Quotation Provided: ₹{serviceRequest.specialPartEstimateAmount?.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      {serviceRequest.specialPartEstimateRemarks || 'No additional remarks provided.'}
                    </Typography>

                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      Record Customer Decision
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      label="Customer Discussion Remarks"
                      value={customerDecisionRemarks}
                      onChange={(e) => setCustomerDecisionRemarks(e.target.value)}
                      sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Button
                        variant="contained"
                        color="success"
                        disabled={customerEstimateMutation.isPending}
                        onClick={() => handleCustomerEstimateDecision('APPROVED')}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                      >
                        Customer Approved (Resume Repair)
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        disabled={customerEstimateMutation.isPending}
                        onClick={() => handleCustomerEstimateDecision('REJECTED')}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                      >
                        Customer Rejected (Cancel Request)
                      </Button>
                    </Box>
                  </Paper>
                )}
              </Box>
            )}

            {/* TAB 5: CALL CLOSURE & HAPPY CODE */}
            {activeTab === 'closure' && (
              <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Service Call Closure & Happy Code Verification
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Happy Code verification marks the final resolution of the field service call and captures CSAT feedback.
                    </Typography>
                  </Box>
                </Box>

                {/* 1. STATE: IN_PROGRESS_REPAIR — READY FOR CLOSURE */}
                {serviceRequest.status === 'IN_PROGRESS_REPAIR' && (
                  <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                      Step 1: Mark Repair Complete & Dispatch Happy Code (SMS 4)
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Once on-site repair is finished and unit is working, initiate closure. The system generates a confidential 6-digit Happy Code and dispatches SMS 4 to the customer.
                    </Typography>

                    {serviceRequest.repairAction ? (
                      <Box sx={{ maxWidth: 600 }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Closure Remarks (Optional)"
                          placeholder="e.g. Unit tested in presence of customer, warranty card handed over..."
                          value={closureRemarks}
                          onChange={(e) => setClosureRemarks(e.target.value)}
                          sx={{ mb: 2 }}
                        />
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<SendIcon />}
                          disabled={initiateClosureMutation.isPending}
                          onClick={handleInitiateClosure}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          {initiateClosureMutation.isPending ? 'Initiating Closure...' : 'Mark Repair Complete & Send Happy Code (SMS 4)'}
                        </Button>
                      </Box>
                    ) : (
                      <Alert severity="warning">
                        Please record a repair outcome action in Tab 2 before submitting for call closure.
                      </Alert>
                    )}
                  </Paper>
                )}

                {/* 2. STATE: CALL_CLOSURE_SUBMITTED — AWAITING HAPPY CODE VERIFICATION */}
                {serviceRequest.status === 'CALL_CLOSURE_SUBMITTED' && (
                  <Grid container spacing={3}>
                    {/* Happy Code Entry Card */}
                    <Grid item xs={12} md={7}>
                      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <SecurityIcon color="primary" />
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            Step 2: Customer Happy Code Verification
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Ask the customer for the confidential 6-digit code received via SMS 4.
                        </Typography>

                        <Box component="form" onSubmit={handleVerifyHappyCode}>
                          {!isSupervisorOverride ? (
                            <>
                              <TextField
                                fullWidth
                                required
                                label="6-Digit Customer Happy Code"
                                placeholder="e.g. 849201"
                                value={happyCodeInput}
                                onChange={(e) => setHappyCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputProps={{ maxLength: 6, style: { fontSize: '1.4rem', letterSpacing: '0.2em', textAlign: 'center', fontWeight: 700 } }}
                                sx={{ mb: 1.5 }}
                              />
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Security Standard: HMAC-SHA-256 Server Salted
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 700,
                                    color: remainingHappyCodeAttempts <= 2 ? 'error.main' : 'warning.main',
                                  }}
                                >
                                  {remainingHappyCodeAttempts} attempt(s) remaining
                                </Typography>
                              </Box>
                            </>
                          ) : (
                            <Box sx={{ mb: 2 }}>
                              <Alert severity="warning" sx={{ mb: 2 }}>
                                Supervisor Override bypasses Happy Code entry. A detailed justification of at least 10 characters is mandatory for audit compliance.
                              </Alert>
                              <TextField
                                fullWidth
                                required
                                multiline
                                rows={3}
                                label="Written Supervisor Override Justification"
                                placeholder="Explain why customer phone was unavailable or why Happy Code could not be shared..."
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                              />
                            </Box>
                          )}

                          <Divider sx={{ my: 2 }} />

                          {/* Customer CSAT Rating */}
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                            Customer Satisfaction (CSAT) Rating
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Rating
                              value={csatRating}
                              onChange={(_, val) => setCsatRating(val || 5)}
                              size="large"
                            />
                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                              {csatRating} / 5 Stars
                            </Typography>
                          </Box>

                          <TextField
                            fullWidth
                            size="small"
                            label="Customer Feedback Comments (Optional)"
                            placeholder="Customer remarks on punctuality, professionalism, or cleanliness..."
                            value={feedbackRemarksInput}
                            onChange={(e) => setFeedbackRemarksInput(e.target.value)}
                            sx={{ mb: 2 }}
                          />

                          <TextField
                            fullWidth
                            size="small"
                            label="Quality Analysis Remarks (Optional)"
                            placeholder="Operational notes regarding installation or repair durability..."
                            value={qualityAnalysisInput}
                            onChange={(e) => setQualityAnalysisInput(e.target.value)}
                            sx={{ mb: 2 }}
                          />

                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={isSupervisorOverride}
                                  onChange={(e) => setIsSupervisorOverride(e.target.checked)}
                                  color="warning"
                                />
                              }
                              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Supervisor Override</Typography>}
                            />

                            <Button
                              type="submit"
                              variant="contained"
                              color={isSupervisorOverride ? 'warning' : 'success'}
                              size="large"
                              disabled={verifyHappyCodeMutation.isPending}
                              startIcon={<AssignmentTurnedInIcon />}
                              sx={{ textTransform: 'none', fontWeight: 700 }}
                            >
                              {verifyHappyCodeMutation.isPending
                                ? 'Verifying...'
                                : isSupervisorOverride
                                ? 'Execute Override Closure'
                                : 'Verify Happy Code & Close Call'}
                            </Button>
                          </Box>
                        </Box>
                      </Paper>
                    </Grid>

                    {/* Happy Code Delivery & Regeneration Card */}
                    <Grid item xs={12} md={5}>
                      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                          Customer SMS Delivery Status
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          SMS 4 was dispatched to customer mobile <strong>{serviceRequest.customerPhone}</strong>.
                        </Typography>

                        <Alert severity="info" sx={{ mb: 2 }}>
                          The raw Happy Code is masked in system logs (<code>[PROTECTED_OTP_NOTIFICATION]</code>) for customer data privacy. Only the customer receives the plaintext code.
                        </Alert>

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          Customer Did Not Receive SMS?
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          You can regenerate a new Happy Code (SMS 5). The prior code will be permanently invalidated.
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="caption" color="text.secondary">
                            Regenerations: <strong>{happyCodeRegenCount} / 5</strong>
                          </Typography>
                          <Button
                            variant="outlined"
                            color="primary"
                            startIcon={<LockResetIcon />}
                            disabled={regenerateHappyCodeMutation.isPending || happyCodeRegenCount >= 5}
                            onClick={handleRegenerateHappyCode}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            {regenerateHappyCodeMutation.isPending ? 'Regenerating...' : 'Regenerate Code (SMS 5)'}
                          </Button>
                        </Box>
                      </Paper>
                    </Grid>
                  </Grid>
                )}

                {/* 3. STATE: CLOSED — PERMANENT CLOSURE RECORD */}
                {serviceRequest.status === 'CLOSED' && (
                  <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.main' }}>
                          Service Request Permanently Closed
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Closed on{' '}
                          {serviceRequest.closedAt
                            ? new Date(serviceRequest.closedAt).toLocaleString()
                            : 'N/A'}{' '}
                          • Final resolution archived.
                        </Typography>
                      </Box>
                    </Box>

                    {serviceRequest.supervisorOverrideReason ? (
                      <Alert severity="warning" sx={{ mb: 3 }}>
                        <strong>Closure via Supervisor Override:</strong>{' '}
                        {serviceRequest.supervisorOverrideReason}
                      </Alert>
                    ) : (
                      <Alert severity="success" sx={{ mb: 3 }}>
                        Happy Code successfully verified on-site by field technician.
                      </Alert>
                    )}

                    {/* Customer Feedback Display / Standalone Form */}
                    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: '#f8fafc' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        Customer Satisfaction & Quality Feedback
                      </Typography>
                      {feedback ? (
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Rating value={feedback.rating} readOnly size="medium" />
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {feedback.rating} / 5 Stars
                            </Typography>
                          </Box>
                          {feedback.feedbackRemarks && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              <strong>Customer Remarks:</strong> {feedback.feedbackRemarks}
                            </Typography>
                          )}
                          {feedback.qualityAnalysis && (
                            <Typography variant="body2" color="text.secondary">
                              <strong>Quality Analysis:</strong> {feedback.qualityAnalysis}
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <Box component="form" onSubmit={handleSubmitStandaloneFeedback}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            No feedback was recorded during closure. You can record customer CSAT rating now:
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Rating value={csatRating} onChange={(_, v) => setCsatRating(v || 5)} />
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {csatRating} / 5
                            </Typography>
                          </Box>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Customer Remarks"
                                value={feedbackRemarksInput}
                                onChange={(e) => setFeedbackRemarksInput(e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Quality Analysis Notes"
                                value={qualityAnalysisInput}
                                onChange={(e) => setQualityAnalysisInput(e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <Button
                                type="submit"
                                variant="contained"
                                size="small"
                                disabled={submitFeedbackMutation.isPending}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                              >
                                Save Customer Feedback
                              </Button>
                            </Grid>
                          </Grid>
                        </Box>
                      )}
                    </Paper>
                  </Paper>
                )}

                {/* Other states info banner */}
                {!['IN_PROGRESS_REPAIR', 'CALL_CLOSURE_SUBMITTED', 'CLOSED'].includes(serviceRequest.status) && (
                  <Alert severity="info">
                    Call closure can only be initiated when the request is in <strong>IN_PROGRESS_REPAIR</strong>{' '}
                    status after repair work is completed. Current status is <strong>{serviceRequest.status}</strong>.
                  </Alert>
                )}
              </Box>
            )}

            {/* TAB 6: REPLACEMENT & CANCELLATION */}
            {activeTab === 'escalations' && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  Product Replacement & Service Cancellation Workflows
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Formal escalation management with documented reasons, segregation of duties, and Head Office / Supervisor approval gates.
                </Typography>

                <Grid container spacing={3}>
                  {/* PRODUCT REPLACEMENT SECTION */}
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <SwapHorizIcon color="secondary" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Product Replacement Workflow
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Governed by 6 approved technical reasons. Approved requests generate an official Replacement Approval Number (SMS 8).
                      </Typography>

                      {replacementRequest ? (
                        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Active Replacement Request
                            </Typography>
                            <StatusBadge status={replacementRequest.status} />
                          </Box>

                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                            Reason: {replacementRequest.reasonDescription}
                          </Typography>
                          {replacementRequest.technicianRemarks && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                              Remarks: {replacementRequest.technicianRemarks}
                            </Typography>
                          )}

                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Requested By: {replacementRequest.requestedByUsername || replacementRequest.requestedBy} on{' '}
                            {new Date(replacementRequest.requestedAt).toLocaleString()}
                          </Typography>

                          {replacementRequest.status === 'APPROVED' && (
                            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#ecfdf5', borderRadius: 1.5, border: '1px solid #a7f3d0' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#065f46' }}>
                                Official Approval Number: {replacementRequest.approvalNumber || serviceRequest.replacementApprovalNo}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#047857', display: 'block', mt: 0.5 }}>
                                SMS 8 has been queued with this approval number. Awaiting physical replacement handover by central warehouse logistics.
                              </Typography>
                            </Box>
                          )}

                          {replacementRequest.status === 'REJECTED' && (
                            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fef2f2', borderRadius: 1.5, border: '1px solid #fecaca' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#991b1b' }}>
                                Replacement Rejected by Head Office
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#b91c1c' }}>
                                Review Remarks: {replacementRequest.reviewRemarks || 'No rejection remarks specified.'}
                              </Typography>
                            </Box>
                          )}

                          {replacementRequest.status === 'PENDING' && (
                            <Box sx={{ mt: 2 }}>
                              <Button
                                variant="contained"
                                color="secondary"
                                size="small"
                                startIcon={<GavelIcon />}
                                onClick={() => setReplacementReviewModalOpen(true)}
                                sx={{ textTransform: 'none', fontWeight: 700 }}
                              >
                                Head Office Review (Approve / Reject)
                              </Button>
                            </Box>
                          )}
                        </Box>
                      ) : (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            No replacement request is active for this unit.
                          </Typography>
                          {!['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_REPLACEMENT', 'REPLACEMENT_APPROVED'].includes(serviceRequest.status) && (
                            <Button
                              variant="outlined"
                              color="secondary"
                              startIcon={<SwapHorizIcon />}
                              onClick={() => setReplacementModalOpen(true)}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Request Product Replacement
                            </Button>
                          )}
                        </Box>
                      )}
                    </Paper>
                  </Grid>

                  {/* SERVICE CANCELLATION SECTION */}
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <CancelIcon color="error" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Service Request Cancellation Workflow
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Governed by 3 approved cancellation reasons. Approved requests transition ticket to CANCELLED and dispatch SMS 7.
                      </Typography>

                      {cancellationRequest ? (
                        <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0', mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Active Cancellation Request
                            </Typography>
                            <StatusBadge status={cancellationRequest.status} />
                          </Box>

                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                            Reason: {cancellationRequest.reasonDescription}
                          </Typography>
                          {cancellationRequest.remarks && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                              Remarks: {cancellationRequest.remarks}
                            </Typography>
                          )}

                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Requested By: {cancellationRequest.requestedByUsername || cancellationRequest.requestedBy} on{' '}
                            {new Date(cancellationRequest.requestedAt).toLocaleString()}
                          </Typography>

                          {cancellationRequest.status === 'APPROVED' && (
                            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fef2f2', borderRadius: 1.5, border: '1px solid #fecaca' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#991b1b' }}>
                                Cancellation Approved — Ticket Cancelled
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#b91c1c' }}>
                                SMS 7 has been dispatched to customer notifying cancellation.
                              </Typography>
                            </Box>
                          )}

                          {cancellationRequest.status === 'REJECTED' && (
                            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                Cancellation Request Rejected
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Review Remarks: {cancellationRequest.reviewRemarks || 'No remarks specified.'}
                              </Typography>
                            </Box>
                          )}

                          {cancellationRequest.status === 'PENDING' && (
                            <Box sx={{ mt: 2 }}>
                              <Button
                                variant="contained"
                                color="error"
                                size="small"
                                startIcon={<GavelIcon />}
                                onClick={() => setCancellationReviewModalOpen(true)}
                                sx={{ textTransform: 'none', fontWeight: 700 }}
                              >
                                Supervisor Review (Approve / Reject)
                              </Button>
                            </Box>
                          )}
                        </Box>
                      ) : (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            No cancellation request active for this unit.
                          </Typography>
                          {!['CLOSED', 'CANCELLED', 'REPLACED', 'REQUEST_FOR_CANCELLATION'].includes(serviceRequest.status) && (
                            <Button
                              variant="outlined"
                              color="error"
                              startIcon={<CancelIcon />}
                              onClick={() => setCancellationModalOpen(true)}
                              sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                              Request Service Cancellation
                            </Button>
                          )}
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* TAB 7: LIFECYCLE EVENTS TIMELINE */}
            {activeTab === 'events' && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Immutable Lifecycle History
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Transition</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Triggered By</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {events.map((ev) => (
                        <TableRow key={ev.eventId}>
                          <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            {new Date(ev.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{ev.eventType}</TableCell>
                          <TableCell>
                            <span style={{ color: '#64748b' }}>{ev.fromState}</span> →{' '}
                            <strong>{ev.toState}</strong>
                          </TableCell>
                          <TableCell>{ev.triggeredByUsername}</TableCell>
                          <TableCell>
                            <Chip label={ev.triggeredByRole} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {ev.remarks || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* TAB 8: NOTIFICATIONS OUTBOX */}
            {activeTab === 'outbox' && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Outbox Communications Log
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Channel</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Recipient (Masked)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Template Code</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Sent At</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {notifications.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                            No notifications sent for this request.
                          </TableCell>
                        </TableRow>
                      ) : (
                        notifications.map((n) => (
                          <TableRow key={n.notificationId}>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {new Date(n.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>{n.channel}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{n.recipient}</TableCell>
                            <TableCell>
                              <Chip label={n.templateCode} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={n.status} />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Paper>

          {/* Dialogs */}
          {/* Add Part Modal */}
          <Dialog
            open={addPartModalOpen}
            onClose={() => setAddPartModalOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 700 }}>Add Spare Part or Consumable</DialogTitle>
            <Box component="form" onSubmit={handleAddPartSubmit}>
              <DialogContent dividers>
                <Autocomplete
                  options={partsListQuery.data?.items || []}
                  getOptionLabel={(option: any) =>
                    `${option.partCode} — ${option.partName} (${option.partCategory}) • ₹${option.customerPrice}`
                  }
                  value={selectedPart}
                  onChange={(_, val) => setSelectedPart(val)}
                  onInputChange={(_, val) => setPartSearch(val)}
                  loading={partsListQuery.isLoading}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Part Code from Catalogue"
                      required
                      size="small"
                      sx={{ mb: 2 }}
                    />
                  )}
                />

                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      required
                      type="number"
                      size="small"
                      label="Quantity"
                      inputProps={{ min: 1 }}
                      value={partQuantity}
                      onChange={(e) => setPartQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </Grid>

                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="entry-type-label">Usage / Requirement Type</InputLabel>
                      <Select
                        labelId="entry-type-label"
                        value={partEntryType}
                        label="Usage / Requirement Type"
                        onChange={(e) => setPartEntryType(e.target.value as any)}
                      >
                        <MenuItem value="USED">Physically Used on Unit</MenuItem>
                        <MenuItem value="REQUIRED_PNA">Part Not Available (PNA Indent)</MenuItem>
                        <MenuItem value="REQUIRED_SPECIAL_ESTIMATE">Special Part Estimate</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={partIsChargeable}
                          onChange={(e) => setPartIsChargeable(e.target.checked)}
                          color="warning"
                        />
                      }
                      label="Chargeable to customer (Billable)"
                    />
                  </Grid>

                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Defective Part Serial No."
                      value={partDefectiveSerial}
                      onChange={(e) => setPartDefectiveSerial(e.target.value)}
                    />
                  </Grid>

                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="New Replacement Serial No."
                      value={partNewSerial}
                      onChange={(e) => setPartNewSerial(e.target.value)}
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Remarks / Consumption Reference"
                      value={partRemarks}
                      onChange={(e) => setPartRemarks(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAddPartModalOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!selectedPart || addPartMutation.isPending}
                >
                  {addPartMutation.isPending ? 'Adding...' : 'Add Part'}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>

          {/* Technician Check-In Dialog */}
          <TechnicianCheckInDialog
            open={checkInModalOpen}
            onClose={() => setCheckInModalOpen(false)}
            request={serviceRequest as any}
            onSuccess={() => {
              setCheckInModalOpen(false);
              setActionSuccessMsg('Technician checked in successfully! Diagnosis tools are now unlocked.');
              refetch();
            }}
          />

          {/* Request Replacement Modal */}
          <Dialog
            open={replacementModalOpen}
            onClose={() => setReplacementModalOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 700 }}>Request Product Replacement</DialogTitle>
            <Box component="form" onSubmit={handleRequestReplacementSubmit}>
              <DialogContent dividers>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Product replacement requires formal Head Office review. Select the exact reason conforming to the service warranty policy.
                </Alert>

                <FormControl component="fieldset" fullWidth sx={{ mb: 2 }}>
                  <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1 }}>
                    Documented Replacement Reason
                  </FormLabel>
                  <RadioGroup
                    value={selectedReplacementReasonCode}
                    onChange={(e) => setSelectedReplacementReasonCode(e.target.value as ReplacementReasonCode)}
                  >
                    {(Object.keys(REPLACEMENT_REASON_LABELS) as ReplacementReasonCode[]).map((code) => (
                      <Paper
                        key={code}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          mb: 1,
                          borderRadius: 1.5,
                          bgcolor: selectedReplacementReasonCode === code ? '#f0fdf4' : 'background.paper',
                          borderColor: selectedReplacementReasonCode === code ? 'success.main' : 'divider',
                        }}
                      >
                        <FormControlLabel
                          value={code}
                          control={<Radio size="small" />}
                          label={
                            <Typography variant="body2" sx={{ fontWeight: selectedReplacementReasonCode === code ? 700 : 500 }}>
                              <strong>{code}:</strong> {REPLACEMENT_REASON_LABELS[code]}
                            </Typography>
                          }
                        />
                      </Paper>
                    ))}
                  </RadioGroup>
                </FormControl>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Technician Technical Remarks / Justification"
                  placeholder="Provide component analysis and observations supporting the replacement request..."
                  value={replacementTechRemarks}
                  onChange={(e) => setReplacementTechRemarks(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setReplacementModalOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="secondary"
                  disabled={requestReplacementMutation.isPending}
                >
                  {requestReplacementMutation.isPending ? 'Submitting...' : 'Submit Replacement Request'}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>

          {/* Review Replacement Modal (Head Office) */}
          <Dialog
            open={replacementReviewModalOpen}
            onClose={() => setReplacementReviewModalOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 700 }}>Head Office Replacement Review</DialogTitle>
            <Box component="form" onSubmit={handleReviewReplacementSubmit}>
              <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Reviewing replacement request for job <strong>{serviceRequest.jobNumber}</strong>. Approving will generate the official Replacement Approval Number and trigger SMS 8.
                </Typography>

                <FormControl component="fieldset" fullWidth sx={{ mb: 2 }}>
                  <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1 }}>Decision</FormLabel>
                  <RadioGroup
                    row
                    value={replacementReviewDecision}
                    onChange={(e) => setReplacementReviewDecision(e.target.value as 'APPROVED' | 'REJECTED')}
                  >
                    <FormControlLabel value="APPROVED" control={<Radio color="success" />} label="Approve Replacement" />
                    <FormControlLabel value="REJECTED" control={<Radio color="error" />} label="Reject Request" />
                  </RadioGroup>
                </FormControl>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Review Remarks"
                  placeholder="Record justification for Head Office approval or rejection..."
                  value={replacementReviewRemarks}
                  onChange={(e) => setReplacementReviewRemarks(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setReplacementReviewModalOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  color={replacementReviewDecision === 'APPROVED' ? 'success' : 'error'}
                  disabled={reviewReplacementMutation.isPending}
                >
                  {reviewReplacementMutation.isPending ? 'Submitting Decision...' : `Confirm ${replacementReviewDecision}`}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>

          {/* Request Cancellation Modal */}
          <Dialog
            open={cancellationModalOpen}
            onClose={() => setCancellationModalOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 700 }}>Request Service Request Cancellation</DialogTitle>
            <Box component="form" onSubmit={handleRequestCancellationSubmit}>
              <DialogContent dividers>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Cancellation terminates the service request. Select one of the 3 documented cancellation reasons.
                </Alert>

                <FormControl component="fieldset" fullWidth sx={{ mb: 2 }}>
                  <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1 }}>
                    Documented Cancellation Reason
                  </FormLabel>
                  <RadioGroup
                    value={selectedCancellationReasonCode}
                    onChange={(e) => setSelectedCancellationReasonCode(e.target.value as CancellationReasonCode)}
                  >
                    {(Object.keys(CANCELLATION_REASON_LABELS) as CancellationReasonCode[]).map((code) => (
                      <Paper
                        key={code}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          mb: 1,
                          borderRadius: 1.5,
                          bgcolor: selectedCancellationReasonCode === code ? '#fef2f2' : 'background.paper',
                          borderColor: selectedCancellationReasonCode === code ? 'error.main' : 'divider',
                        }}
                      >
                        <FormControlLabel
                          value={code}
                          control={<Radio size="small" color="error" />}
                          label={
                            <Typography variant="body2" sx={{ fontWeight: selectedCancellationReasonCode === code ? 700 : 500 }}>
                              <strong>{code}:</strong> {CANCELLATION_REASON_LABELS[code]}
                            </Typography>
                          }
                        />
                      </Paper>
                    ))}
                  </RadioGroup>
                </FormControl>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Cancellation Explanation / Customer Interaction Notes"
                  placeholder="Detail customer call attempts, refusal to pay charges, or component exclusion..."
                  value={cancellationRemarksInput}
                  onChange={(e) => setCancellationRemarksInput(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setCancellationModalOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="error"
                  disabled={requestCancellationMutation.isPending}
                >
                  {requestCancellationMutation.isPending ? 'Submitting...' : 'Submit Cancellation Request'}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>

          {/* Review Cancellation Modal (Supervisor) */}
          <Dialog
            open={cancellationReviewModalOpen}
            onClose={() => setCancellationReviewModalOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ fontWeight: 700 }}>Supervisor Cancellation Review</DialogTitle>
            <Box component="form" onSubmit={handleReviewCancellationSubmit}>
              <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Reviewing cancellation request for job <strong>{serviceRequest.jobNumber}</strong>. Approving will transition ticket to CANCELLED and queue SMS 7.
                </Typography>

                <FormControl component="fieldset" fullWidth sx={{ mb: 2 }}>
                  <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1 }}>Decision</FormLabel>
                  <RadioGroup
                    row
                    value={cancellationReviewDecision}
                    onChange={(e) => setCancellationReviewDecision(e.target.value as 'APPROVED' | 'REJECTED')}
                  >
                    <FormControlLabel value="APPROVED" control={<Radio color="error" />} label="Approve Cancellation" />
                    <FormControlLabel value="REJECTED" control={<Radio color="primary" />} label="Reject Cancellation" />
                  </RadioGroup>
                </FormControl>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Review Remarks"
                  placeholder="Record supervisor review notes..."
                  value={cancellationReviewRemarks}
                  onChange={(e) => setCancellationReviewRemarks(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setCancellationReviewModalOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  color={cancellationReviewDecision === 'APPROVED' ? 'error' : 'primary'}
                  disabled={reviewCancellationMutation.isPending}
                >
                  {reviewCancellationMutation.isPending ? 'Submitting Decision...' : `Confirm ${cancellationReviewDecision}`}
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
        </Box>
    </ProtectedRoute>
  );
}
