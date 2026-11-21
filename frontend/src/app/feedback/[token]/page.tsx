'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Rating from '@mui/material/Rating';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';
import SentimentVerySatisfiedIcon from '@mui/icons-material/SentimentVerySatisfied';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import { feedbackApi, PublicFeedbackSummary } from '../../../lib/feedbackApi';

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export default function CustomerFeedbackPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PublicFeedbackSummary | null>(null);

  // Form State
  const [overallRating, setOverallRating] = useState<number>(5);
  const [techRating, setTechRating] = useState<number>(5);
  const [repairRating, setRepairRating] = useState<number>(5);
  const [issueResolved, setIssueResolved] = useState<'Y' | 'N'>('Y');
  const [comments, setComments] = useState<string>('');
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing feedback link.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    feedbackApi
      .getFeedback(token)
      .then((data) => {
        if (isMounted) {
          setSummary(data);
          if (data.alreadySubmitted) {
            setSubmittedSuccess(true);
          }
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err?.message || 'Failed to load feedback details. Link may be invalid or expired.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setError(null);
    setSubmitting(true);

    try {
      await feedbackApi.submitFeedback(token, {
        overallRating,
        techRating,
        repairRating,
        issueResolved,
        comments: comments.trim() || undefined,
      });
      setSubmittedSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={48} />
        <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
          Loading service feedback form...
        </Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc', py: { xs: 3, sm: 6 } }}>
      <Container maxWidth="sm">
        {/* Brand Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: -0.5 }}>
            Customer Service Feedback
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your honest ratings help us ensure premium service quality.
          </Typography>
        </Box>

        <Paper elevation={2} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {summary?.isExpired ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="error" sx={{ fontWeight: 700, mb: 1 }}>
                Feedback Link Expired
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This customer feedback link has expired (valid for 7 days post closure). Thank you for being our valued customer.
              </Typography>
            </Box>
          ) : submittedSuccess ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.dark', mb: 1 }}>
                Thank You for Your Feedback!
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                Your service ratings for Job <strong>#{summary?.jobNumber}</strong> have been securely recorded.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                We continuously strive to deliver exceptional service on every visit.
              </Typography>
            </Box>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Service Context Card */}
              {summary && (
                <Box
                  sx={{
                    p: 2,
                    mb: 3,
                    borderRadius: 2,
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', color: 'text.secondary', fontWeight: 700 }}>
                    Service Summary
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b' }}>
                    {summary.brandName} — {summary.productName}
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Job Number: <strong>#{summary.jobNumber}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Date: <strong>{summary.serviceDate}</strong>
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* 1. Overall Rating */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <SentimentVerySatisfiedIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    1. Overall Service Experience
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  How satisfied are you with the overall service provided?
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Rating
                    value={overallRating}
                    onChange={(_, val) => val && setOverallRating(val)}
                    size="large"
                    emptyIcon={<StarIcon style={{ opacity: 0.4 }} fontSize="inherit" />}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark' }}>
                    {RATING_LABELS[overallRating]}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 2. Technician Professionalism */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <PersonPinIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    2. Technician Professionalism &amp; Punctuality
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Rate our service engineer&apos;s punctuality, politeness, and technical competence.
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Rating
                    value={techRating}
                    onChange={(_, val) => val && setTechRating(val)}
                    size="large"
                    emptyIcon={<StarIcon style={{ opacity: 0.4 }} fontSize="inherit" />}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark' }}>
                    {RATING_LABELS[techRating]}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 3. Repair Quality */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <BuildCircleIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    3. Repair Quality &amp; Product Performance
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  How well is your product functioning following the service visit?
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Rating
                    value={repairRating}
                    onChange={(_, val) => val && setRepairRating(val)}
                    size="large"
                    emptyIcon={<StarIcon style={{ opacity: 0.4 }} fontSize="inherit" />}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.dark' }}>
                    {RATING_LABELS[repairRating]}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 4. Issue Resolved */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <HelpOutlineIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    4. Was your problem completely resolved?
                  </Typography>
                </Box>
                <ToggleButtonGroup
                  color="primary"
                  value={issueResolved}
                  exclusive
                  onChange={(_, val) => val && setIssueResolved(val)}
                  sx={{ mt: 1 }}
                >
                  <ToggleButton value="Y" sx={{ px: 3, fontWeight: 700 }}>
                    Yes, Resolved
                  </ToggleButton>
                  <ToggleButton value="N" sx={{ px: 3, fontWeight: 700 }}>
                    No, Still Facing Issue
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* 5. Comments */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  5. Additional Remarks / Suggestions (Optional)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Share any additional feedback about your service experience..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  inputProps={{ maxLength: 1000 }}
                />
              </Box>

              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                disabled={submitting}
                sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem', borderRadius: 2 }}
              >
                {submitting ? <CircularProgress size={24} color="inherit" /> : 'Submit Service Feedback'}
              </Button>
            </form>
          )}
        </Paper>
      </Container>
    </Box>
  );
}

