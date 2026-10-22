'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';

// Icons
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddCardIcon from '@mui/icons-material/AddCard';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import GavelIcon from '@mui/icons-material/Gavel';
import HistoryIcon from '@mui/icons-material/History';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PaymentsIcon from '@mui/icons-material/Payments';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { PageHeader } from '../../../components/data-display/PageHeader';
import { ProtectedRoute } from '../../../components/layout/ProtectedRoute';
import { useAuth } from '../../../providers/AuthProvider';

import {
  BrandWallet,
  FinancialJournal,
  ServiceClaim,
  SlaPenalty,
  WalletTransaction,
  useBrandWallets,
  useDecideWalletTransaction,
  useFinanceOverviewKpis,
  useFinancialJournals,
  useServiceClaims,
  useSettlementBatches,
  useSlaPenalties,
  useWalletTransactions,
} from '../../../lib/financeApi';

import { AddPaymentModal } from './components/AddPaymentModal';
import { ClaimAuditModal } from './components/ClaimAuditModal';
import { GenerateClaimModal } from './components/GenerateClaimModal';
import { JournalDetailsModal } from './components/JournalDetailsModal';
import { PenaltyReviewModal } from './components/PenaltyReviewModal';
import { ReconciliationModal } from './components/ReconciliationModal';
import { SettlementModal } from './components/SettlementModal';

