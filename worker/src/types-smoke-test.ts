// worker/src/types-smoke-test.ts
import type {
    Scan,
    ScanState,
    VerdictLabel,
    ErrorCode,
    AgreementStrength,
    UploadUrlRequest,
    UploadUrlResponse,
    ScanError,
  } from '@verify/shared';
  
  // Force the compiler to exercise each type
  const scanState: ScanState = 'complete';
  const verdict: VerdictLabel = 'ai';
  const agreement: AgreementStrength = 'disagreement';
  const errorCode: ErrorCode = 'SUBMIT_FAILED';
  
  // This should fail to compile — uncomment to verify the type system is working
  // const badState: ScanState = 'idle'; // idle is frontend-only, shouldn't be in ScanState
  // const badVerdict: VerdictLabel = 'maybe'; // not in the union
  // const badCode: ErrorCode = 'NOT_A_REAL_CODE';
  
  // Build a full Scan object to make sure all nested types connect
  const fullScan: Scan = {
    id: 'abc',
    state: 'complete',
    createdAt: '2026-04-16T14:22:00Z',
    filename: 'test.jpg',
    verdict: {
      status: 'ready',
      label: 'ai',
      headline: 'AI generated',
      aiLikelihood: 90.24,
      confidence: 90.24,
    },
    preview: {
      status: 'ready',
      url: '/api/scan/abc/preview',
    },
    heatmap: {
      status: 'ready',
      url: '/api/scan/abc/heatmap',
      mode: 'transparent',
    },
    analysis: {
      status: 'ready',
      agreement: 'strong',
      imageTags: ['person'],
      keyIndicators: [{ label: 'Smooth skin', supports: 'verdict' }],
      reasoning: 'Because.',
      recommendations: ['Check source'],
    },
    signals: {
      hasExif: false,
      screenRecapture: false,
      watermark: { label: 'Gemini', confidence: 0.95 },
    },
    error: null,
  };
  
  export { fullScan };