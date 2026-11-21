/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic,
  Square,
  Check,
  X,
  Sparkles,
  AlertCircle,
  RotateCcw,
  Wand2,
  Loader2,
  Volume2,
} from 'lucide-react';
import {
  transcribeAudioWithAI,
  polishArabicTranscriptWithAI,
} from '../services/geminiService';
import { normalizeVoiceDigitsLtr } from '../utils/normalization';
import { StyledTextarea } from './StyledTextarea';

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
  title?: string;
  initialText?: string;
}

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف الصوتي.'));
    reader.readAsDataURL(blob);
  });
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'تسجيل صوتي ذكي وتحويل الصوت إلى نص عربي',
  initialText = '',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [transcript, setTranscript] = useState(initialText);
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const isRecordingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Preserves text before the current recording session so AI transcription replaces only the new draft cleanly
  const preSessionTextRef = useRef<string>('');
  const liveSessionSpeechRef = useRef<string>('');
  const lastFinalChunkRef = useRef<string>('');
  const transcriptRef = useRef<string>(initialText);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const cleanupMediaResources = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (analyserRafRef.current !== null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
    setInterimText('');
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTranscript(initialText);
      transcriptRef.current = initialText;
      setInterimText('');
      setErrorMsg(null);
      setStatusNote(null);
      setElapsedSeconds(0);
    } else {
      isRecordingRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      cleanupMediaResources();
      setIsRecording(false);
      setIsTranscribing(false);
    }
  }, [isOpen, initialText, cleanupMediaResources]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      cleanupMediaResources();
    };
  }, [cleanupMediaResources]);

  const startLiveSpeechPreview = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const launchRecognition = () => {
      if (!isRecordingRef.current) return;
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'ar-EG';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          let newFinal = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            const piece = (res[0]?.transcript || '').trim();
            if (!piece) continue;

            if (res.isFinal) {
              // Guard against mobile Chrome repeating the exact last final phrase
              if (piece !== lastFinalChunkRef.current) {
                lastFinalChunkRef.current = piece;
                newFinal += (newFinal ? ' ' : '') + piece;
              }
            } else {
              currentInterim += (currentInterim ? ' ' : '') + piece;
            }
          }

          if (newFinal) {
            const cleanFinal = normalizeVoiceDigitsLtr(newFinal);
            liveSessionSpeechRef.current = liveSessionSpeechRef.current
              ? `${liveSessionSpeechRef.current} ${cleanFinal}`
              : cleanFinal;
            const base = preSessionTextRef.current.trim();
            const combined = normalizeVoiceDigitsLtr(
              base ? `${base} ${liveSessionSpeechRef.current}` : liveSessionSpeechRef.current
            );
            setTranscript(combined);
          }
          setInterimText(normalizeVoiceDigitsLtr(currentInterim));
        };

        recognition.onerror = (event: any) => {
          // Non-fatal: MediaRecorder + Gemini AI continues recording reliably
          if (event.error === 'aborted' || event.error === 'no-speech') return;
          console.warn('Live speech preview note:', event.error);
        };

        recognition.onend = () => {
          if (isRecordingRef.current) {
            // Auto-restart on mobile browsers that stop Web Speech after a pause
            setTimeout(() => {
              if (isRecordingRef.current) {
                launchRecognition();
              }
            }, 150);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        // Live preview optional when MediaRecorder is running
      }
    };

    launchRecognition();
  }, []);

  const startRecording = async () => {
    setErrorMsg(null);
    setStatusNote(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('المتصفح لا يتيح الوصول إلى الميكروفون في هذا السياق. يرجى استخدام متصفح حديث أو السماح بالميكروفون.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      preSessionTextRef.current = transcriptRef.current.trim();
      liveSessionSpeechRef.current = '';
      lastFinalChunkRef.current = '';
      audioChunksRef.current = [];
      setElapsedSeconds(0);

      // Setup live audio volume meter
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioContextRef.current = ctx;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tickLevel = () => {
            if (!isRecordingRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 90) * 100)));
            analyserRafRef.current = requestAnimationFrame(tickLevel);
          };
          analyserRafRef.current = requestAnimationFrame(tickLevel);
        }
      } catch {
        // Visual meter optional
      }

      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedMime = recorder.mimeType || mimeType || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        cleanupMediaResources();

        if (chunks.length === 0) return;

        const audioBlob = new Blob(chunks, { type: recordedMime });
        if (audioBlob.size < 600) {
          if (!liveSessionSpeechRef.current) {
            setStatusNote('التسجيل قصير جداً أو لم يتم التقاط صوت واضح.');
          }
          return;
        }

        setIsTranscribing(true);
        setStatusNote('جارٍ تحويل الصوت إلى نص عربي دقيق (دعم كامل للعامية المصرية)...');
        try {
          const audioBase64 = await blobToBase64(audioBlob);
          const aiText = await transcribeAudioWithAI({
            audioBase64,
            mimeType: recordedMime,
            contextHint: title,
          });

          if (aiText) {
            const cleanAiText = normalizeVoiceDigitsLtr(aiText);
            const base = preSessionTextRef.current;
            const nextValue = normalizeVoiceDigitsLtr(base ? `${base} ${cleanAiText}` : cleanAiText);
            setTranscript(nextValue);
            setStatusNote('تم التفريغ الصوتي باللغة العربية بدقة عالية.');
          } else if (!liveSessionSpeechRef.current) {
            setStatusNote('لم يتم اكتشاف كلام واضح في التسجيل، يمكنك المحاولة مجدداً.');
          }
        } catch (err: any) {
          console.warn('Server transcription fallback to live dictation:', err);
          if (liveSessionSpeechRef.current) {
            setStatusNote('تم الاحتفاظ بنص الإملاء المباشر (ar-EG).');
          } else {
            setErrorMsg(err?.message || 'تعذر تفريغ التسجيل الصوتي، يرجى المحاولة مرة أخرى.');
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      isRecordingRef.current = true;
      setIsRecording(true);
      mediaRecorderRef.current = recorder;
      recorder.start(500);

      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start Web Speech API live draft preview alongside MediaRecorder
      startLiveSpeechPreview();
    } catch (err: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      cleanupMediaResources();
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setErrorMsg('تم رفض إذن الميكروفون. يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح ثم إعادة المحاولة.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setErrorMsg('لم يتم العثور على ميكروفون متصل بالجهاز.');
      } else {
        setErrorMsg(`تعذر بدء التسجيل الصوتي: ${err?.message || 'خطأ غير متوقع'}`);
      }
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupMediaResources();
      }
    } else {
      cleanupMediaResources();
    }
  };

  const handlePolishArabic = async () => {
    if (!transcript.trim() || isPolishing) return;
    setIsPolishing(true);
    setErrorMsg(null);
    try {
      const polished = await polishArabicTranscriptWithAI(transcript);
      if (polished) {
        setTranscript(normalizeVoiceDigitsLtr(polished));
        setStatusNote('تم تنقيح الإملاء وعلامات الترقيم العربية بنجاح.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تنقيح النص حالياً.');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleConfirm = () => {
    if (isRecording) {
      stopRecording();
    }
    onConfirm(normalizeVoiceDigitsLtr(transcript).trim());
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#001429]/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#00386B] w-full max-w-lg max-h-[92dvh] my-auto overflow-hidden flex flex-col animate-scale-in text-right">
        {/* Header */}
        <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00A651] text-white shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{title}</h3>
              <p className="text-xs text-sky-200">
                تفريغ صوتي ذكي للغة العربية الفصحى والعامية المصرية (ar-EG)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sky-200 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusNote && !errorMsg && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-xs text-emerald-900 dark:text-emerald-200 font-semibold">
              {isTranscribing ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[#00A651]" />
              ) : (
                <Volume2 className="w-4 h-4 shrink-0 text-[#00A651]" />
              )}
              <span>{statusNote}</span>
            </div>
          )}

          {/* Microphone Control Panel */}
          <div className="flex flex-col items-center justify-center py-4 px-3 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] rounded-2xl">
            <button
              type="button"
              disabled={isTranscribing}
              onClick={isRecording ? stopRecording : startRecording}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-md disabled:opacity-60 ${
                isRecording
                  ? 'bg-rose-600 text-white shadow-rose-300 dark:shadow-rose-950 scale-105'
                  : 'bg-[#00A651] hover:bg-[#008742] text-white hover:scale-105'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-9 h-9 animate-spin" />
              ) : isRecording ? (
                <Square className="w-8 h-8 fill-current" />
              ) : (
                <Mic className="w-9 h-9" />
              )}
              {isRecording && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-600"></span>
                </span>
              )}
            </button>

            <div className="mt-3 text-center w-full max-w-xs">
              <div className="font-bold text-sm text-slate-800 dark:text-white flex items-center justify-center gap-2">
                <span>
                  {isTranscribing
                    ? 'جارٍ المعالجة والتفريغ بالعربية...'
                    : isRecording
                    ? 'جارٍ الاستماع والتسجيل الآن...'
                    : 'اضغط على الميكروفون لبدء التسجيل'}
                </span>
                {isRecording && (
                  <span className="font-mono text-xs text-rose-600 dark:text-rose-400 tabular-nums">
                    {formatTimer(elapsedSeconds)}
                  </span>
                )}
              </div>

              {isRecording ? (
                <div className="mt-2.5 w-full h-2 bg-slate-200 dark:bg-[#0B1D35] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00A651] transition-all duration-75 rounded-full"
                    style={{ width: `${Math.max(8, audioLevel)}%` }}
                  />
                </div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  يدعم التحدث بالفصحى أو بالعامية المصرية بدقة عالية، ثم اضغط إيقاف للاعتماد
                </div>
              )}
            </div>
          </div>

          {/* Editable Transcript Area */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                النص الناتج (يمكنك التعديل أو الإضافة يدوياً):
              </label>
              <div className="flex items-center gap-2">
                {transcript.trim() && (
                  <button
                    type="button"
                    onClick={handlePolishArabic}
                    disabled={isPolishing || isRecording || isTranscribing}
                    className="text-xs font-bold text-[#004B87] dark:text-sky-300 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {isPolishing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    تنقيح الإملاء العربي
                  </button>
                )}
                {transcript && (
                  <button
                    type="button"
                    onClick={() => {
                      setTranscript('');
                      setStatusNote(null);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> مسح
                  </button>
                )}
              </div>
            </div>
            <StyledTextarea
              rows={4}
              dir="rtl"
              value={transcript}
              onChange={(e) => setTranscript(normalizeVoiceDigitsLtr(e.target.value))}
              placeholder="سيظهر الكلام المسجل هنا باللغة العربية تلقائياً، ويمكنك تعديله قبل اعتماده..."
              className="w-full text-sm p-3 bg-white dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl focus:ring-2 focus:ring-[#00A651] focus:border-[#00A651] text-slate-800 dark:text-white leading-relaxed resize-none shadow-xs focus:outline-none"
            />
            {interimText && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300 italic bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg mt-1.5 border border-emerald-200/60 dark:border-emerald-800 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                <span>{interimText}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!transcript.trim() || isTranscribing}
            className="px-5 py-2 text-xs font-bold bg-[#00A651] hover:bg-[#008742] text-white rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            <Check className="w-4 h-4" />
            اعتماد النص وإدراجه
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
