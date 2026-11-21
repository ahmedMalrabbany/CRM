/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import compression from 'compression';
import { Store } from './server/db/store.ts';
import { FileDriver } from './server/db/fileDriver.ts';
import { createDbRouter, createDriverFromEnv } from './server/db/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const SERVER_BOOT_ID = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
const SERVER_BOOT_AT = new Date().toISOString();

const ATTACHMENTS_DIR = path.resolve(__dirname, 'uploads', 'attachments');
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
  'text/plain': '.txt',
};

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getFriendlyGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === 'GEMINI_API_KEY_MISSING') {
    return {
      status: 503,
      message: 'مفتاح خدمة الذكاء الاصطناعي غير مضبوط في إعدادات الخادم (Settings > Secrets).',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403') || raw.includes('400')) {
    return {
      status: 502,
      message: 'يرجى التحقق من صلاحية مفتاح Gemini API في لوحة الإعدادات (Settings > Secrets).',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'تم تجاوز الحد المؤقت لطلبات الذكاء الاصطناعي، يرجى المحاولة بعد لحظات.',
    };
  }
  return {
    status: 500,
    message: 'تعذر إتمام الطلب عبر خدمة الذكاء الاصطناعي حالياً.',
  };
}

async function generateContentFast(
  ai: GoogleGenAI,
  contents: string,
  extraConfig: Record<string, unknown> = {}
) {
  const tryModel = async (model: string, thinkingLevel: ThinkingLevel, timeoutMs: number) => {
    const reqPromise = ai.models.generateContent({
      model,
      contents,
      config: {
        ...extraConfig,
        thinkingConfig: { thinkingLevel },
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT_${model}`)), timeoutMs)
    );
    return Promise.race([reqPromise, timeoutPromise]);
  };

  try {
    return await tryModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, 15000);
  } catch {
    return await tryModel('gemini-4-hydrogen', ThinkingLevel.LOW, 20000);
  }
}

function normalizeServerVoiceDigits(text: string): string {
  if (!text) return '';
  let out = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/(\d)[ \t]+(\d)/g, '$1$2');
  }
  return out;
}

async function startServer() {
  const app = express();

  // gzip API responses (but never the SSE stream)
  app.use(
    compression({
      filter: (req, res) => (req.path === '/api/db/events' ? false : compression.filter(req, res)),
    })
  );
  app.use(express.json({ limit: '25mb' }));

  // ---- Database: in-memory store synced to Google Sheets (replaces Firestore) ----
  const dataDir = path.resolve(__dirname, 'data');
  let dbStore = new Store(createDriverFromEnv(dataDir));
  try {
    await dbStore.init();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[db] Primary driver (${dbStore.driverName}) unavailable (${msg}) -> falling back to local-file.`);
    fs.mkdirSync(dataDir, { recursive: true });
    dbStore = new Store(new FileDriver(path.join(dataDir, 'db.json')));
    await dbStore.init();
  }
  console.log(`[db] driver=${dbStore.driverName} loaded:`, dbStore.stats());
  app.use('/api/db', createDbRouter(dbStore));
  const flushOnExit = async () => {
    await dbStore.flushAndWait();
    process.exit(0);
  };
  process.on('SIGTERM', flushOnExit);
  process.on('SIGINT', flushOnExit);

  // 1. Transcribe Arabic & Egyptian Colloquial Audio -> Accurate Arabic Text
  app.post('/api/gemini/transcribe', async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType, contextHint } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        contextHint?: string;
      };

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'ملف الصوت غير مرفق.' });
        return;
      }

      const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      const ai = getGeminiClient();

      const prompt = [
        'استمع إلى التسجيل الصوتي التالي وانسخه بدقة تامة إلى نص عربي سليم ومفهوم.',
        'المتحدث يتحدث باللغة العربية الفصحى أو بالعامية المصرية.',
        'سياق العمل: مركز الاتصال المتكامل بمصلحة الضرائب المصرية (16395) — مصطلحات محتملة: الفاتورة الإلكترونية، الإيصال الإلكتروني، بوابة الممول، منظومة الساب، ضريبة القيمة المضافة، ضريبة الدخل، الإقرار الضريبي، رقم التسجيل الضريبي، مأمورية الضرائب، وكيل الاتصال، الإدارة والدعم التقني.',
        contextHint ? `سياق الحقل الحالي: ${contextHint}` : '',
        'التعليمات الصارمة:',
        '1. اكتب الكلام المنطوق باللغة العربية الصحيحة بدقة إملائية وعلامات ترقيم واضحة، مع الحفاظ على المعنى المقصود حتى لو كان بالعامية المصرية.',
        '2. اكتب جميع الأرقام (مثل أرقام الهاتف، التسجيل الضريبي، الرقم القومي، أرقام الحالات، المبالغ) بالأرقام الإنجليزية القياسية (0-9) متصلة من اليسار إلى اليمين بالترتيب الصحيح الذي نُطقت به بدون مسافات بين أرقام العدد الواحد.',
        '3. إذا كان الصوت صامتاً أو غير مسموع تماماً فأعد نصاً فارغاً.',
        '4. أعد النص المنسوخ فقط بدون أي مقدمات أو شروحات أو علامات تنصيص.',
      ]
        .filter(Boolean)
        .join('\n');

      const contentPayload = {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: audioBase64,
            },
          },
          { text: prompt },
        ],
      };

      const callWithTimeout = async (model: string, timeoutMs: number) => {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini transcribe timeout')), timeoutMs)
        );
        return Promise.race([
          ai.models.generateContent({
            model,
            contents: contentPayload,
          }),
          timeoutPromise,
        ]);
      };

      let response;
      try {
        response = await callWithTimeout('gemini-3.5-transcribe', 20000);
      } catch (primaryErr) {
        console.warn('gemini-3.5-transcribe fallback to gemini-3.1-flash-lite:', primaryErr);
        response = await callWithTimeout('gemini-3.1-flash-lite', 20000);
      }

      const transcribed = normalizeServerVoiceDigits((response.text || '').trim());
      res.json({ text: transcribed });
    } catch (err) {
      console.error('Gemini transcribe error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Polish / Correct Arabic (Egyptian Colloquial -> Clean Standard or Polished Arabic)
  app.post('/api/gemini/polish-arabic', async (req: Request, res: Response) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || !text.trim()) {
        res.status(400).json({ error: 'لا يوجد نص لتنقيحه.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await generateContentFast(
        ai,
        `صحّح الأخطاء الإملائية وعلامات الترقيم في النص العربي التالي الناتج عن إملاء صوتي بالعامية المصرية أو الفصحى في مركز اتصال مصلحة الضرائب المصرية، مع الحفاظ الكامل على المعنى والأرقام (اكتب جميع الأرقام بصيغة 0-9 من اليسار لليمين بالترتيب الصحيح دون قلب أو فصل) والأسماء دون اختصار أو إضافة معلومات من خارج النص. أعد النص المصحح فقط:\n\n${text.trim()}`
      );

      res.json({ text: normalizeServerVoiceDigits((response.text || text).trim()) });
    } catch (err) {
      console.error('Gemini polish error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Modern Smart AI Assistant Chat (Streaming SSE + Google Search Grounding)
  app.post('/api/gemini/assistant', async (req: Request, res: Response) => {
    try {
      const { messages, userContext } = req.body as {
        messages?: Array<{ role: 'user' | 'model'; text: string }>;
        userContext?: { fullName?: string; roleLabel?: string };
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'برجاء كتابة استفسارك أولاً.' });
        return;
      }

      // Normalize turns: drop any leading UI greeting ('model') so contents strictly starts with 'user',
      // and ensure alternating user/model turns with non-empty text.
      const normalizedTurns: Array<{ role: 'user' | 'model'; text: string }> = [];
      for (const m of messages.slice(-16)) {
        const text = (m.text || '').trim();
        if (!text) continue;
        const role: 'user' | 'model' = m.role === 'model' ? 'model' : 'user';
        if (normalizedTurns.length === 0 && role !== 'user') continue;
        const prev = normalizedTurns[normalizedTurns.length - 1];
        if (prev && prev.role === role) {
          prev.text = `${prev.text}\n${text}`;
        } else {
          normalizedTurns.push({ role, text });
        }
      }

      if (normalizedTurns.length === 0) {
        res.status(400).json({ error: 'برجاء كتابة استفسارك أولاً.' });
        return;
      }

      const ai = getGeminiClient();
      const buildSystemInstruction = (withSearch: boolean) =>
        `أنت المساعد الذكي الحديث والمتطور من Gemini لمنظومة إدارة علاقات العملاء (CRM) بمركز الاتصال المتكامل لمصلحة الضرائب المصرية (16395).
المستخدم الحالي: ${userContext?.fullName || 'موظف مركز الاتصال'} (${userContext?.roleLabel || 'فريق العمل'}).

قدراتك ومهامك:
1. مساعد عام وذكي ومتطور يجيب عن **أي سؤال أو استفسار** في شتى المجالات (ضريبي، قانوني، تقني، إداري، معلومات عامة، برمجة، ثقافة عامة)، وليس مقيداً بموضوع واحد فقط.${
          withSearch
            ? '\n- تمتلك ميزة البحث المباشر على الإنترنت (Google Search) للتحقق من أحدث المعلومات والأخبار والتحديثات.'
            : ''
        }
2. فهم الاستفسارات باللغة العربية الفصحى وبالعامية المصرية بدقة عالية، والرد بلغة عربية سليمة وواضحة ومرتبة ومختصرة دون حشو.
3. عند الاستفسار عن مصلحة الضرائب المصرية أو إجراءات المنظومة (الفاتورة الإلكترونية، الإيصال الإلكتروني، القيمة المضافة، ضرائب الدخل، الإقرارات، الرقم الضريبي، الخط الساخن 16395، أو استخدام منظومة CRM)، قدّم إجابة دقيقة وعملية.`;

      const contents = normalizedTurns.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendSse = (payload: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      const tryStream = async (
        model: string,
        thinkingLevel: ThinkingLevel,
        useSearch: boolean,
        timeoutMs: number
      ) => {
        const callPromise = ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: buildSystemInstruction(useSearch),
            thinkingConfig: { thinkingLevel },
            ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`TIMEOUT_${timeoutMs}ms_${model}`)), timeoutMs)
        );
        return Promise.race([callPromise, timeoutPromise]);
      };

      const attempts: Array<{
        model: string;
        level: ThinkingLevel;
        search: boolean;
        timeoutMs: number;
      }> = [
        { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, search: true, timeoutMs: 10000 },
        { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, search: false, timeoutMs: 25000 },
        { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, search: false, timeoutMs: 25000 },
      ];

      let stream;
      let lastErr: unknown;
      for (const att of attempts) {
        try {
          stream = await tryStream(att.model, att.level, att.search, att.timeoutMs);
          break;
        } catch (attErr) {
          lastErr = attErr;
        }
      }
      if (!stream) {
        throw lastErr instanceof Error ? lastErr : new Error('ASSISTANT_STREAM_FAILED');
      }

      let accumulated = '';
      const sourcesMap = new Map<string, { title: string; uri: string }>();

      for await (const chunk of stream) {
        const piece = chunk.text || '';
        if (piece) {
          accumulated += piece;
          sendSse({ chunk: piece });
        }

        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const gc of groundingChunks) {
            const uri = gc?.web?.uri;
            if (uri && !sourcesMap.has(uri)) {
              sourcesMap.set(uri, {
                uri,
                title: (gc?.web?.title || uri).trim(),
              });
            }
          }
        }
      }

      if (!accumulated.trim()) {
        sendSse({ error: 'لم يصدر رد من نموذج الذكاء الاصطناعي، يرجى إعادة المحاولة.' });
      } else {
        sendSse({
          done: true,
          sources: Array.from(sourcesMap.values()).slice(0, 5),
        });
      }
      res.end();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error('Gemini assistant error:', raw);
      const { status, message } = getFriendlyGeminiError(err);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } else {
        res.status(status).json({ error: message });
      }
    }
  });

  // 4. Case Classification
  app.post('/api/gemini/classify', async (req: Request, res: Response) => {
    try {
      const { title, notes } = req.body as { title?: string; notes?: string };
      const ai = getGeminiClient();

      const response = await generateContentFast(
        ai,
        `أنت خبير تصنيف حالات مركز الاتصال المتكامل بمصلحة الضرائب المصرية.
بناءً على عنوان الحالة وملاحظاتها، صنف الحالة بدقة:
العنوان: "${title || ''}"
الملاحظات: "${notes || ''}"`,
        {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedCallType: {
                type: Type.STRING,
                description: 'طلب أو استفسار أو شكوى أو رسائل SMS',
              },
              suggestedTaxType: {
                type: Type.STRING,
                description: 'ضرائب دخل أو ضرائب قيمة مضافة',
              },
              suggestedService: {
                type: Type.STRING,
                description: 'اسم الخدمة الأنسب من الخدمات الضريبية الرسمية',
              },
              reasoning: {
                type: Type.STRING,
                description: 'سبب موجز لا يتجاوز 10 كلمات',
              },
            },
          },
        }
      );

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (err) {
      console.error('Gemini classify error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 5. Case Summarization
  app.post('/api/gemini/summarize', async (req: Request, res: Response) => {
    try {
      const caseData = req.body as {
        title?: string;
        notes?: string;
        agentReply?: string;
        managementReply?: string;
        timelineActions?: string[];
      };

      const ai = getGeminiClient();
      const prompt = `لخص هذه الحالة الواردة إلى مركز الاتصال المتكامل بمصلحة الضرائب المصرية في سطرين إلى ثلاثة أسطر بأسلوب رسمي وواضح:
عنوان الحالة: ${caseData.title || ''}
ملاحظات الوكيل: ${caseData.notes || 'لا يوجد'}
رد الوكيل: ${caseData.agentReply || 'لا يوجد'}
رد الإدارة والدعم التقني: ${caseData.managementReply || 'لا يوجد'}
تسلسل الأحداث: ${caseData.timelineActions?.join(' -> ') || 'حديثة الإنشاء'}`;

      const response = await generateContentFast(ai, prompt);

      res.json({ summary: (response.text || '').trim() });
    } catch (err) {
      console.error('Gemini summarize error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 6. Suggested Reply
  app.post('/api/gemini/suggest-reply', async (req: Request, res: Response) => {
    try {
      const caseData = req.body as {
        title?: string;
        taxType?: string;
        serviceType?: string;
        notes?: string;
        callerName?: string;
        targetRole?: 'agent' | 'management';
      };

      const ai = getGeminiClient();
      const prompt = `أنت مستشار الدعم وخدمة الممولين بمركز الاتصال المتكامل بمصلحة الضرائب المصرية.
اكتب مسودة رد رسمي مهذب، وافٍ، موجه للممول / المتصل:
اسم المتصل: ${caseData.callerName || 'الممول الكريم'}
نوع الضريبة: ${caseData.taxType || ''}
الخدمة المعنية: ${caseData.serviceType || ''}
عنوان الاستفسار: ${caseData.title || ''}
تفاصيل المشكلة: ${caseData.notes || 'استفسار عام'}
نوع الرد المطلوب: مسودة رد ${caseData.targetRole === 'management' ? 'فني تخصصي من الإدارة والدعم التقني' : 'وكيل الاتصال بالخط الساخن 16395'}

الشروط:
- لغة عربية رسمية رصينة
- ذكر الخط الساخن 16395
- ألا يزيد الرد عن 3 فقرات مركزة`;

      const response = await generateContentFast(ai, prompt);

      res.json({ reply: (response.text || '').trim() });
    } catch (err) {
      console.error('Gemini suggest-reply error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 7. Smart Search Parser
  app.post('/api/gemini/smart-search', async (req: Request, res: Response) => {
    try {
      const { userQuery, availableServices } = req.body as {
        userQuery?: string;
        availableServices?: string[];
      };
      if (!userQuery || !userQuery.trim()) {
        res.status(400).json({ error: 'برجاء إدخال نص البحث.' });
        return;
      }

      const defaultServices = [
        'منظومة التحفيز',
        'منظومة المرتبات Payroll',
        'منظومة SAP',
        'منظومة Eservices',
        'منظومة الفاتورة الالكترونية',
        'منظومة الايصال الالكتروني',
        'رد الضريبة',
        'التصرفات العقارية',
        'الثروة العقارية',
        'الخصم والتحصيل',
        'الدفعات المقدمة',
        'التسجيل والربط',
        'دورات تدريبية',
        'التهرب الضريبي',
        'عناوين المأموريات',
        'الاقرارات الضريبية',
        'استفسارات ضريبية',
        'السداد والتحصيل',
        'الفحص والطعون',
        'متابعة شكوى',
        'الاعفاءات',
        'رسائل SMS',
        'أخرى',
      ];
      const mergedServices = Array.from(
        new Set([
          ...defaultServices,
          ...(Array.isArray(availableServices)
            ? availableServices.filter((s) => typeof s === 'string' && s.trim())
            : []),
        ])
      );

      const ai = getGeminiClient();
      const prompt = `حلل استعلام البحث باللغة الطبيعية (بالعربية الفصحى أو العامية المصرية أو الإنجليزية أو أرقام الحالات/التسجيل الضريبي) لمركز الاتصال المتكامل بمصلحة الضرائب المصرية (16395) واستخرج معايير الفلترة الدقيقة فقط:
الاستعلام: "${userQuery.trim()}"

القيم الرسمية المعتمدة في المنظومة (التزم بها حرفياً عند المطابقة، واترك الحقل فارغاً "" إذا لم يُذكر):
- taxType: "ضرائب دخل" | "ضرائب قيمة مضافة" | ""
- callType: "طلب" | "استفسار" | "شكوى" | "رسائل SMS" | ""
- serviceType: اختر أقرب اسم خدمة رسمي حرفياً من هذه القائمة فقط: [${mergedServices.join(' ، ')}] أو ""
- status: اختر القيمة الدقيقة لحالة التذكرة إن ذكرت في الاستعلام:
  * "open" إذا ذُكر (مفتوحة / جارية / غير مغلقة / نشطة)
  * "incoming" إذا ذُكر (الواردة للإدارة أو الدعم)
  * "جديدة" إذا ذُكر (جديدة)
  * "قيد المعالجة" إذا ذُكر (قيد المعالجة)
  * "محولة للإدارة" إذا ذُكر (محولة للإدارة / المحولة للإدارة / محال للإدارة)
  * "محولة للدعم الفني" إذا ذُكر (محولة للدعم / الدعم الفني / الدعم التقني)
  * "محولة لوكيل الاتصال" إذا ذُكر (محولة لوكيل الاتصال / مرتجعة للوكيل)
  * "مغلقة" إذا ذُكر (مغلقة / منتهية / تم إغلاقها)
  * أو "" إذا لم تُذكر أي حالة
- priority: "عادي" | "هام" | "عاجل" | ""
- datePreset: "today" (اليوم/النهارده) | "week" (هذا الأسبوع/آخر 7 أيام) | "month" (هذا الشهر/الشهر ده) | "all"
- freeText: ضع هنا فقط الأسماء (اسم ممول، متصل، موظف)، أرقام الهواتف، أرقام التسجيل الضريبي (9 أرقام)، رقم الحالة مثل CRM-000001، أو كلمات بحث موضوعية إضافية لم تُغطَّ بالحقول المهيكلة أعلاه. إذا كان الاستعلام مغطى بالكامل بالحقول المهيكلة أعلاه فاترك freeText فارغاً "".`;

      const response = await generateContentFast(ai, prompt, {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            taxType: {
              type: Type.STRING,
              description: 'ضرائب دخل أو ضرائب قيمة مضافة أو فارغ',
            },
            callType: {
              type: Type.STRING,
              description: 'طلب أو استفسار أو شكوى أو رسائل SMS أو فارغ',
            },
            serviceType: {
              type: Type.STRING,
              description: 'الاسم الرسمي المطابق للخدمة من القائمة المحددة أو فارغ',
            },
            status: {
              type: Type.STRING,
              description:
                'open أو incoming أو جديدة أو قيد المعالجة أو محولة للإدارة أو محولة للدعم الفني أو محولة لوكيل الاتصال أو مغلقة أو فارغ',
            },
            priority: {
              type: Type.STRING,
              description: 'عادي أو هام أو عاجل أو فارغ',
            },
            datePreset: {
              type: Type.STRING,
              description: 'today أو week أو month أو all',
            },
            freeText: {
              type: Type.STRING,
              description:
                'كلمات البحث الإضافية (اسم/هاتف/رقم ضريبي/رقم حالة/موضوع خاص) أو فارغ إذا غطت الحقول الأخرى الاستعلام',
            },
          },
        },
      });

      const rawParsed = JSON.parse((response.text || '{}').trim()) as Record<string, string>;

      const normalizeAr = (v?: string) =>
        (v || '')
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[أإآ]/g, 'ا')
          .replace(/ى/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/\s+/g, ' ')
          .trim();

      // Normalize taxType
      let taxType: string | undefined;
      const nTax = normalizeAr(rawParsed.taxType);
      if (nTax.includes('قيمه مضافه') || nTax.includes('مضافه') || nTax.includes('vat')) {
        taxType = 'ضرائب قيمة مضافة';
      } else if (nTax.includes('دخل')) {
        taxType = 'ضرائب دخل';
      }

      // Normalize callType
      let callType: string | undefined;
      const nCall = normalizeAr(rawParsed.callType);
      if (nCall.includes('شكو')) callType = 'شكوى';
      else if (nCall.includes('استفسار')) callType = 'استفسار';
      else if (nCall.includes('طلب')) callType = 'طلب';
      else if (nCall.includes('sms') || nCall.includes('رسا')) callType = 'رسائل SMS';

      // Normalize serviceType against mergedServices
      let serviceType: string | undefined;
      const nSrv = normalizeAr(rawParsed.serviceType);
      if (nSrv) {
        const stripPrefix = (s: string) => normalizeAr(s).replace(/^منظومه\s+/, '').trim();
        const exact = mergedServices.find((s) => normalizeAr(s) === nSrv);
        const byBare =
          exact ||
          mergedServices.find((s) => stripPrefix(s) === stripPrefix(rawParsed.serviceType));
        const partial =
          byBare ||
          mergedServices.find((s) => {
            const ns = normalizeAr(s);
            const bs = stripPrefix(s);
            return (
              ns.includes(nSrv) ||
              (bs.length >= 3 && nSrv.includes(bs))
            );
          });
        serviceType = partial || undefined;
      }

      // Normalize status
      let status: string | undefined;
      const nStatus = normalizeAr(rawParsed.status);
      if (nStatus === 'open' || nStatus === 'مفتوحه' || nStatus === 'مفتوح') {
        status = 'open';
      } else if (nStatus === 'incoming' || nStatus.includes('الوارده')) {
        status = 'incoming';
      } else if (nStatus.includes('مغلق')) {
        status = 'مغلقة';
      } else if (nStatus.includes('جديد')) {
        status = 'جديدة';
      } else if (nStatus.includes('قيد المعالج')) {
        status = 'قيد المعالجة';
      } else if (nStatus.includes('ادار')) {
        status = 'محولة للإدارة';
      } else if (nStatus.includes('دعم')) {
        status = 'محولة للدعم الفني';
      } else if (nStatus.includes('وكيل')) {
        status = 'محولة لوكيل الاتصال';
      }

      // Normalize priority
      let priority: string | undefined;
      const nPri = normalizeAr(rawParsed.priority);
      if (nPri.includes('عاجل')) priority = 'عاجل';
      else if (nPri.includes('هام')) priority = 'هام';
      else if (nPri.includes('عادي')) priority = 'عادي';

      // Normalize datePreset
      const rawDate = (rawParsed.datePreset || '').trim().toLowerCase();
      const datePreset: 'today' | 'week' | 'month' | 'all' =
        rawDate === 'today' || rawDate === 'week' || rawDate === 'month' ? rawDate : 'all';

      // Clean redundant freeText when it merely repeats the matched serviceType/taxType
      let freeText = (rawParsed.freeText || '').trim();
      if (freeText) {
        const nf = normalizeAr(freeText).replace(/^منظومه\s+/, '').trim();
        const matchedBareSrv = serviceType
          ? normalizeAr(serviceType).replace(/^منظومه\s+/, '').trim()
          : '';
        if (
          (matchedBareSrv && (nf === matchedBareSrv || matchedBareSrv.includes(nf))) ||
          (taxType && normalizeAr(taxType) === nf) ||
          (callType && normalizeAr(callType) === nf)
        ) {
          freeText = '';
        }
      }

      const cleaned: Record<string, string> = { datePreset };
      if (taxType) cleaned.taxType = taxType;
      if (callType) cleaned.callType = callType;
      if (serviceType) cleaned.serviceType = serviceType;
      if (status) cleaned.status = status;
      if (priority) cleaned.priority = priority;
      if (freeText) cleaned.freeText = freeText;

      res.json(cleaned);
    } catch (err) {
      console.error('Gemini smart-search error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 8. Executive AI Insights: Agent Performance Evaluation + Common Issues & Proactive Alerts
  app.post('/api/gemini/executive-insights', async (req: Request, res: Response) => {
    try {
      const {
        periodLabel,
        focusAgentName,
        summaryStats,
        agentMetrics,
        serviceBreakdown,
        sampleCases,
      } = req.body as {
        periodLabel?: string;
        focusAgentName?: string;
        summaryStats?: {
          totalCases: number;
          openCases: number;
          closedCases: number;
          escalatedCases: number;
          overdue72hCases: number;
          closeRatePct: number;
        };
        agentMetrics?: Array<{
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
        }>;
        serviceBreakdown?: Array<{
          serviceType: string;
          taxType: string;
          count: number;
          openCount: number;
          escalatedCount: number;
          overdue72hCount: number;
        }>;
        sampleCases?: Array<{
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
      };

      if (!summaryStats || !Array.isArray(agentMetrics)) {
        res.status(400).json({ error: 'بيانات التحليل المطلوبة غير مكتملة.' });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = `أنت مستشار الجودة التنفيذي ومراقب الأداء الذكي في مركز الاتصال المتكامل بمصلحة الضرائب المصرية (16395).
مهمتك مساعدة الإدارة العليا ومدير النظام والدعم التقني في:
1. تقييم أداء وكلاء الاتصال تقييماً موضوعياً مبنياً بدقة على الأرقام الفعلية (عدد الحالات، نسبة الإغلاق، الحالات المتأخرة +72 ساعة، الحالات المحولة، ومتوسط زمن الحل) وجودة الملاحظات والردود.
2. تحديد ورصد المشاكل والاستفسارات الأكثر شيوعاً وتكراراً لدى الممولين، وتحليل أسبابها الجذرية واقتراح إجراءات حل فنية أو تشغيلية، مع ربطها بأرقام الحالات الفعلية (CRM-XXXXXX) الواردة في البيانات فقط.
3. صياغة إخطارات وتنبيهات استباقية جاهزة للإرسال لوكلاء الاتصال أو للإدارة والدعم التقني للتدخل السريع أو توحيد الإجابات.

قواعد صارمة:
- التزم باللغة العربية الإدارية الواضحة والاحترافية.
- اعتمد حصراً على البيانات المرفقة دون اختلاق أرقام أو أسماء حالات غير موجودة.
- إذا كان أحد الوكلاء لديه 0 حالات مسجلة أو متابعة خلال الفترة، أشر إلى ذلك بوضوح في الملاحظات دون مبالغة.
- أرجع مخرجات JSON مطابقة تماماً للمخطط المطلوب.`;

      const prompt = [
        `الفترة الزمنية المحللة: ${periodLabel || 'كافة الفترات'}`,
        focusAgentName ? `التركيز المطلوب على الوكيل: ${focusAgentName}` : 'نطاق التقييم: كافة وكلاء الاتصال بالمركز',
        '',
        '=== الملخص الكمي العام للمركز ===',
        JSON.stringify(summaryStats),
        '',
        '=== مؤشرات وكلاء الاتصال ===',
        JSON.stringify(agentMetrics.slice(0, 30)),
        '',
        '=== توزيع الخدمات والشكاوى والاستفسارات ===',
        JSON.stringify((serviceBreakdown || []).slice(0, 25)),
        '',
        '=== عينة من الحالات الفعلية والعناوين والملاحظات ===',
        JSON.stringify((sampleCases || []).slice(0, 55)),
      ].join('\n');

      const insightsSchema = {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: 'ملخص تنفيذي مركز من 3 إلى 4 جمل لحالة المركز والأداء وأبرز الاختناقات.',
          },
          overallRiskLevel: {
            type: Type.STRING,
            description: 'طبيعي أو متوسط أو مرتفع',
          },
          agentEvaluations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                agentName: { type: Type.STRING },
                crmUser: { type: Type.STRING },
                performanceRating: {
                  type: Type.STRING,
                  description: 'ممتاز أو جيد جداً أو جيد أو يحتاج متابعة',
                },
                performanceScore: {
                  type: Type.INTEGER,
                  description: 'درجة موضوعية من 0 إلى 100 بناءً على الإنجاز والالتزام',
                },
                strengths: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                improvementAreas: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                coachingRecommendation: {
                  type: Type.STRING,
                  description: 'توصية إدارية وتدريبية عملية للوكيل',
                },
              },
              required: [
                'agentName',
                'crmUser',
                'performanceRating',
                'performanceScore',
                'strengths',
                'improvementAreas',
                'coachingRecommendation',
              ],
            },
          },
          commonIssues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                issueTitle: { type: Type.STRING },
                category: { type: Type.STRING },
                severity: {
                  type: Type.STRING,
                  description: 'حرج أو مرتفع أو متوسط',
                },
                estimatedFrequency: {
                  type: Type.STRING,
                  description: 'وصف التكرار والعدد من واقع البيانات',
                },
                rootCauseHypothesis: { type: Type.STRING },
                recommendedAction: { type: Type.STRING },
                relatedCaseIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                'issueTitle',
                'category',
                'severity',
                'estimatedFrequency',
                'rootCauseHypothesis',
                'recommendedAction',
                'relatedCaseIds',
              ],
            },
          },
          proactiveAlerts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                alertTitle: { type: Type.STRING },
                severity: {
                  type: Type.STRING,
                  description: 'عاجل أو تنبيه أو معلومة',
                },
                targetAudience: {
                  type: Type.STRING,
                  description: 'agents أو management أو both',
                },
                alertMessage: {
                  type: Type.STRING,
                  description: 'نص إخطار رسمي واضح ومختصر جاهز للإرسال المباشر للمستهدفين',
                },
              },
              required: ['alertTitle', 'severity', 'targetAudience', 'alertMessage'],
            },
          },
        },
        required: [
          'executiveSummary',
          'overallRiskLevel',
          'agentEvaluations',
          'commonIssues',
          'proactiveAlerts',
        ],
      };

      const callInsightsModel = async (model: string, thinkingLevel: ThinkingLevel, timeoutMs: number) => {
        const reqPromise = ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: insightsSchema,
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`TIMEOUT_${model}`)), timeoutMs)
        );
        return Promise.race([reqPromise, timeoutPromise]);
      };

      let response;
      try {
        response = await callInsightsModel('gemini-4-hydrogen', ThinkingLevel.LOW, 35000);
      } catch (primaryErr) {
        console.warn('executive-insights primary model fallback:', primaryErr);
        response = await callInsightsModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, 25000);
      }

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (err) {
      console.error('Gemini executive-insights error:', err);
      const { status, message } = getFriendlyGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Case Document Attachments Endpoints (stored on server disk, metadata in Firestore)
  app.post('/api/attachments/upload', async (req: Request, res: Response) => {
    try {
      const { fileName, mimeType, dataBase64 } = req.body as {
        fileName?: string;
        mimeType?: string;
        dataBase64?: string;
      };

      if (!fileName || typeof fileName !== 'string' || !dataBase64 || typeof dataBase64 !== 'string') {
        res.status(400).json({ error: 'بيانات الملف المرفق غير مكتملة.' });
        return;
      }

      const cleanBase64 = dataBase64.includes(',') ? dataBase64.split(',').pop() || '' : dataBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');

      if (!buffer || buffer.length === 0) {
        res.status(400).json({ error: 'تعذر قراءة محتوى الملف المرفق.' });
        return;
      }

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        res.status(413).json({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت لكل ملف).' });
        return;
      }

      const rawExt = path.extname(fileName).toLowerCase();
      const normalizedMime = (mimeType || '').split(';')[0].trim().toLowerCase();
      const safeExt = MIME_TO_EXT[normalizedMime] || (EXT_TO_MIME[rawExt] ? rawExt : '');

      if (!safeExt) {
        res.status(400).json({
          error: 'صيغة الملف غير مدعومة. الصيغ المتاحة: PDF، الصور (JPG/PNG/WEBP)، Word، Excel، CSV، أو TXT.',
        });
        return;
      }

      const safeStoredName = `att_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${safeExt}`;
      const targetPath = path.join(ATTACHMENTS_DIR, safeStoredName);
      await fs.promises.writeFile(targetPath, buffer);

      const resolvedMime = EXT_TO_MIME[safeExt] || normalizedMime || 'application/octet-stream';
      const safeOriginalName = path.basename(fileName).slice(0, 180) || safeStoredName;

      res.status(201).json({
        storedName: safeStoredName,
        url: `/api/attachments/file/${encodeURIComponent(safeStoredName)}`,
        sizeBytes: buffer.length,
        mimeType: resolvedMime,
        fileName: safeOriginalName,
      });
    } catch (err) {
      console.error('Attachment upload error:', err);
      res.status(500).json({ error: 'حدث خطأ في الخادم أثناء حفظ المستند المرفق.' });
    }
  });

  app.get('/api/attachments/file/:storedName', (req: Request, res: Response) => {
    try {
      const baseName = path.basename(req.params.storedName || '');
      if (!baseName || !/^[a-zA-Z0-9._-]+$/.test(baseName)) {
        res.status(400).json({ error: 'اسم الملف غير صالح.' });
        return;
      }

      const resolvedPath = path.resolve(ATTACHMENTS_DIR, baseName);
      if (!resolvedPath.startsWith(ATTACHMENTS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
        res.status(404).json({ error: 'المستند المرفق غير موجود.' });
        return;
      }

      const ext = path.extname(baseName).toLowerCase();
      const contentType = EXT_TO_MIME[ext] || 'application/octet-stream';
      const downloadName = typeof req.query.name === 'string' && req.query.name.trim()
        ? path.basename(req.query.name.trim()).slice(0, 180)
        : baseName;
      const dispositionType = req.query.download === '1' ? 'attachment' : 'inline';

      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename*=UTF-8''${encodeURIComponent(downloadName)}`
      );
      res.sendFile(resolvedPath);
    } catch (err) {
      console.error('Attachment get error:', err);
      res.status(500).json({ error: 'تعذر عرض المستند المرفق.' });
    }
  });

  app.delete('/api/attachments/file/:storedName', async (req: Request, res: Response) => {
    try {
      const baseName = path.basename(req.params.storedName || '');
      if (!baseName || !/^[a-zA-Z0-9._-]+$/.test(baseName)) {
        res.status(400).json({ error: 'اسم الملف غير صالح.' });
        return;
      }

      const resolvedPath = path.resolve(ATTACHMENTS_DIR, baseName);
      if (!resolvedPath.startsWith(ATTACHMENTS_DIR + path.sep)) {
        res.status(400).json({ error: 'مسار غير صالح.' });
        return;
      }

      if (fs.existsSync(resolvedPath)) {
        await fs.promises.unlink(resolvedPath);
      }
      res.json({ deleted: true });
    } catch (err) {
      console.error('Attachment delete error:', err);
      res.status(500).json({ error: 'تعذر حذف ملف المرفق.' });
    }
  });

  app.get('/api/app-version', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const distDir = path.resolve(__dirname, 'dist');
    const versionFile = path.join(distDir, 'version.json');
    let distVersion: { buildId?: string; builtAt?: string } | null = null;

    try {
      if (fs.existsSync(versionFile)) {
        const raw = fs.readFileSync(versionFile, 'utf8');
        distVersion = JSON.parse(raw) as { buildId?: string; builtAt?: string };
      }
    } catch {
      distVersion = null;
    }

    let prodFallbackId = '';
    if (isProduction && !distVersion?.buildId) {
      try {
        const indexHtmlPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
          const hash = crypto
            .createHash('sha256')
            .update(fs.readFileSync(indexHtmlPath))
            .digest('hex')
            .slice(0, 12);
          prodFallbackId = `prod-${hash}`;
        }
      } catch {
        prodFallbackId = '';
      }
    }

    const buildId = isProduction
      ? distVersion?.buildId || prodFallbackId || SERVER_BOOT_ID
      : distVersion?.buildId
      ? `${SERVER_BOOT_ID}:${distVersion.buildId}`
      : SERVER_BOOT_ID;

    res.json({
      buildId,
      builtAt: distVersion?.builtAt || SERVER_BOOT_AT,
      mode: isProduction ? 'production' : 'development',
    });
  });

  const httpServer = http.createServer(app);

  // Prevent Vite dev middleware from exposing root-level internal JSON configs or service-account keys
  const PUBLIC_CLIENT_ROOT_JSON = new Set(['firebase-applet-config.json']);
  app.use((req, res, next) => {
    if (req.path.endsWith('.json') && !req.path.startsWith('/api/')) {
      const rel = req.path.replace(/^\/+/, '');
      if (
        rel &&
        !rel.includes('/') &&
        !PUBLIC_CLIENT_ROOT_JSON.has(rel) &&
        fs.existsSync(path.resolve(__dirname, rel))
      ) {
        res.status(404).end();
        return;
      }
    }
    next();
  });

  // Vite dev middleware or static production build
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('version.json')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
