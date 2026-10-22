'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';

import { StockDispatch } from '../../../../lib/warehouseApi';

interface DeliveryChallanModalProps {
  open: boolean;
  onClose: () => void;
  dispatch: StockDispatch | null;
}

export function DeliveryChallanModal({ open, onClose, dispatch }: DeliveryChallanModalProps) {
  if (!dispatch) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogContent sx={{ p: 4 }}>
        {/* Printable Delivery Challan Paper */}
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            borderColor: 'divider',
            borderRadius: 2,
            '@media print': {
              border: 'none',
              p: 0,
            },
          }}
        >
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: 0.5 }}>
                ENTERPRISE SERVICE OPERATIONS CRM
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                CENTRAL LOGISTICS & SPARE PARTS SUPPLY CHAIN NETWORK
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
                GST DELIVERY CHALLAN & STOCK TRANSFER INVOICE
              </Typography>
              <Typography variant="caption" color="text.secondary">
                (Issued under Rule 55 of the Central Goods and Services Tax Rules, 2017)
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Chip
                label={dispatch.status}
                color={dispatch.status === 'DELIVERED' ? 'success' : 'primary'}
                sx={{ fontWeight: 700, mb: 1 }}
              />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {dispatch.challanNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Dispatch Ref: {dispatch.dispatchNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Date: {new Date(dispatch.dispatchedAt).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Consignor & Consignee */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
                  Consignor (Dispatched From)
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {dispatch.fromLocationName || 'Central Logistics Warehouse'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  GSTIN: 27AABCS1429B1Z4
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  State: Maharashtra (Code: 27)
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
                  Consignee (Dispatched To)
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {dispatch.toLocationName || 'Authorized Service Center (ASF)'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Destination Franchise Center
                </Typography>
                {dispatch.jobNumber && (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', mt: 0.5 }}>
                    Linked Service Request: {dispatch.jobNumber}
                  </Typography>
                )}
              </Paper>
            </Grid>
          </Grid>

          {/* Transport & Dispatch Details */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  Dispatch Mode
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {dispatch.dispatchMode}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  Transporter / Courier
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {dispatch.transporterName || '—'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  Docket / AWB Tracking No
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {dispatch.docketNo || '—'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Typography variant="caption" color="text.secondary">
                  E-Way Bill Number
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {dispatch.ewayBillNo || '—'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Line Items Table */}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: '5%' }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '25%' }}>Part Description</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '12%' }}>HSN Code</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '8%' }} align="right">
                    Qty
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '12%' }} align="right">
                    Rate (₹)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '13%' }} align="right">
                    Taxable (₹)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '10%' }} align="right">
                    GST
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '15%' }} align="right">
                    Total Amount (₹)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(dispatch.items || []).map((it, idx) => (
                  <TableRow key={it.itemId || idx}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {it.partCode}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {it.partName}
                      </Typography>
                    </TableCell>
                    <TableCell>{it.hsnCode || '84159000'}</TableCell>
                    <TableCell align="right">{it.quantity}</TableCell>
                    <TableCell align="right">₹{it.unitPrice.toFixed(2)}</TableCell>
                    <TableCell align="right">₹{it.taxableValue.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      {it.igstAmount > 0 ? (
                        <Typography variant="caption" display="block">
                          IGST ({it.igstRate}%): ₹{it.igstAmount.toFixed(2)}
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="caption" display="block">
                            CGST ({it.cgstRate}%): ₹{it.cgstAmount.toFixed(2)}
                          </Typography>
                          <Typography variant="caption" display="block">
                            SGST ({it.sgstRate}%): ₹{it.sgstAmount.toFixed(2)}
                          </Typography>
                        </>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      ₹{it.totalAmount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Totals & Signatures */}
          <Grid container spacing={3} alignItems="flex-end">
            <Grid item xs={12} sm={7}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }} display="block">
                  Statutory Declarations
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  1. Goods dispatched herewith are spare parts / components intended strictly for after-sales field
                  servicing and customer repair fulfillment, not for retail sale.
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  2. Dispatched by: {dispatch.dispatchedBy} on {new Date(dispatch.dispatchedAt).toLocaleString()}.
                </Typography>
                {dispatch.acknowledgedBy && (
                  <Typography variant="caption" color="success.main" display="block" sx={{ mt: 0.5, fontWeight: 600 }}>
                    3. Acknowledged & Received at Destination by: {dispatch.acknowledgedBy} on{' '}
                    {new Date(dispatch.acknowledgedAt!).toLocaleString()}.
                  </Typography>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} sm={5}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Total Taxable Value:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    ₹{dispatch.subtotalTaxable.toFixed(2)}
                  </Typography>
                </Box>
                {dispatch.totalIgst > 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Integrated GST (IGST 18%):
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{dispatch.totalIgst.toFixed(2)}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Central GST (CGST 9%):
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        ₹{dispatch.totalCgst.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        State GST (SGST 9%):
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        ₹{dispatch.totalSgst.toFixed(2)}
                      </Typography>
                    </Box>
                  </>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Grand Total:
                  </Typography>
                  <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                    ₹{dispatch.totalAmount.toFixed(2)}
                  </Typography>
                </Box>
              </Paper>

              <Box sx={{ mt: 3, textAlign: 'center', borderTop: '1px dashed #999', pt: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  For ENTERPRISE CRM LOGISTICS OPERATIONS
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Authorized Signatory & Warehouse Dispatcher
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} startIcon={<CloseIcon />} color="inherit">
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Print Delivery Challan
        </Button>
      </DialogActions>
    </Dialog>
  );
}
