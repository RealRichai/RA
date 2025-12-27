'use client';

import { useState } from 'react';
import {
  Target,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useRequireAuth } from '@/hooks';
import { toast } from '@/components/ui/toaster';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const SAMPLE_LEAD = {
  name: 'John Smith',
  email: 'john.smith@example.com',
  phone: '(917) 555-1234',
  source: 'Website Inquiry',
  budget: 4500,
  moveInDate: '2025-02-01',
};

interface ScoreResult {
  score: number;
  tier: 'HOT' | 'WARM' | 'COLD';
  reasons: string[];
  tags: string[];
  confidence: number;
}

interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'failed';
  result?: ScoreResult;
}

export default function ScoringPage() {
  const { isLoading: authLoading } = useRequireAuth();

  const [leadJson, setLeadJson] = useState(JSON.stringify(SAMPLE_LEAD, null, 2));
  const [isScoring, setIsScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [asyncMode, setAsyncMode] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSyncScore = async () => {
    setIsScoring(true);
    setError(null);
    setScoreResult(null);

    try {
      const lead = JSON.parse(leadJson);
      const response = await fetch(`${API_BASE}/score/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });

      const data = await response.json();
      if (data.error) {
        setError(data.error.message);
      } else {
        setScoreResult(data.data);
        toast({ title: 'Lead scored successfully', variant: 'success' });
      }
    } catch (err) {
      setError('Failed to parse JSON or connect to API');
    } finally {
      setIsScoring(false);
    }
  };

  const handleAsyncScore = async () => {
    setIsScoring(true);
    setError(null);
    setJobId(null);
    setJobStatus(null);
    setScoreResult(null);

    try {
      const lead = JSON.parse(leadJson);
      const response = await fetch(`${API_BASE}/score/lead/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });

      const data = await response.json();
      if (data.error) {
        setError(data.error.message);
      } else {
        setJobId(data.data.jobId);
        setJobStatus({ status: 'queued' });
        toast({ title: 'Async job submitted', variant: 'info' });
        pollJobStatus(data.data.jobId);
      }
    } catch (err) {
      setError('Failed to parse JSON or connect to API');
    } finally {
      setIsScoring(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/score/jobs/${id}`);
        const data = await response.json();

        if (data.data) {
          setJobStatus(data.data);

          if (data.data.status === 'done') {
            setScoreResult(data.data.result);
            toast({ title: 'Scoring complete!', variant: 'success' });
          } else if (data.data.status !== 'failed') {
            setTimeout(poll, 500);
          }
        }
      } catch (err) {
        setJobStatus({ status: 'failed' });
      }
    };

    poll();
  };

  const copyResult = () => {
    if (scoreResult) {
      navigator.clipboard.writeText(JSON.stringify(scoreResult, null, 2));
      toast({ title: 'Copied to clipboard', variant: 'success' });
    }
  };

  const tierColors = {
    HOT: 'bg-red-100 text-red-700 border-red-200',
    WARM: 'bg-amber-100 text-amber-700 border-amber-200',
    COLD: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-luxury-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-surface-900">Lead Scoring Tool</h1>
          <p className="text-surface-600 mt-1">Score leads using the federated scoring API</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-luxury-bronze" />
                Lead Data Input
              </CardTitle>
              <CardDescription>Paste JSON lead data to score</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={leadJson}
                onChange={(e) => setLeadJson(e.target.value)}
                className="w-full h-64 p-4 font-mono text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                placeholder="Enter lead JSON..."
              />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={asyncMode}
                    onChange={(e) => setAsyncMode(e.target.checked)}
                    className="rounded border-surface-300 text-luxury-gold focus:ring-luxury-gold"
                  />
                  <span className="text-sm text-surface-600">Async Mode</span>
                </label>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={asyncMode ? handleAsyncScore : handleSyncScore}
                  disabled={isScoring}
                  className="flex-1"
                >
                  {isScoring ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : asyncMode ? (
                    <Clock className="h-4 w-4 mr-2" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  {asyncMode ? 'Submit Async Job' : 'Score Now'}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setLeadJson(JSON.stringify(SAMPLE_LEAD, null, 2))}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Result Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  Scoring Result
                </span>
                {scoreResult && (
                  <Button variant="ghost" size="sm" onClick={copyResult}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {asyncMode && jobId ? `Job ID: ${jobId}` : 'Real-time scoring result'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Job Status */}
              {asyncMode && jobStatus && (
                <div className="mb-4 p-3 bg-surface-50 rounded-lg flex items-center gap-3">
                  {jobStatus.status === 'queued' && (
                    <>
                      <Clock className="h-5 w-5 text-amber-500" />
                      <span className="text-sm text-surface-600">Job queued...</span>
                    </>
                  )}
                  {jobStatus.status === 'running' && (
                    <>
                      <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                      <span className="text-sm text-surface-600">Processing...</span>
                    </>
                  )}
                  {jobStatus.status === 'done' && (
                    <>
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm text-emerald-600">Complete!</span>
                    </>
                  )}
                  {jobStatus.status === 'failed' && (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span className="text-sm text-red-600">Failed</span>
                    </>
                  )}
                </div>
              )}

              {scoreResult ? (
                <div className="space-y-6">
                  {/* Score & Tier */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-surface-500 mb-1">Lead Score</p>
                      <p className="text-4xl font-bold text-surface-900">{scoreResult.score}</p>
                    </div>
                    <Badge className={cn('text-lg px-4 py-2', tierColors[scoreResult.tier])}>
                      {scoreResult.tier}
                    </Badge>
                  </div>

                  {/* Confidence */}
                  <div>
                    <p className="text-sm text-surface-500 mb-2">Confidence</p>
                    <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-luxury-gold to-luxury-bronze rounded-full transition-all"
                        style={{ width: `${scoreResult.confidence * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-surface-600 mt-1">
                      {(scoreResult.confidence * 100).toFixed(0)}%
                    </p>
                  </div>

                  {/* Reasons */}
                  <div>
                    <p className="text-sm text-surface-500 mb-2">Scoring Reasons</p>
                    <ul className="space-y-2">
                      {scoreResult.reasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-surface-700">
                          <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Tags */}
                  <div>
                    <p className="text-sm text-surface-500 mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {scoreResult.tags.map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500">Submit lead data to see scoring result</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* API Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">API Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-surface-50 rounded-lg">
                <code className="text-emerald-600">GET</code>
                <code className="ml-2 text-surface-700">/api/v1/score/health</code>
                <p className="text-xs text-surface-500 mt-1">Health check</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <code className="text-blue-600">POST</code>
                <code className="ml-2 text-surface-700">/api/v1/score/lead</code>
                <p className="text-xs text-surface-500 mt-1">Sync scoring</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg">
                <code className="text-purple-600">POST</code>
                <code className="ml-2 text-surface-700">/api/v1/score/lead/async</code>
                <p className="text-xs text-surface-500 mt-1">Async scoring</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
