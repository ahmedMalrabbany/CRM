/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallType, TaxType } from '../types';

export interface SmartSearchParams {
  taxType?: TaxType;
  callType?: CallType;
  serviceType?: string;
  status?: string;
  priority?: string;
  datePreset?: 'today' | 'week' | 'month' | 'all';
  freeText?: string;
}

export interface AssistantGroundingSource {
  title: string;
  uri: string;
}

export interface AssistantChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: AssistantGroundingSource[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.');
  }
  return data as T;
}

/**
 * 1. Transcribe recorded Arabic / Egyptian colloquial audio using Gemini 3.5 Transcribe
 */
export async function transcribeAudioWithAI(params: {
  audioBase64: string;
  mimeType: string;
  contextHint?: string;
}): Promise<string> {
  const res = await postJson<{ text: string }>('/api/gemini/transcribe', params);
  return (res.text || '').trim();
}

/**
 * 2. Polish / correct Arabic dictation text (supports Egyptian colloquial dialect)
 */
export async function polishArabicTranscriptWithAI(text: string): Promise<string> {
  const res = await postJson<{ text: string }>('/api/gemini/polish-arabic', { text });
  return (res.text || text).trim();
}

/**
 * 3. Modern Smart AI Assistant multi-turn streaming chat with Google Search grounding
 */
export async function askSmartAssistantWithAI(params: {
  messages: AssistantChatMessage[];
  userContext?: { fullName?: string; roleLabel?: string };
  onChunk?: (partialText: string) => void;
}): Promise<{ reply: string; sources: AssistantGroundingSource[] }> {
  const response = await fetch('/api/gemini/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: params.messages.map((m) => ({ role: m.role, text: m.text })),
      userContext: params.userContext,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error((errData && errData.error) || 'تعذر الاتصال بخدمة الذكاء الاصطناعي.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = await response.json().catch(() => ({}));
    return {
      reply: (data.reply || '').trim(),
      sources: Array.isArray(data.sources) ? data.sources : [],
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let sources: AssistantGroundingSource[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const rawJson = trimmed.slice(5).trim();
      if (!rawJson) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error);
      }
      if (typeof parsed.chunk === 'string' && parsed.chunk) {
        fullText += parsed.chunk;
        params.onChunk?.(fullText);
      }
      if (parsed.done && Array.isArray(parsed.sources)) {
        sources = parsed.sources;
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error('لم يصدر رد من المساعد الذكي، يرجى إعادة المحاولة.');
  }

  return { reply: fullText.trim(), sources };
}

/**
 * 4. Case Classification (اقتراح التصنيف ونوع الضريبة والخدمة)
 */
export async function classifyCaseWithAI(title: string, notes: string): Promise<{
  suggestedCallType?: CallType;
  suggestedTaxType?: TaxType;
  suggestedService?: string;
  reasoning?: string;
}> {
  try {
    return await postJson('/api/gemini/classify', { title, notes });
  } catch (err) {
    console.error('Gemini classification error:', err);
    return {
      suggestedTaxType: 'ضرائب دخل',
      suggestedCallType: 'استفسار',
    };
  }
}

/**
 * 5. Case Summarization (تلخيص الحالة التنفيذي)
 */
export async function summarizeCaseWithAI(caseData: {
  title: string;
  notes?: string;
  agentReply?: string;
  managementReply?: string;
  timelineActions?: string[];
}): Promise<string> {
  try {
    const res = await postJson<{ summary: string }>('/api/gemini/summarize', caseData);
    return res.summary || 'تعذر استخراج التلخيص.';
  } catch (err) {
    console.error('Gemini summarization error:', err);
    return err instanceof Error ? err.message : 'تعذر تلخيص الحالة حالياً.';
  }
}

/**
 * 6. Suggested Response (اقتراح رد رسمي للممول ليراجعه الموظف قبل الاعتماد)
 */
export async function generateSuggestedResponse(caseData: {
  title: string;
  taxType: string;
  serviceType: string;
  notes?: string;
  callerName: string;
  targetRole: 'agent' | 'management';
}): Promise<string> {
  try {
    const res = await postJson<{ reply: string }>('/api/gemini/suggest-reply', caseData);
    return res.reply || '';
  } catch (err) {
    console.error('Gemini suggested reply error:', err);
    throw err;
  }
}

/**
 * 7. Smart Search Parser (البحث الذكي باللغة الطبيعية)
 */
export async function parseSmartSearchQuery(
  userQuery: string,
  availableServices?: string[]
): Promise<SmartSearchParams> {
  return await postJson<SmartSearchParams>('/api/gemini/smart-search', {
    userQuery,
    availableServices,
  });
}

export interface AgentMetricsPayload {
  fullName: string;
  crmUser: string;
  registeredCount: number;
  openCount: number;
  escalatedCount: number;
  overdue72hCount: number;
  closedCount: number;
  closeRatePct: number;
  avgResolutionHours: number | null;
  topServices: string[];
}

export interface ExecutiveInsightsPayload {
  periodLabel: string;
  focusAgentName?: string;
  summaryStats: {
    totalCases: number;
    openCases: number;
    closedCases: number;
    escalatedCases: number;
    overdue72hCases: number;
    closeRatePct: number;
  };
  agentMetrics: AgentMetricsPayload[];
  serviceBreakdown: Array<{
    serviceType: string;
    taxType: string;
    count: number;
    openCount: number;
    escalatedCount: number;
    overdue72hCount: number;
  }>;
  sampleCases: Array<{
    caseId: string;
    callType: string;
    taxType: string;
    serviceType: string;
    status: string;
    priority: string;
    title: string;
    agentName: string;
    agentNotes?: string;
    agentReply?: string;
    managementReply?: string;
    isOverdue72h?: boolean;
  }>;
}

export interface AgentEvaluationAI {
  agentName: string;
  crmUser: string;
  performanceRating: 'ممتاز' | 'جيد جداً' | 'جيد' | 'يحتاج متابعة' | string;
  performanceScore: number;
  strengths: string[];
  improvementAreas: string[];
  coachingRecommendation: string;
}

export interface CommonIssueAI {
  issueTitle: string;
  category: string;
  severity: 'حرج' | 'مرتفع' | 'متوسط' | string;
  estimatedFrequency: string;
  rootCauseHypothesis: string;
  recommendedAction: string;
  relatedCaseIds: string[];
}

export interface ProactiveAlertAI {
  alertTitle: string;
  severity: 'عاجل' | 'تنبيه' | 'معلومة' | string;
  targetAudience: 'agents' | 'management' | 'both' | string;
  alertMessage: string;
}

export interface ExecutiveInsightsResult {
  executiveSummary: string;
  overallRiskLevel: 'طبيعي' | 'متوسط' | 'مرتفع' | string;
  agentEvaluations: AgentEvaluationAI[];
  commonIssues: CommonIssueAI[];
  proactiveAlerts: ProactiveAlertAI[];
}

/**
 * 8. Executive AI Insights: Evaluate Call Agents, Detect Common Issues, and Generate Proactive Alerts
 */
export async function generateExecutiveInsightsWithAI(
  payload: ExecutiveInsightsPayload
): Promise<ExecutiveInsightsResult> {
  return await postJson<ExecutiveInsightsResult>('/api/gemini/executive-insights', payload);
}
