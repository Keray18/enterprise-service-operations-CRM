'use client';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { triggerBlobDownload } from '../../../../../lib/apiClient';
import {
  BulkImportCommitResult,
  BulkImportEntityType,
  BulkImportMode,
  BulkImportPreviewRow,
  BulkImportPreviewSummary,
  useCommitImport,
  useDownloadImportReport,
  useDownloadImportTemplate,
  usePreviewImport,
} from '../../../../../lib/catalogApi';

interface BulkImportDialogProps {
  open: boolean;
  entityType: BulkImportEntityType;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const STEPS = ['Upload File', 'Preview & Validation', 'Import Outcome'];

export function BulkImportDialog({ open, entityType, onClose, onSuccess }: BulkImportDialogProps) {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [mode, setMode] = useState<BulkImportMode>('CREATE_ONLY');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // Preview & Result states
  const [previewSummary, setPreviewSummary] = useState<BulkImportPreviewSummary | null>(null);
  const [commitResult, setCommitResult] = useState<BulkImportCommitResult | null>(null);
  const [filterTab, setFilterTab] = useState<'ALL' | 'ERRORS' | 'CREATES' | 'UPDATES'>('ALL');
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // Mutations
  const downloadTemplate = useDownloadImportTemplate();
  const previewMutation = usePreviewImport();
  const commitMutation = useCommitImport();
  const downloadReport = useDownloadImportReport();

  const entityTitle = entityType === 'MODEL' ? 'Model Masters' : 'Part Code Masters';

  const handleReset = () => {
    setActiveStep(0);
    setSelectedFile(null);
    setPreviewSummary(null);
    setCommitResult(null);
    setClientError(null);
    setFilterTab('ALL');
    setPage(0);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Step 1: Download Template
  const handleDownloadTemplate = async () => {
    try {
      setClientError(null);
      const blob = await downloadTemplate.mutateAsync(entityType);
      const filename = entityType === 'MODEL' ? 'model_import_template_v1.xlsx' : 'part_import_template_v1.xlsx';
      triggerBlobDownload(blob, filename);
    } catch (err: any) {
      setClientError(err?.message || 'Failed to download template. Please try again.');
    }
  };

  // Step 1: Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setClientError('Invalid file type. Please upload a Microsoft Excel (.xlsx) file.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setClientError('File size exceeds the 5 MB limit.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setClientError(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setClientError('Invalid file type. Please upload a Microsoft Excel (.xlsx) file.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setClientError('File size exceeds the 5 MB limit.');
        return;
      }
      setSelectedFile(file);
    }
  };

  // Step 1 -> Step 2: Trigger Preview
  const handleStartValidation = async () => {
    if (!selectedFile) {
      setClientError('Please select an .xlsx file to upload.');
      return;
    }

    try {
      setClientError(null);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('entityType', entityType);
      formData.append('importMode', mode);

      const summary = await previewMutation.mutateAsync(formData);
      setPreviewSummary(summary);
      setActiveStep(1);
      setPage(0);
    } catch (err: any) {
      setClientError(err?.message || 'Validation failed. Please verify file format and limits.');
    }
  };

  // Step 2 -> Step 3: Trigger Commit
  const handleConfirmCommit = async () => {
    if (!previewSummary || !previewSummary.canCommit) return;

    try {
      setClientError(null);
      const result = await commitMutation.mutateAsync(previewSummary.jobId);
      setCommitResult(result);
      setActiveStep(2);
      onSuccess(`Successfully committed ${result.createdRows} new and ${result.updatedRows} updated records.`);
    } catch (err: any) {
      setClientError(err?.message || 'Transactional commit failed. Database changes were safely rolled back.');
    }
  };

  // Download Error or Result Report
  const handleDownloadReport = async (jobId: string) => {
    try {
      setClientError(null);
      const blob = await downloadReport.mutateAsync(jobId);
      triggerBlobDownload(blob, `import_report_${entityType.toLowerCase()}_${jobId.slice(0, 8)}.xlsx`);
    } catch (err: any) {
      setClientError(err?.message || 'Failed to download report.');
    }
  };

  // Filter preview rows
  const filteredRows: BulkImportPreviewRow[] = React.useMemo(() => {
    if (!previewSummary?.rows) return [];
    if (filterTab === 'ERRORS') return previewSummary.rows.filter((r) => !r.isValid || r.action === 'CONFLICT');
    if (filterTab === 'CREATES') return previewSummary.rows.filter((r) => r.action === 'CREATE');
    if (filterTab === 'UPDATES') return previewSummary.rows.filter((r) => r.action === 'UPDATE');
    return previewSummary.rows;
  }, [previewSummary, filterTab]);

  const paginatedRows = React.useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth PaperProps={{ sx: { minHeight: 620 } }}>
      <DialogTitle sx={{ pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Secure Bulk Excel Import — {entityTitle}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            All-or-nothing transactional ingestion with pre-commit duplicate and referential validation
          </Typography>
        </Box>
        <Chip
          label={`Mode: ${mode === 'CREATE_ONLY' ? 'Create Only' : 'Update Existing'}`}
          size="small"
          color={mode === 'CREATE_ONLY' ? 'primary' : 'warning'}
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </DialogTitle>

      <Box sx={{ px: 3, pt: 1, pb: 2 }}>
        <Stepper activeStep={activeStep}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent dividers sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {clientError && (
          <Alert severity="error" onClose={() => setClientError(null)}>
            {clientError}
          </Alert>
        )}

        {/* STEP 0: UPLOAD & CONFIGURATION */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Header info & Template download card */}
            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'action.hover' }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  1. Download Official Excel Template
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Use the versioned template with instructions, strict column formatting, and allowed data types.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<CloudDownloadIcon />}
                onClick={handleDownloadTemplate}
                disabled={downloadTemplate.isPending}
              >
                {downloadTemplate.isPending ? 'Downloading...' : 'Download Template (.xlsx)'}
              </Button>
            </Paper>

            {/* Import Mode Selection */}
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontWeight: 700, fontSize: '0.875rem', mb: 0.5 }}>
                2. Choose Import Mode & Duplicate Handling
              </FormLabel>
              <RadioGroup
                row
                value={mode}
                onChange={(e) => setMode(e.target.value as BulkImportMode)}
                sx={{ gap: 3 }}
              >
                <FormControlLabel
                  value="CREATE_ONLY"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Create Only</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Rejects any row matching an existing {entityType === 'MODEL' ? 'Model' : 'Part'} natural key.
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="UPDATE_EXISTING"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Update / Merge</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Creates new records and updates existing records with version-safe concurrency.
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            {/* Drop Zone */}
            <Box
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              sx={{
                border: '2px dashed',
                borderColor: dragActive ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                backgroundColor: dragActive ? 'action.selected' : 'background.paper',
                transition: 'border-color 0.2s, background-color 0.2s',
                cursor: 'pointer',
              }}
            >
              <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {selectedFile ? selectedFile.name : 'Drag and drop your .xlsx workbook here'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                {selectedFile
                  ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready for validation`
                  : 'Or click below to browse your computer (Max 5 MB, up to 1,000 data rows)'}
              </Typography>

              <input
                id="excel-file-upload-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <label htmlFor="excel-file-upload-input">
                <Button variant="contained" component="span" size="small">
                  {selectedFile ? 'Choose Different File' : 'Select .xlsx File'}
                </Button>
              </label>
            </Box>

            {/* Security Notice */}
            <Alert severity="info" icon={<InfoOutlinedIcon />}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                Security & Data Integrity Policy:
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Spreadsheet formula cells (starting with =, +, @) are strictly forbidden to prevent CSV/Excel injection.
                All rows are validated against active Oracle catalog masters prior to committing.
              </Typography>
            </Alert>
          </Box>
        )}

        {/* STEP 1: PREVIEW & VALIDATION BREAKDOWN */}
        {activeStep === 1 && previewSummary && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Status Metric Cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5 }}>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Total Rows</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{previewSummary.totalRows}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderColor: 'success.main' }}>
                <Typography variant="caption" sx={{ color: 'success.main' }}>Valid Rows</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>{previewSummary.validRows}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderColor: previewSummary.invalidRows > 0 ? 'error.main' : 'divider' }}>
                <Typography variant="caption" sx={{ color: previewSummary.invalidRows > 0 ? 'error.main' : 'text.secondary' }}>Invalid / Conflicts</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: previewSummary.invalidRows > 0 ? 'error.main' : 'text.primary' }}>
                  {previewSummary.invalidRows}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'primary.main' }}>To Create</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>{previewSummary.createRows}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'warning.main' }}>To Update</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>{previewSummary.updateRows}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Unchanged</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{previewSummary.unchangedRows}</Typography>
              </Paper>
            </Box>

            {/* Validation Banner */}
            {!previewSummary.canCommit ? (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<FileDownloadIcon />}
                    onClick={() => handleDownloadReport(previewSummary.jobId)}
                  >
                    Download Error Report
                  </Button>
                }
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Validation Failed ({previewSummary.invalidRows} Errors Found)
                </Typography>
                <Typography variant="caption">
                  Under the all-or-nothing transactional policy, commit is blocked until all errors are corrected. Download the error report to review suggested corrections.
                </Typography>
              </Alert>
            ) : (
              <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  All {previewSummary.totalRows} Rows Validated Successfully
                </Typography>
                <Typography variant="caption">
                  Review the proposed operations below and click &quot;Confirm &amp; Import&quot; to apply changes to Oracle Database.
                </Typography>
              </Alert>
            )}

            {/* Filter Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Tabs value={filterTab} onChange={(_, val) => { setFilterTab(val); setPage(0); }}>
                <Tab label={`All Rows (${previewSummary.totalRows})`} value="ALL" />
                <Tab
                  label={`Errors / Conflicts (${previewSummary.invalidRows})`}
                  value="ERRORS"
                  sx={{ color: previewSummary.invalidRows > 0 ? 'error.main' : 'inherit' }}
                />
                <Tab label={`Creates (${previewSummary.createRows})`} value="CREATES" />
                <Tab label={`Updates (${previewSummary.updateRows})`} value="UPDATES" />
              </Tabs>

              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={() => handleDownloadReport(previewSummary.jobId)}
              >
                Export Preview Report
              </Button>
            </Box>

            {/* Preview Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={70} sx={{ fontWeight: 700 }}>Row #</TableCell>
                    <TableCell width={200} sx={{ fontWeight: 700 }}>Natural Key</TableCell>
                    <TableCell width={120} sx={{ fontWeight: 700 }}>Action</TableCell>
                    <TableCell width={100} sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Validation Errors / Proposed Changes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                        No rows found in this filter view.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row) => (
                      <TableRow key={row.rowNumber} hover sx={{ backgroundColor: !row.isValid ? 'error.lighter' : undefined }}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{row.rowNumber}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.naturalKey}</TableCell>
                        <TableCell>
                          <Chip
                            label={row.action}
                            size="small"
                            color={
                              row.action === 'CREATE'
                                ? 'primary'
                                : row.action === 'UPDATE'
                                ? 'warning'
                                : row.action === 'CONFLICT'
                                ? 'error'
                                : 'default'
                            }
                            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                          />
                        </TableCell>
                        <TableCell>
                          {row.isValid ? (
                            <Chip label="Valid" size="small" color="success" variant="outlined" />
                          ) : (
                            <Chip label="Error" size="small" color="error" variant="filled" />
                          )}
                        </TableCell>
                        <TableCell>
                          {row.errors.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {row.errors.map((err, idx) => (
                                <Typography key={idx} variant="caption" sx={{ color: 'error.main', display: 'block' }}>
                                  <strong>[{err.code}]</strong> {err.field}: {err.message}
                                </Typography>
                              ))}
                            </Box>
                          ) : row.changes.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {row.changes.map((chg, idx) => (
                                <Chip
                                  key={idx}
                                  label={`${chg.field}: ${chg.oldValue} -> ${chg.newValue}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {row.action === 'CREATE' ? 'New record ready for insertion' : 'No field modifications detected'}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={filteredRows.length}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25]}
            />
          </Box>
        )}

        {/* STEP 2: FINAL OUTCOME */}
        {activeStep === 2 && commitResult && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 2 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 64, color: 'success.main' }} />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Import Completed Successfully
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 500 }}>
              All approved operations were applied to Oracle Database in a single atomic transaction. Audit logs have been registered.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2.5, width: '100%', maxWidth: 450, mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Records Created:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>{commitResult.createdRows}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Records Updated:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.main' }}>{commitResult.updatedRows}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Records Unchanged:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{commitResult.unchangedRows}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Processing Time:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{commitResult.durationMs} ms</Typography>
              </Box>
            </Paper>

            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={() => handleDownloadReport(commitResult.jobId)}
              sx={{ mt: 1 }}
            >
              Download Persisted Result Report (.xlsx)
            </Button>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {activeStep === 0 && (
          <>
            <Button onClick={handleClose} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleStartValidation}
              disabled={!selectedFile || previewMutation.isPending}
              startIcon={previewMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            >
              {previewMutation.isPending ? 'Validating Workbook...' : 'Upload & Validate'}
            </Button>
          </>
        )}

        {activeStep === 1 && (
          <>
            <Button onClick={() => setActiveStep(0)} color="inherit" disabled={commitMutation.isPending}>
              Back to Upload
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirmCommit}
              disabled={!previewSummary?.canCommit || commitMutation.isPending}
              startIcon={commitMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
            >
              {commitMutation.isPending ? 'Committing to Oracle...' : 'Confirm & Commit Import'}
            </Button>
          </>
        )}

        {activeStep === 2 && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
