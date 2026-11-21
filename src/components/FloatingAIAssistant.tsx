/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Mic,
  Copy,
  Check,
  Loader2,
  Bot,
  GripHorizontal,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { User } from '../types';
import { askSmartAssistantWithAI, AssistantChatMessage } from '../services/geminiService';
import { getRoleDefaultJobTitle } from '../services/userService';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { StyledTextarea } from './StyledTextarea';

interface FloatingAIAssistantProps {
  currentUser: User;
}

const STORAGE_POS_KEY = 'eta_crm_ai_assistant_pos_v1';
const BTN_SIZE = 58;
const MARGIN = 12;

function clampPosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 18, y: 200 };
  const maxX = Math.max(MARGIN, window.innerWidth - BTN_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - BTN_SIZE - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(MARGIN, y), maxY),
  };
}

function getDefaultPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 18, y: 300 };
  const bottomOffset = window.innerWidth < 1024 ? 236 : 168;
  return clampPosition(18, window.innerHeight - bottomOffset);
}

export const FloatingAIAssistant: React.FC<FloatingAIAssistantProps> = ({ currentUser }) => {
  const buildWelcomeMessage = useCallback((): AssistantChatMessage => {
    const firstName = (currentUser.fullName || currentUser.username || 'زميلنا').trim().split(/\s+/)[0];
    return {
      role: 'model',
      text: `أهلاً بك يا ${firstName}! أنا المساعد الذكي لمنظومة مركز الاتصال المتكامل (16395). يمكنك سؤالي باللغة العربية الفصحى أو العامية المصرية عن أي إجراء ضريبي، صياغة رد لممول، أو أي استفسار داخل المنظومة.`,
    };
  }, [currentUser.fullName, currentUser.username]);

  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_POS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return clampPosition(parsed.x, parsed.y);
        }
      }
    } catch {
      // ignore
    }
    return getDefaultPosition();
  });

  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => [buildWelcomeMessage()]);
  const [streamingText, setStreamingText] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };
    const onExternalOpen = () => {
      setIsOpen(true);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('eta:open-ai-assistant', onExternalOpen);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('eta:open-ai-assistant', onExternalOpen);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, messages.length, streamingText]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origX: position.x,
      origY: position.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    if (Math.hypot(dx, dy) > 6) {
      dragStartRef.current.moved = true;
      setIsDragging(true);
      setPosition(clampPosition(dragStartRef.current.origX + dx, dragStartRef.current.origY + dy));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const wasMoved = dragStartRef.current.moved;
    dragStartRef.current = null;
    setIsDragging(false);

    if (wasMoved) {
      setPosition((latest) => {
        try {
          localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(latest));
        } catch {
          // ignore
        }
        return latest;
      });
    } else {
      setIsOpen((prev) => !prev);
    }
  };

  const sendMessage = useCallback(
    async (textToSend?: string) => {
      const content = (textToSend ?? inputText).trim();
      if (!content || isSending) return;

      const userMsg: AssistantChatMessage = { role: 'user', text: content };
      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      if (!textToSend) setInputText('');
      setErrorMsg(null);
      setStreamingText('');
      setIsSending(true);

      try {
        // Omit the initial static UI greeting so Gemini always receives a user-first turn sequence
        const conversationTurns = nextHistory.slice(1);
        const { reply, sources } = await askSmartAssistantWithAI({
          messages: conversationTurns.length > 0 ? conversationTurns : [userMsg],
          userContext: {
            fullName: currentUser.fullName,
            roleLabel: getRoleDefaultJobTitle(currentUser.role),
          },
          onChunk: (partial) => {
            setStreamingText(partial);
          },
        });
        setStreamingText('');
        setMessages((prev) => [...prev, { role: 'model', text: reply, sources }]);
      } catch (err: any) {
        setStreamingText('');
        setErrorMsg(err?.message || 'تعذر الاتصال بالمساعد الذكي حالياً، يرجى إعادة المحاولة.');
      } finally {
        setIsSending(false);
      }
    },
    [inputText, isSending, messages, currentUser.fullName, currentUser.role]
  );

  const handleCopy = (idx: number, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1600);
  };

  const handleReset = () => {
    setMessages([buildWelcomeMessage()]);
    setStreamingText('');
    setErrorMsg(null);
  };

  // Compute safe panel anchor relative to draggable button
  const getPanelStyle = (): React.CSSProperties => {
    if (typeof window === 'undefined') return { left: 16, bottom: 80 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelWidth = Math.min(400, vw - 24);
    const panelHeight = Math.min(540, vh - 96);

    const preferRightOfButton = position.x < vw / 2;
    let left = preferRightOfButton ? position.x : position.x + BTN_SIZE - panelWidth;
    left = Math.min(Math.max(12, left), vw - panelWidth - 12);

    const openAbove = position.y > vh / 2;
    let top = openAbove
      ? position.y - panelHeight - 10
      : position.y + BTN_SIZE + 10;
    top = Math.min(Math.max(12, top), vh - panelHeight - 12);

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${panelWidth}px`,
      height: `${panelHeight}px`,
    };
  };

  const quickPrompts = [
    'خطوات تفعيل الفاتورة الإلكترونية لممول جديد',
    'صياغة رد رسمي لممول يستفسر عن الإقرار الضريبي',
    'أحدث تعليمات مصلحة الضرائب المصرية عبر الإنترنت',
    'ما الفرق بين الإيصال الإلكتروني والفاتورة الإلكترونية؟',
  ];

  return createPortal(
    <>
      {/* Draggable Pulsing AI Assistant Floating Button */}
      <div
        style={{ left: `${position.x}px`, top: `${position.y}px`, width: BTN_SIZE, height: BTN_SIZE }}
        className="fixed z-45 select-none print:hidden"
        dir="rtl"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[#00A651] opacity-45 animate-ping pointer-events-none"
        />
        <span
          aria-hidden="true"
          className="absolute -inset-1 rounded-full border-2 border-[#00A651]/60 animate-pulse pointer-events-none"
        />

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="المساعد الذكي Gemini (اسحب للتحريك في أي مكان)"
          aria-label="المساعد الذكي"
          className={`relative w-full h-full rounded-full bg-[#00264D] hover:bg-[#00386B] text-white border-2 border-[#00A651] shadow-xl flex flex-col items-center justify-center touch-none transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A651] ${
            isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab hover:scale-105'
          }`}
        >
          <Sparkles className="w-5 h-5 text-[#00E676]" />
          <span className="text-[10px] font-extrabold leading-none mt-0.5 text-white">ذكي</span>
        </button>
      </div>

      {/* Modern Smart AI Assistant Panel */}
      {isOpen && (
        <div
          style={getPanelStyle()}
          dir="rtl"
          className="fixed z-[75] bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#004B87] flex flex-col overflow-hidden animate-scale-in text-right print:hidden"
        >
          {/* Header */}
          <div className="bg-[#00264D] text-white px-4 py-3 flex items-center justify-between border-b border-[#004B87] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#00A651] text-white flex items-center justify-center shadow-xs shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <span>المساعد الذكي Gemini</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                </h3>
                <p className="text-[11px] text-sky-200 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-[#00E676] shrink-0" />
                  <span>بحث مباشر على الإنترنت · اسحب الأيقونة لأي مكان</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                title="محادثة جديدة"
                className="p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="إغلاق"
                aria-label="إغلاق المساعد الذكي"
                className="p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 dark:bg-[#071629]">
            {messages.length <= 1 && (
              <div className="space-y-1.5 pb-1">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <GripHorizontal className="w-3.5 h-3.5 text-[#00A651]" />
                  <span>استفسارات سريعة مقترحة:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendMessage(qp)}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] text-[#004B87] dark:text-sky-200 hover:border-[#00A651] hover:text-[#008742] transition-colors text-right"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-2xs ${
                      isUser
                        ? 'bg-[#004B87] text-white rounded-tr-sm'
                        : 'bg-white dark:bg-[#0B1D35] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-[#00386B] rounded-tl-sm'
                    }`}
                  >
                    <div>{msg.text}</div>

                    {/* Grounded Web Search Citations */}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#00386B] space-y-1">
                        <div className="text-[10px] font-extrabold text-[#004B87] dark:text-sky-300 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-[#00A651]" />
                          <span>مصادر البحث على الإنترنت:</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          {msg.sources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-[#004B87] dark:text-sky-300 hover:underline flex items-center gap-1 truncate"
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#00A651]" />
                              <span className="truncate">{src.title || src.uri}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {!isUser && idx > 0 && (
                    <button
                      type="button"
                      onClick={() => handleCopy(idx, msg.text)}
                      className="mt-1 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-[#004B87] dark:text-slate-400 dark:hover:text-sky-300 flex items-center gap-1"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check className="w-3 h-3 text-[#00A651]" />
                          تم النسخ
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          نسخ الرد
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Live streaming partial answer */}
            {isSending && streamingText && (
              <div className="flex flex-col items-end">
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-2xs bg-white dark:bg-[#0B1D35] text-slate-800 dark:text-slate-100 border border-[#00A651]/50">
                  {streamingText}
                  <span className="inline-block w-1.5 h-3.5 bg-[#00A651] align-middle mr-1 animate-pulse" />
                </div>
              </div>
            )}

            {isSending && !streamingText && (
              <div className="flex items-center gap-2 text-xs text-[#004B87] dark:text-sky-300 font-bold bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] rounded-xl px-3 py-2 w-fit">
                <Loader2 className="w-4 h-4 animate-spin text-[#00A651]" />
                <span>جارٍ البحث وصياغة الإجابة...</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 font-semibold">
                {errorMsg}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-2.5 bg-white dark:bg-[#0B1D35] border-t border-slate-200 dark:border-[#00386B] flex items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsVoiceOpen(true)}
              title="تحدث بالصوت (يدعم العامية المصرية)"
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#071629] hover:bg-emerald-50 dark:hover:bg-[#00386B] text-[#004B87] dark:text-sky-200 border border-slate-200 dark:border-[#00386B] transition-colors shrink-0"
            >
              <Mic className="w-4 h-4 text-[#00A651]" />
            </button>

            <StyledTextarea
              ref={inputRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="اسأل أي سؤال أو استفسار..."
              className="flex-1 max-h-24 p-2 text-xs bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none resize-none"
            />

            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!inputText.trim() || isSending}
              className="p-2.5 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white disabled:opacity-50 transition-colors shrink-0"
              aria-label="إرسال"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Voice input modal for speaking inquiries in Egyptian Arabic */}
      <VoiceRecorderModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onConfirm={(text) => {
          if (text) {
            setInputText(text);
            setTimeout(() => inputRef.current?.focus(), 60);
          }
        }}
        title="إملاء الاستفسار صوتياً للمساعد الذكي"
        initialText={inputText}
      />
    </>,
    document.body
  );
};