export default function FinancePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<number>(0);

  // Modal states
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [selectedBrandForDeposit, setSelectedBrandForDeposit] = useState<string | undefined>();

  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconBrand, setReconBrand] = useState<{ id: string; name?: string } | null>(null);

  const [auditClaimOpen, setAuditClaimOpen] = useState(false);
  const [auditClaimId, setAuditClaimId] = useState<string | undefined>();

  const [generateClaimOpen, setGenerateClaimOpen] = useState(false);

  const [penaltyReviewOpen, setPenaltyReviewOpen] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<SlaPenalty | null>(null);

  const [settlementOpen, setSettlementOpen] = useState(false);

  const [journalDetailsOpen, setJournalDetailsOpen] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | undefined>();

  // Overview KPIs
  const { data: kpis, isLoading: loadingKpis, refetch: refetchKpis } = useFinanceOverviewKpis();

  // Tab 0: Brand Wallets & Transactions
  const [walletSearch, setWalletSearch] = useState('');
  const [walletPage, setWalletPage] = useState(0);
  const { data: walletsData, isLoading: loadingWallets, refetch: refetchWallets } = useBrandWallets({
    search: walletSearch || undefined,
    page: walletPage + 1,
    limit: 10,
  });

  const [txnPage, setTxnPage] = useState(0);
  const { data: txnsData, isLoading: loadingTxns, refetch: refetchTxns } = useWalletTransactions({
    page: txnPage + 1,
    limit: 10,
  });

  const decideTxnMutation = useDecideWalletTransaction();

  // Tab 1: Service Claims
  const [claimsSearch, setClaimsSearch] = useState('');
  const [claimsPage, setClaimsPage] = useState(0);
  const { data: claimsData, isLoading: loadingClaims, refetch: refetchClaims } = useServiceClaims({
    search: claimsSearch || undefined,
    page: claimsPage + 1,
    limit: 10,
  });

  // Tab 2: General Ledger Journals
  const [journalSearch, setJournalSearch] = useState('');
  const [journalPage, setJournalPage] = useState(0);
  const { data: journalsData, isLoading: loadingJournals, refetch: refetchJournals } = useFinancialJournals({
    search: journalSearch || undefined,
    page: journalPage + 1,
    limit: 10,
  });

  // Tab 3: SLA Penalties
  const [penaltyPage, setPenaltyPage] = useState(0);
  const { data: penaltiesData, isLoading: loadingPenalties, refetch: refetchPenalties } = useSlaPenalties({
    page: penaltyPage + 1,
    limit: 10,
  });

  // Tab 4: Settlements
  const [settlementPage, setSettlementPage] = useState(0);
  const { data: settlementsData, isLoading: loadingSettlements, refetch: refetchSettlements } = useSettlementBatches({
    page: settlementPage + 1,
    limit: 10,
  });

  const allWallets = walletsData?.items || [];

  const handleOpenAddPayment = (brandId?: string) => {
    setSelectedBrandForDeposit(brandId);
    setAddPaymentOpen(true);
  };

  const handleOpenReconcile = (wallet: BrandWallet) => {
    setReconBrand({ id: wallet.brandId, name: wallet.brandName || wallet.brandCode });
    setReconcileOpen(true);
  };

  const handleOpenAudit = (claim: ServiceClaim) => {
    setAuditClaimId(claim.claimId);
    setAuditClaimOpen(true);
  };

  const handleOpenPenaltyReview = (penalty: SlaPenalty) => {
    setSelectedPenalty(penalty);
    setPenaltyReviewOpen(true);
  };

  const handleOpenJournalDetails = (journal: FinancialJournal) => {
    setSelectedJournalId(journal.journalId);
    setJournalDetailsOpen(true);
  };

  const handleDecideTxn = async (transactionId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      await decideTxnMutation.mutateAsync({
        transactionId,
        body: { action },
      });
      refetchTxns();
      refetchWallets();
      refetchKpis();
    } catch (err: any) {
      alert(err.message || `Failed to ${action.toLowerCase()} transaction.`);
    }
  };

  return (
    <ProtectedRoute requiredPermission="finance:read">
      <Box sx={{ width: '100%', pb: 6 }}>
        {/* Page Header */}
        <PageHeader
          title="Finance & Brand Wallets Hub"
          subtitle="Prepaid warranty reserves, claims auditing, double-entry general ledger & franchise settlements"
          actions={
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  refetchKpis();
                  refetchWallets();
                  refetchTxns();
                  refetchClaims();
                  refetchJournals();
                  refetchPenalties();
                  refetchSettlements();
                }}
              >
                Refresh All
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddCardIcon />}
                onClick={() => handleOpenAddPayment()}
              >
                Add Payment in Wallet
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FactCheckIcon />}
                onClick={() => setGenerateClaimOpen(true)}
              >
                Generate Claim Batch
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<PaymentsIcon />}
                onClick={() => setSettlementOpen(true)}
              >
                Franchisee Settlement
              </Button>
            </Box>
          }
        />

        {/* Top KPI Metrics Row */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  PREPAID RESERVES
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, color: 'primary.main' }}>
                  {loadingKpis ? (
                    <CircularProgress size={16} />
                  ) : (
                    `₹${(kpis?.totalWalletReserves || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {kpis?.activeBrandWalletsCount || 0} active brand wallets
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  PENDING CLAIMS
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, color: 'warning.main' }}>
                  {loadingKpis ? (
                    <CircularProgress size={16} />
                  ) : (
                    `₹${(kpis?.pendingClaimsAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {kpis?.pendingClaimsCount || 0} batches in audit queue
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  PAYABLES LIABILITY
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, color: 'info.main' }}>
                  {loadingKpis ? (
                    <CircularProgress size={16} />
                  ) : (
                    `₹${(kpis?.approvedPayablesLiability || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Approved ASF Payables (2020)
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  GENERAL LEDGER
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>
                  {loadingKpis ? (
                    <CircularProgress size={16} />
                  ) : (
                    `${kpis?.postedJournalsCount || 0} Posted`
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Double-entry balanced
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  UNBALANCED EXCEPTIONS
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <CheckCircleOutlineIcon color="success" sx={{ fontSize: 20 }} />
                  <Typography variant="h6" fontWeight={700} color="success.main">
                    {kpis?.unbalancedJournalsCount || 0}
                  </Typography>
                </Box>
                <Typography variant="caption" color="success.dark">
                  Strict invariant maintained
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  SLA BREACH REVIEWS
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, color: 'text.primary' }}>
                  {loadingKpis ? (
                    <CircularProgress size={16} />
                  ) : (
                    `₹${(kpis?.pendingPenaltiesAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {kpis?.pendingPenaltiesCount || 0} pending review
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tab Navigation */}
        <Paper variant="outlined" sx={{ mb: 2.5 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab icon={<AccountBalanceWalletIcon fontSize="small" />} iconPosition="start" label="Brand Wallets & Deposits" />
            <Tab icon={<FactCheckIcon fontSize="small" />} iconPosition="start" label="Service Claims Queue" />
            <Tab icon={<MenuBookIcon fontSize="small" />} iconPosition="start" label="General Ledger & Journals" />
            <Tab icon={<GavelIcon fontSize="small" />} iconPosition="start" label="SLA Penalties Review" />
            <Tab icon={<PaymentsIcon fontSize="small" />} iconPosition="start" label="Settlement Disbursements" />
          </Tabs>
        </Paper>

        {/* ==================================================================== */}
        {/* TAB 0: BRAND WALLETS & TRANSACTIONS */}
        {/* ==================================================================== */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Wallets Table */}
            <Card variant="outlined">
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Prepaid Brand Warranty Wallets
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Authorized warranty escrow funds deposited by brand partners
                  </Typography>
                </Box>
                <TextField
                  placeholder="Search brand..."
                  size="small"
                  value={walletSearch}
                  onChange={(e) => setWalletSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ width: 240 }}
                />
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Brand Name</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Brand Code</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Current Balance (₹)</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Total Deposited (₹)</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Claims Debited (₹)</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loadingWallets ? (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                          <CircularProgress size={24} />
                        </TableCell>
                      </TableRow>
                    ) : allWallets.length > 0 ? (
                      allWallets.map((wallet) => {
                        const isLow = wallet.currentBalance < wallet.lowBalanceThreshold;
                        return (
                          <TableRow key={wallet.walletId} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{wallet.brandName || 'Brand Partner'}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace' }}>{wallet.brandCode}</TableCell>
                            <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75 }}>
                                {isLow && (
                                  <Tooltip title="Low Balance: Below ₹10,000 threshold">
                                    <WarningAmberIcon color="warning" sx={{ fontSize: 16 }} />
                                  </Tooltip>
                                )}
                                <Typography
                                  component="span"
                                  fontWeight={700}
                                  color={isLow ? 'warning.main' : 'text.primary'}
                                >
                                  ₹{wallet.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              ₹{wallet.totalDeposited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              ₹{wallet.totalClaimDebited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={wallet.status}
                                color={wallet.status === 'ACTIVE' ? 'success' : 'default'}
                                sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                              />
                            </TableCell>
                            <TableCell sx={{ textAlign: 'right' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                sx={{ mr: 1, fontSize: '0.75rem', py: 0.25 }}
                                onClick={() => handleOpenAddPayment(wallet.brandId)}
                              >
                                Add Payment
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="info"
                                sx={{ fontSize: '0.75rem', py: 0.25 }}
                                onClick={() => handleOpenReconcile(wallet)}
                              >
                                Reconcile
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                          No brand wallets found matching criteria.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={walletsData?.total || 0}
                page={walletPage}
                onPageChange={(_, p) => setWalletPage(p)}
                rowsPerPage={10}
                rowsPerPageOptions={[10]}
              />
            </Card>

            {/* Wallet Transactions Table (Legacy Slide 21) */}
            <Card variant="outlined">
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Brand Wallet Transactions Ledger & Approvals
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Deposit submissions, warranty claim deductions & payment authorizations (Slide 21)
                  </Typography>
                </Box>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Txn Number</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Brand</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Mode / UTR</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Amount (₹)</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loadingTxns ? (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                          <CircularProgress size={24} />
                        </TableCell>
                      </TableRow>
                    ) : (txnsData?.items || []).length > 0 ? (
                      (txnsData?.items || []).map((txn) => (
                        <TableRow key={txn.transactionId} hover>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{txn.transactionNumber}</TableCell>
                          <TableCell>{new Date(txn.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>{txn.brandName || 'Brand'}</TableCell>
                          <TableCell>
                            <Chip size="small" variant="outlined" label={txn.transactionType} sx={{ fontSize: '0.6875rem' }} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{txn.paymentMode || 'SYSTEM'}</Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                              {txn.referenceNumber}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            <Typography
                              component="span"
                              fontWeight={700}
                              color={txn.transactionType === 'DEPOSIT' ? 'success.main' : 'error.main'}
                            >
                              {txn.transactionType === 'DEPOSIT' ? '+' : '-'}₹{txn.amount.toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={txn.status}
                              color={txn.status === 'POSTED' || txn.status === 'APPROVED' ? 'success' : txn.status === 'PENDING_APPROVAL' ? 'warning' : 'default'}
                              sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            {txn.status === 'PENDING_APPROVAL' && (
                              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75 }}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  sx={{ fontSize: '0.75rem', py: 0.25 }}
                                  onClick={() => handleDecideTxn(txn.transactionId, 'APPROVE')}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  sx={{ fontSize: '0.75rem', py: 0.25 }}
                                  onClick={() => handleDecideTxn(txn.transactionId, 'REJECT')}
                                >
                                  Reject
                                </Button>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                          No transactions recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={txnsData?.total || 0}
                page={txnPage}
                onPageChange={(_, p) => setTxnPage(p)}
                rowsPerPage={10}
                rowsPerPageOptions={[10]}
              />
            </Card>
          </Box>
        )}

        {/* ==================================================================== */}
        {/* TAB 1: SERVICE CLAIMS QUEUE & AUDITING */}
        {/* ==================================================================== */}
        {activeTab === 1 && (
          <Card variant="outlined">
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Service Labor & Travel Claims Queue
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Audited monthly batches submitted by Authorised Service Franchisees (ASF)
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  placeholder="Search claim..."
                  size="small"
                  value={claimsSearch}
                  onChange={(e) => setClaimsSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ width: 240 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FactCheckIcon />}
                  onClick={() => setGenerateClaimOpen(true)}
                >
                  Generate Claim Batch
                </Button>
              </Box>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Claim Number</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Franchise</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Brand</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Jobs</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Gross Labor (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Travel (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Net Claim (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingClaims ? (
                    <TableRow>
                      <TableCell colSpan={10} sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : (claimsData?.items || []).length > 0 ? (
                    (claimsData?.items || []).map((claim) => (
                      <TableRow key={claim.claimId} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{claim.claimNumber}</TableCell>
                        <TableCell>{claim.asfLocationName || claim.asfLocationId}</TableCell>
                        <TableCell>{claim.brandName || 'Skatercat'}</TableCell>
                        <TableCell>{claim.claimMonth}/{claim.claimYear}</TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>{claim.totalJobsCount}</TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          ₹{claim.grossLaborAmount.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          ₹{claim.grossTravelAmount.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          ₹{claim.netClaimAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={claim.status}
                            color={claim.status === 'POSTED' || claim.status === 'APPROVED' ? 'success' : claim.status === 'SUBMITTED' ? 'warning' : 'default'}
                            sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          <Button
                            size="small"
                            variant={claim.status === 'SUBMITTED' ? 'contained' : 'outlined'}
                            color={claim.status === 'SUBMITTED' ? 'primary' : 'inherit'}
                            sx={{ fontSize: '0.75rem', py: 0.25 }}
                            onClick={() => handleOpenAudit(claim)}
                          >
                            {claim.status === 'SUBMITTED' ? 'Audit & Decide' : 'Inspect'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                        No claims found matching current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={claimsData?.total || 0}
              page={claimsPage}
              onPageChange={(_, p) => setClaimsPage(p)}
              rowsPerPage={10}
              rowsPerPageOptions={[10]}
            />
          </Card>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: GENERAL LEDGER & DOUBLE-ENTRY JOURNALS */}
        {/* ==================================================================== */}
        {activeTab === 2 && (
          <Card variant="outlined">
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  General Ledger (Double-Entry Balanced Journals)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Append-only immutable financial records with strict database-level balanced invariants
                </Typography>
              </Box>
              <TextField
                placeholder="Search journals..."
                size="small"
                value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 240 }}
              />
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Journal Number</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Posting Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Journal Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Total Debit (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Total Credit (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Balanced</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingJournals ? (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : (journalsData?.items || []).length > 0 ? (
                    (journalsData?.items || []).map((journal) => {
                      const isBalanced = journal.totalDebit === journal.totalCredit;
                      return (
                        <TableRow key={journal.journalId} hover>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{journal.journalNumber}</TableCell>
                          <TableCell>{new Date(journal.postingDate).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Chip size="small" variant="outlined" label={journal.journalType} sx={{ fontSize: '0.6875rem' }} />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 280, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {journal.description}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            ₹{journal.totalDebit.toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            ₹{journal.totalCredit.toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            {isBalanced ? (
                              <CheckCircleOutlineIcon color="success" sx={{ fontSize: 18 }} />
                            ) : (
                              <WarningAmberIcon color="error" sx={{ fontSize: 18 }} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={journal.status}
                              color={journal.status === 'POSTED' ? 'success' : 'default'}
                              sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenJournalDetails(journal)}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                        No general ledger journals found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={journalsData?.total || 0}
              page={journalPage}
              onPageChange={(_, p) => setJournalPage(p)}
              rowsPerPage={10}
              rowsPerPageOptions={[10]}
            />
          </Card>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: SLA PENALTIES REVIEW */}
        {/* ==================================================================== */}
        {activeTab === 3 && (
          <Card variant="outlined">
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                SLA Penalties & Replacement Deductions Review
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Controlled determination engine — no automated debits without explicit human authorization
              </Typography>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Penalty #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Job Number</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Franchise</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Breach Type</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Calculated Amount (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Reviewer</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingPenalties ? (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : (penaltiesData?.items || []).length > 0 ? (
                    (penaltiesData?.items || []).map((penalty) => (
                      <TableRow key={penalty.penaltyId} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{penalty.penaltyNumber}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{penalty.jobNumber || penalty.serviceRequestId}</TableCell>
                        <TableCell>{penalty.asfLocationName || penalty.asfLocationId}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" label={penalty.breachType} sx={{ fontSize: '0.6875rem' }} />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'error.main' }}>
                          ₹{penalty.calculatedAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={penalty.status}
                            color={penalty.status === 'APPROVED' ? 'error' : penalty.status === 'WAIVED' ? 'success' : penalty.status === 'PENDING_REVIEW' ? 'warning' : 'default'}
                            sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>{penalty.reviewedByUsername || '-'}</TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          {penalty.status === 'PENDING_REVIEW' && (
                            <Button
                              size="small"
                              variant="contained"
                              sx={{ fontSize: '0.75rem', py: 0.25 }}
                              onClick={() => handleOpenPenaltyReview(penalty)}
                            >
                              Review & Decide
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                        No SLA breach records currently pending review.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={penaltiesData?.total || 0}
              page={penaltyPage}
              onPageChange={(_, p) => setPenaltyPage(p)}
              rowsPerPage={10}
              rowsPerPageOptions={[10]}
            />
          </Card>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: SETTLEMENT DISBURSEMENTS */}
        {/* ==================================================================== */}
        {activeTab === 4 && (
          <Card variant="outlined">
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Franchisee Settlement Disbursements
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Consolidated payout disbursements clearing ASF Payable liabilities (2020) via banking rail
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                startIcon={<PaymentsIcon />}
                onClick={() => setSettlementOpen(true)}
              >
                Create Settlement Batch
              </Button>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Settlement #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Disbursement Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Franchise</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Mode / UTR</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Claims Count</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Disbursed Amount (₹)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingSettlements ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : (settlementsData?.items || []).length > 0 ? (
                    (settlementsData?.items || []).map((batch) => (
                      <TableRow key={batch.settlementId} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{batch.settlementNumber}</TableCell>
                        <TableCell>{new Date(batch.settlementDate).toLocaleDateString()}</TableCell>
                        <TableCell>{batch.asfLocationName || batch.asfLocationId}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{batch.paymentMode}</Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                            {batch.paymentReference}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace' }}>{batch.totalClaimsCount}</TableCell>
                        <TableCell sx={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          ₹{batch.totalPayableAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={batch.status}
                            color={batch.status === 'DISBURSED' ? 'success' : 'default'}
                            sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                        No settlement disbursement batches recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={settlementsData?.total || 0}
              page={settlementPage}
              onPageChange={(_, p) => setSettlementPage(p)}
              rowsPerPage={10}
              rowsPerPageOptions={[10]}
            />
          </Card>
        )}

        {/* Dialog Modals */}
        <AddPaymentModal
          open={addPaymentOpen}
          onClose={() => {
            setAddPaymentOpen(false);
            refetchWallets();
            refetchTxns();
            refetchKpis();
          }}
          wallets={allWallets}
          preselectedBrandId={selectedBrandForDeposit}
        />

        <ReconciliationModal
          open={reconcileOpen}
          onClose={() => setReconcileOpen(false)}
          brandId={reconBrand?.id}
          brandName={reconBrand?.name}
        />

        <ClaimAuditModal
          open={auditClaimOpen}
          onClose={() => {
            setAuditClaimOpen(false);
            refetchClaims();
            refetchWallets();
            refetchKpis();
          }}
          claimId={auditClaimId}
        />

        <GenerateClaimModal
          open={generateClaimOpen}
          onClose={() => {
            setGenerateClaimOpen(false);
            refetchClaims();
            refetchKpis();
          }}
          wallets={allWallets}
        />

        <PenaltyReviewModal
          open={penaltyReviewOpen}
          onClose={() => {
            setPenaltyReviewOpen(false);
            refetchPenalties();
            refetchKpis();
          }}
          penalty={selectedPenalty}
        />

        <SettlementModal
          open={settlementOpen}
          onClose={() => {
            setSettlementOpen(false);
            refetchSettlements();
            refetchClaims();
            refetchKpis();
          }}
        />

        <JournalDetailsModal
          open={journalDetailsOpen}
          onClose={() => {
            setJournalDetailsOpen(false);
            refetchJournals();
            refetchKpis();
          }}
          journalId={selectedJournalId}
        />
      </Box>
    </ProtectedRoute>
  );
}
