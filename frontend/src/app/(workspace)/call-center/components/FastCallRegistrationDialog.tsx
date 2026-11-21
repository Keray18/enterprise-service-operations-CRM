'use client';

import React, { useState, useEffect, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CloseIcon from '@mui/icons-material/Close';
import SmsIcon from '@mui/icons-material/Sms';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import {
  callCenterApi,
  CustomerWithGeography,
  RegisterComplaintPayload,
  RegisterComplaintResponse,
  ServiceRequest,
  useCustomerSearch,
  usePincodeServiceability,
  useRegisterComplaint,
  useVOCList,
} from '../../../../lib/callCenterApi';
import { useBrands, useCities, useModels, useProducts, useStates } from '../../../../lib/catalogApi';
import { tokens } from '../../../../theme/tokens';
import { StatusBadge } from '../../../../components/feedback/StatusBadge';

interface FastCallRegistrationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: RegisterComplaintResponse) => void;
}

const STEPS = ['Customer Intake', 'Product & Complaint', 'Review & Register'];

export function FastCallRegistrationDialog({ open, onClose, onSuccess }: FastCallRegistrationDialogProps) {
  const [activeStep, setActiveStep] = useState(0);

  // Client idempotency token to prevent double submissions
  const idempotencyKeyRef = useRef<string>('');

  // Duplicate warning states
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [duplicateJobs, setDuplicateJobs] = useState<ServiceRequest[]>([]);
  const [allowDuplicateProceed, setAllowDuplicateProceed] = useState(false);

  // Step 1: Customer State
  const [mobileQuery, setMobileQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithGeography | null>(null);
  const [isRegisteringNewCustomer, setIsRegisteringNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustCategory, setNewCustCategory] = useState<'INDIVIDUAL' | 'COMMERCIAL' | 'CORPORATE'>('INDIVIDUAL');
  const [newCustMobile, setNewCustMobile] = useState('');
  const [newCustAltMobile, setNewCustAltMobile] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustLandmark, setNewCustLandmark] = useState('');
  const [newCustStateId, setNewCustStateId] = useState('');
  const [newCustCityId, setNewCustCityId] = useState('');
  const [newCustPincode, setNewCustPincode] = useState('');

  // Step 1 & 2 Validation Errors and Input Refs
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  const newCustNameRef = useRef<HTMLInputElement>(null);
  const newCustMobileRef = useRef<HTMLInputElement>(null);
  const newCustAltMobileRef = useRef<HTMLInputElement>(null);
  const newCustEmailRef = useRef<HTMLInputElement>(null);
  const newCustAddressRef = useRef<HTMLInputElement>(null);
  const newCustStateRef = useRef<HTMLInputElement>(null);
  const newCustCityRef = useRef<HTMLInputElement>(null);
  const newCustPincodeRef = useRef<HTMLInputElement>(null);

  // Step 2: Product & Complaint State
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [dealerName, setDealerName] = useState('');
  const [callType, setCallType] = useState<'REPAIR' | 'INSTALLATION' | 'DEMO' | 'MAINTENANCE'>('REPAIR');
  const [serviceType, setServiceType] = useState<'ON_SITE' | 'CARRY_IN' | 'PICK_UP'>('ON_SITE');
  const [selectedVocId, setSelectedVocId] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [pincodeInput, setPincodeInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [stateIdInput, setStateIdInput] = useState('');
  const [cityIdInput, setCityIdInput] = useState('');

  // Submission / Success State
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [registeredResult, setRegisteredResult] = useState<RegisterComplaintResponse | null>(null);

  // Queries
  const { data: customerSearchResults, isLoading: isSearchingCustomer } = useCustomerSearch(
    { mobile: mobileQuery },
    Boolean(mobileQuery.trim().length >= 4)
  );

  const { data: brandsData } = useBrands({ page: 1, limit: 100, isActive: 'Y' });
  const { data: productsData } = useProducts({ page: 1, limit: 100, isActive: 'Y' });
  const { data: modelsData } = useModels({
    brandId: selectedBrandId || undefined,
    productId: selectedProductId || undefined,
    isActive: 'Y',
    page: 1,
    limit: 100,
  });

  const { data: statesData } = useStates({ page: 1, limit: 50, isActive: 'Y' });
  const { data: citiesData } = useCities({
    stateId: (isRegisteringNewCustomer ? newCustStateId : stateIdInput) || undefined,
    page: 1,
    limit: 100,
    isActive: 'Y',
  });

  const effectivePincode = isRegisteringNewCustomer ? newCustPincode : pincodeInput;
  const { data: serviceabilityData, isLoading: isCheckingServiceability } = usePincodeServiceability(effectivePincode);
  const { data: vocData } = useVOCList(selectedProductId || undefined, selectedBrandId || undefined);

  const registerMutation = useRegisterComplaint();

  // Reset dialog on open
  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setSelectedCustomer(null);
      setIsRegisteringNewCustomer(false);
      setMobileQuery('');
      setSubmitError(null);
      setRegisteredResult(null);
      setStep1Errors({});
      setStep2Errors({});
      idempotencyKeyRef.current = `CALL-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Reset product & complaint fields
      setSelectedBrandId('');
      setSelectedProductId('');
      setSelectedModelId('');
      setSerialNumber('');
      setPurchaseDate('');
      setInvoiceNo('');
      setDealerName('');
      setCallType('REPAIR');
      setServiceType('ON_SITE');
      setSelectedVocId('');
      setProblemDescription('');
      setPincodeInput('');
      setAddressInput('');
      setStateIdInput('');
      setCityIdInput('');
    }
  }, [open]);

  // Autofill address when customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      setPincodeInput(selectedCustomer.pincode);
      setAddressInput(selectedCustomer.addressLine);
      setStateIdInput(selectedCustomer.stateId);
      setCityIdInput(selectedCustomer.cityId);
    }
  }, [selectedCustomer]);

  // Auto-sync state and city from pincode serviceability for new customer registration
  useEffect(() => {
    if (isRegisteringNewCustomer && serviceabilityData?.isServiceable) {
      if (serviceabilityData.stateId && !newCustStateId) {
        setNewCustStateId(serviceabilityData.stateId);
      }
      if (serviceabilityData.cityId && !newCustCityId) {
        setNewCustCityId(serviceabilityData.cityId);
      }
    }
  }, [isRegisteringNewCustomer, serviceabilityData, newCustStateId, newCustCityId]);

  // Selected Model Master Details
  const selectedModel = modelsData?.items?.find((m) => m.modelId === selectedModelId);

  // Live estimated warranty calculation
  const estimatedWarranty = React.useMemo(() => {
    if (!purchaseDate || !selectedModel) return 'UNDER_VERIFICATION';
    const pDate = new Date(purchaseDate);
    if (isNaN(pDate.getTime())) return 'UNDER_VERIFICATION';
    const elapsedDays = Math.floor((Date.now() - pDate.getTime()) / (1000 * 60 * 60 * 24));
    if (elapsedDays < 0) return 'UNDER_VERIFICATION';
    return elapsedDays <= selectedModel.customerWarrantyDays ? 'IN_WARRANTY' : 'OUT_OF_WARRANTY';
  }, [purchaseDate, selectedModel]);

  const isSerialValid = React.useMemo(() => {
    if (!selectedModel) return true;
    if (selectedModel.checkSerialNumber === 'Y') {
      return serialNumber.trim().length === selectedModel.serialNumberLength;
    }
    return true;
  }, [selectedModel, serialNumber]);

  // Comprehensive Step 1 Validator
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};

    if (!selectedCustomer && !isRegisteringNewCustomer) {
      errors.customer = 'Please select an existing customer or click "New Customer" to register a new account.';
      setStep1Errors(errors);
      setSubmitError('Please select or register a customer before proceeding.');
      return false;
    }

    if (isRegisteringNewCustomer) {
      if (!newCustName.trim()) {
        errors.name = 'Full Name is required.';
      } else if (newCustName.trim().length < 2) {
        errors.name = 'Customer full name must be at least 2 characters.';
      }

      const cleanMobile = newCustMobile.replace(/\D/g, '');
      if (!cleanMobile) {
        errors.mobile = 'Primary mobile number is required.';
      } else if (cleanMobile.length !== 10) {
        errors.mobile = `Mobile number must be exactly 10 digits (currently ${cleanMobile.length}).`;
      } else if (!/^[6-9]/.test(cleanMobile)) {
        errors.mobile = `Indian mobile numbers must begin with 6, 7, 8, or 9 (entered number begins with ${cleanMobile[0]}).`;
      }

      const cleanAltMobile = newCustAltMobile.replace(/\D/g, '');
      if (cleanAltMobile) {
        if (cleanAltMobile.length !== 10) {
          errors.altMobile = `Alternate mobile must be exactly 10 digits (currently ${cleanAltMobile.length}).`;
        } else if (!/^[6-9]/.test(cleanAltMobile)) {
          errors.altMobile = `Alternate mobile must begin with 6, 7, 8, or 9 (entered begins with ${cleanAltMobile[0]}).`;
        }
      }

      const cleanEmail = newCustEmail.trim();
      if (cleanEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          errors.email = 'Please enter a valid email address.';
        }
      }

      if (!newCustAddress.trim()) {
        errors.address = 'Address line is required.';
      } else if (newCustAddress.trim().length < 5) {
        errors.address = 'Address line must be at least 5 characters.';
      }

      if (!newCustStateId) {
        errors.stateId = 'Please select a state.';
      }

      if (!newCustCityId) {
        errors.cityId = 'Please select a city.';
      }

      const cleanPin = newCustPincode.trim();
      if (!cleanPin) {
        errors.pincode = 'Pincode is required.';
      } else if (!/^\d{6}$/.test(cleanPin)) {
        errors.pincode = 'Pincode must be exactly 6 digits.';
      } else if (serviceabilityData && !serviceabilityData.isServiceable) {
        errors.pincode = `Pincode ${cleanPin} is non-serviceable. No service coverage in this zone.`;
      } else if (serviceabilityData && serviceabilityData.isServiceable) {
        if (serviceabilityData.stateId && newCustStateId && serviceabilityData.stateId !== newCustStateId) {
          errors.pincode = `Pincode belongs to ${serviceabilityData.stateName}, which does not match selected State.`;
        } else if (serviceabilityData.cityId && newCustCityId && serviceabilityData.cityId !== newCustCityId) {
          errors.pincode = `Pincode belongs to ${serviceabilityData.cityName}, which does not match selected City.`;
        }
      }
    }

    setStep1Errors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitError('Please resolve the highlighted errors before proceeding.');
      if (errors.name) newCustNameRef.current?.focus();
      else if (errors.mobile) newCustMobileRef.current?.focus();
      else if (errors.altMobile) newCustAltMobileRef.current?.focus();
      else if (errors.email) newCustEmailRef.current?.focus();
      else if (errors.address) newCustAddressRef.current?.focus();
      else if (errors.stateId) newCustStateRef.current?.focus();
      else if (errors.cityId) newCustCityRef.current?.focus();
      else if (errors.pincode) newCustPincodeRef.current?.focus();
      return false;
    }

    setSubmitError(null);
    return true;
  };

  // Comprehensive Step 2 Validator
  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {};

    if (!selectedBrandId) errors.brandId = 'Please select a brand.';
    if (!selectedProductId) errors.productId = 'Please select a product category.';
    if (!selectedModelId) errors.modelId = 'Please select a product model.';

    if (selectedModel && selectedModel.checkSerialNumber === 'Y') {
      if (!serialNumber.trim()) {
        errors.serialNumber = `Serial number is required for this model (${selectedModel.serialNumberLength} characters).`;
      } else if (serialNumber.trim().length !== selectedModel.serialNumberLength) {
        errors.serialNumber = `Serial number must be exactly ${selectedModel.serialNumberLength} characters (current: ${serialNumber.trim().length}).`;
      }
    }

    if (!callType) errors.callType = 'Please select a call type.';
    if (!serviceType) errors.serviceType = 'Please select a service delivery mode.';

    const pin = effectivePincode.trim();
    if (!pin) {
      errors.pincode = 'Pincode is required.';
    } else if (!/^\d{6}$/.test(pin)) {
      errors.pincode = 'Pincode must be exactly 6 digits.';
    } else if (serviceabilityData && !serviceabilityData.isServiceable) {
      errors.pincode = 'Entered pincode is non-serviceable.';
    }

    setStep2Errors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitError('Please resolve all highlighted fields before proceeding.');
      return false;
    }

    setSubmitError(null);
    return true;
  };

  // Handlers
  const handleNext = () => {
    setSubmitError(null);
    if (activeStep === 0) {
      if (!validateStep1()) return;
      if (isRegisteringNewCustomer) {
        setPincodeInput(newCustPincode.trim());
        setAddressInput(newCustAddress.trim());
        setStateIdInput(newCustStateId);
        setCityIdInput(newCustCityId);
      }
      setActiveStep(1);
    } else if (activeStep === 1) {
      if (!validateStep2()) return;
      setActiveStep(2);
    }
  };

  const handleBack = () => {
    setSubmitError(null);
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
    }
  };

  const handleSubmitComplaint = async (bypassDup = false) => {
    setSubmitError(null);

    const mobileToCheck = isRegisteringNewCustomer ? newCustMobile.trim() : (selectedCustomer?.primaryMobile || '');
    if (!bypassDup && !allowDuplicateProceed && (mobileToCheck || serialNumber.trim())) {
      try {
        const checkRes = await callCenterApi.checkDuplicates({
          mobile: mobileToCheck || undefined,
          serialNumber: serialNumber.trim() || undefined,
          customerId: selectedCustomer?.customerId,
          modelId: selectedModelId,
        });
        if (checkRes.hasDuplicates && checkRes.duplicates.length > 0) {
          setDuplicateJobs(checkRes.duplicates);
          setDuplicateWarningOpen(true);
          return;
        }
      } catch {
        // If duplicate check network fails, proceed gracefully
      }
    }

    const payload: RegisterComplaintPayload = {
      brandId: selectedBrandId,
      productId: selectedProductId,
      modelId: selectedModelId,
      serialNumber: serialNumber.trim() || undefined,
      purchaseDate: purchaseDate || undefined,
      invoiceNo: invoiceNo.trim() || undefined,
      dealerName: dealerName.trim() || undefined,
      callType,
      serviceType,
      vocId: selectedVocId || undefined,
      vocDescription: vocData?.find((v) => v.vocId === selectedVocId)?.vocDescription || undefined,
      problemDescription: problemDescription.trim() || undefined,
      stateId: isRegisteringNewCustomer ? newCustStateId : stateIdInput,
      cityId: isRegisteringNewCustomer ? newCustCityId : cityIdInput,
      pincode: effectivePincode.trim(),
      addressLine: (isRegisteringNewCustomer ? newCustAddress : addressInput).trim(),
      idempotencyKey: idempotencyKeyRef.current,
    };

    if (selectedCustomer) {
      payload.customerId = selectedCustomer.customerId;
    } else if (isRegisteringNewCustomer) {
      payload.newCustomer = {
        fullName: newCustName.trim(),
        primaryMobile: newCustMobile.trim(),
        alternateMobile: newCustAltMobile.trim() || undefined,
        email: newCustEmail.trim() || undefined,
        customerCategory: newCustCategory,
        addressLine: newCustAddress.trim(),
        landmark: newCustLandmark.trim() || undefined,
        stateId: newCustStateId,
        cityId: newCustCityId,
        pincode: newCustPincode.trim(),
      };
    }

    try {
      const res = await registerMutation.mutateAsync(payload);
      setRegisteredResult(res);
      onSuccess(res);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to register service request. Please review the form.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Fast Call Registration Console
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Inbound complaint intake, customer mobile lookup, and automated Job Number creation.
          </Typography>
        </Box>
        <IconButton aria-label="close" onClick={onClose} sx={{ color: (theme) => theme.palette.grey[500] }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {registeredResult ? (
          // ==========================================
          // SUCCESS SCREEN
          // ==========================================
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: '4rem', color: tokens.colors.status.success, mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              Service Request Lodged Successfully!
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              The customer complaint has been registered and confirmed in the operational database.
            </Typography>

            <Paper variant="outlined" sx={{ maxWidth: 480, mx: 'auto', p: 3, mb: 3, borderRadius: 2 }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  ASSIGNED JOB NUMBER
                </Typography>
                <Chip
                  label={registeredResult.serviceRequest.jobNumber}
                  color="primary"
                  sx={{ fontSize: '1.25rem', fontWeight: 700, py: 2.5, px: 2, borderRadius: 2 }}
                />
              </Box>

              <Grid container spacing={1} sx={{ textAlign: 'left', mt: 1 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Customer Name
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {registeredResult.customer.fullName}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Mobile Number
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {registeredResult.customer.primaryMobile}
                  </Typography>
                </Grid>
                <Grid item xs={6} sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Initial Status
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <StatusBadge status={registeredResult.serviceRequest.status} />
                  </Box>
                </Grid>
                <Grid item xs={6} sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Warranty Status
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <StatusBadge status={registeredResult.serviceRequest.warrantyStatus} />
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: tokens.colors.brand.primary }}>
                <SmsIcon fontSize="small" />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  SMS 1 Acknowledgement Queued for Outbound Delivery
                </Typography>
              </Box>
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setRegisteredResult(null);
                  setActiveStep(0);
                  setSelectedCustomer(null);
                  setIsRegisteringNewCustomer(false);
                  setMobileQuery('');
                  idempotencyKeyRef.current = `CALL-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                }}
              >
                Register Another Call
              </Button>
              <Button variant="contained" onClick={onClose}>
                Done
              </Button>
            </Box>
          </Box>
        ) : (
          // ==========================================
          // 3-STEP INTAKE FLOW
          // ==========================================
          <Box>
            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {submitError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {submitError}
              </Alert>
            )}

            {/* STEP 1: CUSTOMER INTAKE */}
            {activeStep === 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Look up Customer by Mobile Number
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  Type a 10-digit mobile number to search for existing registered customer accounts.
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                  <TextField
                    autoFocus
                    placeholder="Enter customer mobile number (e.g. 9820012345)"
                    size="small"
                    fullWidth
                    value={mobileQuery}
                    onChange={(e) => {
                      setMobileQuery(e.target.value);
                      if (selectedCustomer) setSelectedCustomer(null);
                    }}
                    InputProps={{
                      startAdornment: <PhoneIphoneIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                      endAdornment: isSearchingCustomer && <CircularProgress size={20} />,
                    }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<PersonAddIcon />}
                    onClick={() => {
                      setIsRegisteringNewCustomer(true);
                      setSelectedCustomer(null);
                      setNewCustMobile(mobileQuery.trim());
                    }}
                  >
                    New Customer
                  </Button>
                </Box>

                {/* Selected Customer Card */}
                {selectedCustomer && (
                  <Card variant="outlined" sx={{ mb: 3, bgcolor: '#f0fdf4', borderColor: '#86efac' }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {selectedCustomer.fullName}
                            </Typography>
                            <Chip size="small" label={selectedCustomer.customerCode} color="primary" />
                            <Chip size="small" label={selectedCustomer.customerCategory} variant="outlined" />
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            Mobile: {selectedCustomer.primaryMobile} | Email: {selectedCustomer.email || 'N/A'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            <LocationOnIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                            {selectedCustomer.addressLine}, {selectedCustomer.cityName}, {selectedCustomer.stateName} -{' '}
                            {selectedCustomer.pincode}
                          </Typography>
                        </Box>
                        <Button size="small" color="inherit" onClick={() => setSelectedCustomer(null)}>
                          Change
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {/* Matching Results List */}
                {!selectedCustomer && !isRegisteringNewCustomer && customerSearchResults && (
                  <Box sx={{ mb: 3 }}>
                    {customerSearchResults.items.length === 0 && mobileQuery.length >= 4 ? (
                      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', bgcolor: '#f8fafc' }}>
                        <Typography variant="body2" color="text.secondary">
                          No existing customer found matching &quot;{mobileQuery}&quot;.
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<PersonAddIcon />}
                          sx={{ mt: 1.5 }}
                          onClick={() => {
                            setIsRegisteringNewCustomer(true);
                            setNewCustMobile(mobileQuery.trim());
                          }}
                        >
                          Register New Customer
                        </Button>
                      </Paper>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {customerSearchResults.items.map((cust) => (
                          <Paper
                            key={cust.customerId}
                            variant="outlined"
                            sx={{
                              p: 2,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: 'pointer',
                              '&:hover': { bgcolor: '#f8fafc', borderColor: 'primary.main' },
                            }}
                            onClick={() => setSelectedCustomer(cust)}
                          >
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                  {cust.fullName}
                                </Typography>
                                <Chip size="small" label={cust.customerCode} />
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {cust.primaryMobile} | {cust.addressLine}, {cust.cityName} - {cust.pincode}
                              </Typography>
                            </Box>
                            <Button size="small" variant="outlined">
                              Select
                            </Button>
                          </Paper>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}

                {/* New Customer Inline Form */}
                {isRegisteringNewCustomer && (
                  <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Register New Customer Account
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          setIsRegisteringNewCustomer(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Full Name"
                          size="small"
                          fullWidth
                          required
                          inputRef={newCustNameRef}
                          value={newCustName}
                          error={Boolean(step1Errors.name)}
                          helperText={step1Errors.name || 'Full legal or commercial name'}
                          onChange={(e) => {
                            setNewCustName(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, name: '' }));
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Customer Category"
                          size="small"
                          select
                          fullWidth
                          value={newCustCategory}
                          onChange={(e) => setNewCustCategory(e.target.value as any)}
                        >
                          <MenuItem value="INDIVIDUAL">Individual Customer</MenuItem>
                          <MenuItem value="COMMERCIAL">Commercial / Business</MenuItem>
                          <MenuItem value="CORPORATE">Corporate Account</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Primary Mobile (10 Digits)"
                          size="small"
                          fullWidth
                          required
                          inputRef={newCustMobileRef}
                          value={newCustMobile}
                          error={Boolean(step1Errors.mobile)}
                          helperText={
                            step1Errors.mobile || 'Standard Indian 10-digit number (must begin with 6, 7, 8, or 9)'
                          }
                          onChange={(e) => {
                            setNewCustMobile(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, mobile: '' }));
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Alternate Mobile (Optional)"
                          size="small"
                          fullWidth
                          inputRef={newCustAltMobileRef}
                          value={newCustAltMobile}
                          error={Boolean(step1Errors.altMobile)}
                          helperText={step1Errors.altMobile || 'Optional secondary mobile'}
                          onChange={(e) => {
                            setNewCustAltMobile(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, altMobile: '' }));
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Email Address (Optional)"
                          size="small"
                          fullWidth
                          type="email"
                          inputRef={newCustEmailRef}
                          value={newCustEmail}
                          error={Boolean(step1Errors.email)}
                          helperText={step1Errors.email || 'Optional email for digital invoice & status'}
                          onChange={(e) => {
                            setNewCustEmail(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, email: '' }));
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Landmark (Optional)"
                          size="small"
                          fullWidth
                          value={newCustLandmark}
                          helperText="Optional landmark or building identifier"
                          onChange={(e) => setNewCustLandmark(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Address Line"
                          size="small"
                          fullWidth
                          required
                          inputRef={newCustAddressRef}
                          value={newCustAddress}
                          error={Boolean(step1Errors.address)}
                          helperText={step1Errors.address || 'Street address / premises'}
                          onChange={(e) => {
                            setNewCustAddress(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, address: '' }));
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="State"
                          size="small"
                          select
                          fullWidth
                          required
                          inputRef={newCustStateRef}
                          value={newCustStateId}
                          error={Boolean(step1Errors.stateId)}
                          helperText={step1Errors.stateId}
                          onChange={(e) => {
                            setNewCustStateId(e.target.value);
                            setNewCustCityId('');
                            setStep1Errors((prev) => ({ ...prev, stateId: '', cityId: '' }));
                          }}
                        >
                          {(statesData?.items || []).map((s) => (
                            <MenuItem key={s.stateId} value={s.stateId}>
                              {s.stateName}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="City"
                          size="small"
                          select
                          fullWidth
                          required
                          disabled={!newCustStateId}
                          inputRef={newCustCityRef}
                          value={newCustCityId}
                          error={Boolean(step1Errors.cityId)}
                          helperText={step1Errors.cityId}
                          onChange={(e) => {
                            setNewCustCityId(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, cityId: '' }));
                          }}
                        >
                          {(citiesData?.items || []).map((c) => (
                            <MenuItem key={c.cityId} value={c.cityId}>
                              {c.cityName}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Pincode (6 Digits)"
                          size="small"
                          fullWidth
                          required
                          inputRef={newCustPincodeRef}
                          value={newCustPincode}
                          error={Boolean(step1Errors.pincode)}
                          helperText={
                            step1Errors.pincode ||
                            (serviceabilityData?.isServiceable
                              ? `Serviceable (${serviceabilityData.cityName}, ${serviceabilityData.stateName})`
                              : '6-digit postal code')
                          }
                          onChange={(e) => {
                            setNewCustPincode(e.target.value);
                            setStep1Errors((prev) => ({ ...prev, pincode: '' }));
                          }}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                )}
              </Box>
            )}

            {/* STEP 2: PRODUCT & COMPLAINT DIAGNOSTICS */}
            {activeStep === 1 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Product Model & Service Diagnostics
                </Typography>

                <Grid container spacing={2}>
                  {/* Brand Selector */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Brand"
                      size="small"
                      select
                      fullWidth
                      required
                      value={selectedBrandId}
                      onChange={(e) => {
                        setSelectedBrandId(e.target.value);
                        setSelectedModelId('');
                      }}
                    >
                      {(brandsData?.items || []).map((b) => (
                        <MenuItem key={b.brandId} value={b.brandId}>
                          {b.brandName} ({b.brandCode})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  {/* Product Category Selector */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Product Category"
                      size="small"
                      select
                      fullWidth
                      required
                      value={selectedProductId}
                      onChange={(e) => {
                        setSelectedProductId(e.target.value);
                        setSelectedModelId('');
                      }}
                    >
                      {(productsData?.items || []).map((p) => (
                        <MenuItem key={p.productId} value={p.productId}>
                          {p.productName} ({p.productCode})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  {/* Model Selector */}
                  <Grid item xs={12}>
                    <TextField
                      label="Product Model"
                      size="small"
                      select
                      fullWidth
                      required
                      disabled={!selectedBrandId || !selectedProductId}
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      helperText={
                        !selectedBrandId || !selectedProductId
                          ? 'Select Brand and Product Category first'
                          : selectedModel
                          ? `Model Code: ${selectedModel.modelCode} | Warranty: ${selectedModel.customerWarrantyDays} Days`
                          : undefined
                      }
                    >
                      {(modelsData?.items || []).map((m) => (
                        <MenuItem key={m.modelId} value={m.modelId} disabled={m.isJobCreationAllowed !== 'Y'}>
                          {m.modelName} ({m.modelCode}) {m.isJobCreationAllowed !== 'Y' ? '- [Intake Disabled]' : ''}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  {/* Serial Number with live length requirement */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Product Serial Number"
                      size="small"
                      fullWidth
                      required={selectedModel?.checkSerialNumber === 'Y'}
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                      error={Boolean(selectedModel && selectedModel.checkSerialNumber === 'Y' && !isSerialValid)}
                      helperText={
                        selectedModel?.checkSerialNumber === 'Y'
                          ? `Required length: ${selectedModel.serialNumberLength} characters (Current: ${serialNumber.length})`
                          : 'Optional for this model'
                      }
                    />
                  </Grid>

                  {/* Purchase Date & Live Warranty */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Purchase Invoice Date"
                      type="date"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      helperText={
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          Status: <StatusBadge status={estimatedWarranty} />
                        </Box>
                      }
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Invoice Number"
                      size="small"
                      fullWidth
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Dealer / Retailer Name"
                      size="small"
                      fullWidth
                      value={dealerName}
                      onChange={(e) => setDealerName(e.target.value)}
                    />
                  </Grid>

                  {/* Call Type & Service Type */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Call Type"
                      size="small"
                      select
                      fullWidth
                      required
                      value={callType}
                      onChange={(e) => setCallType(e.target.value as any)}
                    >
                      <MenuItem value="REPAIR">Repair Service</MenuItem>
                      <MenuItem value="INSTALLATION">Installation</MenuItem>
                      <MenuItem value="DEMO">Product Demonstration</MenuItem>
                      <MenuItem value="MAINTENANCE">Periodic Maintenance</MenuItem>
                    </TextField>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Service Type"
                      size="small"
                      select
                      fullWidth
                      required
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value as any)}
                    >
                      <MenuItem value="ON_SITE">On-Site Visit</MenuItem>
                      <MenuItem value="CARRY_IN">Carry-In to Center</MenuItem>
                      <MenuItem value="PICK_UP">Unit Pick-Up</MenuItem>
                    </TextField>
                  </Grid>

                  {/* VOC Category */}
                  <Grid item xs={12}>
                    <TextField
                      label="Voice of Customer (VOC) / Problem Type"
                      size="small"
                      select
                      fullWidth
                      value={selectedVocId}
                      onChange={(e) => setSelectedVocId(e.target.value)}
                    >
                      {(vocData || []).map((v) => (
                        <MenuItem key={v.vocId} value={v.vocId}>
                          {v.vocDescription} ({v.category})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  {/* Problem Description */}
                  <Grid item xs={12}>
                    <TextField
                      label="Customer Problem Observations"
                      size="small"
                      fullWidth
                      multiline
                      rows={2}
                      placeholder="Detailed symptoms, error codes, or customer remarks..."
                      value={problemDescription}
                      onChange={(e) => setProblemDescription(e.target.value)}
                    />
                  </Grid>

                  {/* Pincode & Serviceability Banner */}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ mt: 1 }}>
                      {isCheckingServiceability ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="caption">Checking geography serviceability...</Typography>
                        </Box>
                      ) : serviceabilityData ? (
                        serviceabilityData.isServiceable ? (
                          <Alert severity="success" sx={{ py: 0.5 }}>
                            <strong>Serviceable Pincode {effectivePincode}</strong> ({serviceabilityData.cityName},{' '}
                            {serviceabilityData.stateName}) —{' '}
                            {serviceabilityData.defaultAsfName
                              ? `Assigned ASF: ${serviceabilityData.defaultAsfName}`
                              : 'Serviceable (Unassigned Routing)'}
                          </Alert>
                        ) : (
                          <Alert severity="error" sx={{ py: 0.5 }}>
                            Pincode {effectivePincode} is non-serviceable. Complaint cannot be registered for this
                            pincode.
                          </Alert>
                        )
                      ) : null}
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* STEP 3: REVIEW & REGISTER */}
            {activeStep === 2 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Review Complaint Summary
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Verify all details before persisting. A unique Job Number will be generated atomically upon
                  submission.
                </Typography>

                <Grid container spacing={2}>
                  {/* Customer Information Card */}
                  <Grid item xs={12} sm={6}>
                    <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        CUSTOMER DETAILS
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedCustomer ? selectedCustomer.fullName : newCustName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Mobile: {selectedCustomer ? selectedCustomer.primaryMobile : newCustMobile}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Category: {selectedCustomer ? selectedCustomer.customerCategory : newCustCategory}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {selectedCustomer ? selectedCustomer.addressLine : newCustAddress}
                      </Typography>
                    </Paper>
                  </Grid>

                  {/* Product & Service Details */}
                  <Grid item xs={12} sm={6}>
                    <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        PRODUCT & SERVICE
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedModel?.modelName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Model Code: {selectedModel?.modelCode} | Serial: {serialNumber || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Call: {callType} | Mode: {serviceType}
                      </Typography>
                      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption">Warranty:</Typography>
                        <StatusBadge status={estimatedWarranty} />
                      </Box>
                    </Paper>
                  </Grid>

                  {/* SMS 1 Notification Preview */}
                  <Grid item xs={12}>
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, borderStyle: 'dashed' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <SmsIcon fontSize="small" color="primary" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Outbound Acknowledgement Preview (SMS 1)
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                        &quot;Dear Customer, We have registered your service request #[GENERATED_JOB_NUMBER]. You will
                        receive a call from our service technician soon.&quot;
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        Recipient: {selectedCustomer ? selectedCustomer.primaryMobile : newCustMobile}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      {!registeredResult && (
        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {activeStep > 0 && (
              <Button onClick={handleBack} startIcon={<ArrowBackIcon />}>
                Back
              </Button>
            )}

            {activeStep < STEPS.length - 1 ? (
              <Button
                variant="contained"
                onClick={handleNext}
                endIcon={<ArrowForwardIcon />}
                disabled={registerMutation.isPending}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={() => handleSubmitComplaint(false)}
                disabled={registerMutation.isPending}
                startIcon={registerMutation.isPending && <CircularProgress size={16} color="inherit" />}
              >
                {registerMutation.isPending ? 'Persisting...' : 'Confirm & Register'}
              </Button>
            )}
          </Box>
        </DialogActions>
      )}

      {/* Duplicate Open Complaints Warning Dialog */}
      <Dialog
        open={duplicateWarningOpen}
        onClose={() => setDuplicateWarningOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main', fontWeight: 700 }}>
          Potential Duplicate Complaint Warning
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Open service requests already exist for this customer mobile or serial number. Please review the existing tickets below.
          </Alert>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {duplicateJobs.map((dup) => (
              <Card key={dup.requestId} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    #{dup.jobNumber}
                  </Typography>
                  <StatusBadge status={dup.status} />
                </Box>
                <Typography variant="body2">
                  {dup.brandName} • {dup.productName} ({dup.modelName})
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Registered: {new Date(dup.registeredAt).toLocaleDateString()} • {dup.assignedLocationName || 'Unassigned'}
                </Typography>
                {dup.serialNumber && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Serial: {dup.serialNumber}
                  </Typography>
                )}
              </Card>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button variant="outlined" onClick={() => setDuplicateWarningOpen(false)}>
            Review Current Input
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setAllowDuplicateProceed(true);
              setDuplicateWarningOpen(false);
              handleSubmitComplaint(true);
            }}
          >
            Proceed Anyway (Legitimate Repeat Call)
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
