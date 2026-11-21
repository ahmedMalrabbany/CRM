/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  X,
  Send,
  AlertTriangle,
  Mic,
  GripHorizontal,
  Check,
  CheckCheck,
  Hash,
  Reply,
  AtSign,
  Trash2,
  Smile,
  Users,
  UserCheck,
  Search,
  Target,
  BellDot,
  ExternalLink,
  ShieldAlert,
  PauseCircle,
  PlayCircle,
  Lock,
  Clock,
  Eraser,
  Paperclip,
  Eye,
  Download,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  Loader2,
} from 'lucide-react';
import { Case, ChatAttachment, TeamChatControl, TeamChatMessage, User } from '../types';
import { StyledTextarea } from './StyledTextarea';
import {
  subscribeToTeamChatMessages,
  subscribeToTeamChatControl,
  isTeamChatPaused,
  formatChatPauseRemaining,
  pauseTeamChat,
  resumeTeamChat,
  clearPublicTeamChatMessages,
  clearDmTeamChatMessages,
  clearAllTeamChatMessages,
  sendTeamChatMessage,
  deleteTeamChatMessage,
  markTeamChatMessagesAsRead,
} from '../services/teamChatService';
import {
  getRoleDefaultJobTitle,
  normalizeUserRole,
  isUserOnline,
} from '../services/userService';
import {
  ATTACHMENT_ACCEPT_ATTR,
  formatFileSizeArabic,
  getAttachmentDownloadUrl,
  getAttachmentInlineUrl,
  getFileExtension,
  isPreviewableImage,
  isPreviewablePdf,
  uploadChatAttachment,
  validateAttachmentFile,
} from '../services/attachmentService';
import { CaseAttachmentPreviewModal, QueuedAttachmentFile } from './CaseAttachmentsSection';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { playAlertSound } from '../utils/soundAlerts';

const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 10;

function renderChatFileIcon(mimeType: string, fileName: string) {
  const ext = getFileExtension(fileName);
  if (isPreviewableImage(mimeType, fileName)) {
    return <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />;
  }
  if (isPreviewablePdf(mimeType, fileName)) {
    return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
  }
  if (['.xls', '.xlsx', '.csv'].includes(ext) || mimeType.includes('sheet') || mimeType.includes('excel')) {
    return <FileSpreadsheet className="w-4 h-4 text-[#00A651] shrink-0" />;
  }
  if (['.doc', '.docx'].includes(ext) || mimeType.includes('word')) {
    return <FileText className="w-4 h-4 text-sky-500 shrink-0" />;
  }
  return <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />;
}

interface FloatingTeamChatProps {
  currentUser: User;
  allUsers?: User[];
  cases?: Case[];
  onOpenCaseById?: (caseCode: string) => void;
}

const STORAGE_POS_KEY = 'eta_crm_team_chat_pos_v1';
const BTN_SIZE = 58;
const MARGIN = 12;

const EMOJI_LIST = [
  '👍', '✅', '🙏', '😊', '👋', '👌',
  '💼', '📋', '⚡', '🔔', '❤️', '🎉',
  '👏', '🤝', '⏳', '📌', '🔍', '📞',
  '💡', '✨', '⚠️', '❓', '🚀', '✔️',
];

function clampPosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 18, y: 120 };
  const maxX = Math.max(MARGIN, window.innerWidth - BTN_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - BTN_SIZE - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(MARGIN, y), maxY),
  };
}

function getDefaultPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 18, y: 200 };
  const bottomOffset = window.innerWidth < 1024 ? 162 : 94;
  return clampPosition(18, window.innerHeight - bottomOffset);
}

export const FloatingTeamChat: React.FC<FloatingTeamChatProps> = ({
  currentUser,
  allUsers = [],
  cases = [],
  onOpenCaseById,
}) => {
  // Never open automatically on entry or on incoming messages
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [toastDismissed, setToastDismissed] = useState(false);

  // Public channel (null) vs 1-on-1 DM with selected colleague
  const [activeDmUser, setActiveDmUser] = useState<User | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');

  // Composer state
  const [inputText, setInputText] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedAttachmentFile[]>([]);
  const [previewAttachmentTarget, setPreviewAttachmentTarget] = useState<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    inlineUrl: string;
    downloadUrl?: string;
    subtitle?: string;
  } | null>(null);

  // Reply, Directed Target, Mention, Emoji, Case # Picker, & Delete Confirmation
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    senderName: string;
    senderUsername: string;
    message: string;
  } | null>(null);
  const [directedToUser, setDirectedToUser] = useState<User | null>(null);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [caseFilter, setCaseFilter] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Admin moderation controls (clear / timed pause)
  const [chatControl, setChatControl] = useState<TeamChatControl | null>(null);
  const [showAdminControls, setShowAdminControls] = useState(false);
  const [pauseDurationMins, setPauseDurationMins] = useState<number>(30);
  const [pauseIndefinite, setPauseIndefinite] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [adminActionBusy, setAdminActionBusy] = useState(false);
  const [confirmClearScope, setConfirmClearScope] = useState<'public' | 'dm' | 'all' | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null);

  const selectedMentionsRef = useRef<Set<string>>(new Set());
  const markedReadIdsRef = useRef<Set<string>>(new Set());
  const prevTotalUnreadRef = useRef<number>(0);
  const initialLoadedRef = useRef(false);

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

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queuedAttachmentsRef = useRef<QueuedAttachmentFile[]>([]);
  const messageNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    queuedAttachmentsRef.current = queuedAttachments;
  }, [queuedAttachments]);

  useEffect(() => {
    return () => {
      queuedAttachmentsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  // Periodic tick to keep Online/Offline statuses & chat pause countdowns accurate
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };
    const onExternalOpen = () => {
      setIsOpen(true);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('eta:open-team-chat', onExternalOpen);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('eta:open-team-chat', onExternalOpen);
    };
  }, []);

  // Subscribe to ALL chat messages & chat control settings cleanly
  useEffect(() => {
    const unsubscribeMsgs = subscribeToTeamChatMessages((incoming) => {
      setMessages(incoming);
    });
    const unsubscribeCtrl = subscribeToTeamChatControl((ctrl) => {
      setChatControl(ctrl);
    });
    return () => {
      unsubscribeMsgs();
      unsubscribeCtrl();
    };
  }, []);

  // Unique active team colleagues excluding self
  const teamColleagues = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of allUsers) {
      if (u.status === 'disabled') continue;
      if (u.id === currentUser.id || u.username === currentUser.username) continue;
      if (!map.has(u.username)) {
        map.set(u.username, u);
      }
    }
    return Array.from(map.values());
  }, [allUsers, currentUser.id, currentUser.username]);

  const usersByUsername = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      if (u.username) map.set(u.username, u);
    });
    return map;
  }, [allUsers]);

  // All messages relevant to currentUser (Public channel OR DM involving currentUser)
  const accessibleMessages = useMemo(() => {
    return messages.filter((m) => {
      if (!m.recipientUsername) return true;
      return (
        m.senderUsername === currentUser.username ||
        m.recipientUsername === currentUser.username
      );
    });
  }, [messages, currentUser.username]);

  // Unread messages not yet read by currentUser
  const unreadMessages = useMemo(() => {
    return accessibleMessages.filter(
      (m) =>
        m.senderId !== currentUser.id &&
        m.senderUsername !== currentUser.username &&
        !(m.readByUsernames || []).includes(currentUser.username)
    );
  }, [accessibleMessages, currentUser.id, currentUser.username]);

  const totalUnread = unreadMessages.length;
  const publicUnreadCount = useMemo(
    () => unreadMessages.filter((m) => !m.recipientUsername).length,
    [unreadMessages]
  );

  const dmUnreadByUsername = useMemo(() => {
    const counts = new Map<string, number>();
    unreadMessages.forEach((m) => {
      if (m.recipientUsername === currentUser.username && m.senderUsername) {
        counts.set(m.senderUsername, (counts.get(m.senderUsername) || 0) + 1);
      }
    });
    return counts;
  }, [unreadMessages, currentUser.username]);

  const totalDmUnread = useMemo(
    () => unreadMessages.filter((m) => Boolean(m.recipientUsername)).length,
    [unreadMessages]
  );

  // Trigger audible notification sound & re-show toast when new unread arrives
  useEffect(() => {
    if (!initialLoadedRef.current) {
      if (messages.length > 0) {
        initialLoadedRef.current = true;
        prevTotalUnreadRef.current = totalUnread;
        if (totalUnread > 0 && !isOpen) {
          playAlertSound('chat');
        }
      }
      return;
    }

    if (totalUnread > prevTotalUnreadRef.current) {
      playAlertSound('chat');
      if (!isOpen) {
        setToastDismissed(false);
      }
    }
    prevTotalUnreadRef.current = totalUnread;
  }, [totalUnread, messages.length, isOpen]);

  // Messages visible in the currently selected conversation (Public OR 1-on-1 DM)
  const visibleMessages = useMemo(() => {
    if (!activeDmUser) {
      return accessibleMessages.filter((m) => !m.recipientUsername);
    }
    return accessibleMessages.filter(
      (m) =>
        m.recipientUsername &&
        ((m.senderUsername === currentUser.username &&
          m.recipientUsername === activeDmUser.username) ||
          (m.senderUsername === activeDmUser.username &&
            m.recipientUsername === currentUser.username))
    );
  }, [accessibleMessages, activeDmUser, currentUser.username]);

  // Mark visible messages as read ONLY when chat window is actually open
  useEffect(() => {
    if (!isOpen || visibleMessages.length === 0) return;

    const toMark = visibleMessages.filter(
      (m) =>
        m.senderId !== currentUser.id &&
        m.senderUsername !== currentUser.username &&
        !(m.readByUsernames || []).includes(currentUser.username) &&
        !markedReadIdsRef.current.has(m.id)
    );

    if (toMark.length > 0) {
      toMark.forEach((m) => markedReadIdsRef.current.add(m.id));
      markTeamChatMessagesAsRead(toMark, currentUser);
    }

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  }, [isOpen, visibleMessages, currentUser]);

  // Colleagues sorted: Unread DM first -> Online first -> Alphabetical
  const sortedFilteredColleagues = useMemo(() => {
    const q = userSearchTerm.trim().toLowerCase();
    return teamColleagues
      .filter((u) => {
        if (!q) return true;
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.crmUser.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const unreadA = dmUnreadByUsername.get(a.username) || 0;
        const unreadB = dmUnreadByUsername.get(b.username) || 0;
        if (unreadA !== unreadB) return unreadB - unreadA;
        const onA = isUserOnline(a, nowMs) ? 1 : 0;
        const onB = isUserOnline(b, nowMs) ? 1 : 0;
        if (onA !== onB) return onB - onA;
        return a.fullName.localeCompare(b.fullName, 'ar');
      });
  }, [teamColleagues, userSearchTerm, dmUnreadByUsername, nowMs]);

  const onlineColleaguesCount = useMemo(
    () => teamColleagues.filter((u) => isUserOnline(u, nowMs)).length,
    [teamColleagues, nowMs]
  );

  // @Mention autocomplete filtered users
  const mentionableUsers = useMemo(() => {
    const q = mentionFilter.trim().toLowerCase();
    const list = q
      ? teamColleagues.filter(
          (u) =>
            u.fullName.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q) ||
            u.crmUser.toLowerCase().includes(q)
        )
      : teamColleagues;
    return list.slice(0, 8);
  }, [teamColleagues, mentionFilter]);

  // #Case autocomplete filtered cases
  const matchingCases = useMemo(() => {
    const q = caseFilter.trim().toLowerCase();
    const activeCases = cases.filter((c) => !c.isDeleted);
    if (!q) return activeCases.slice(0, 8);
    return activeCases
      .filter(
        (c) =>
          c.caseId.toLowerCase().includes(q) ||
          (c.title && c.title.toLowerCase().includes(q)) ||
          (c.taxpayerName && c.taxpayerName.toLowerCase().includes(q)) ||
          (c.taxRegistrationNumber && c.taxRegistrationNumber.includes(q))
      )
      .slice(0, 8);
  }, [cases, caseFilter]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);

    // Detect "@" mention query
    const mentionMatch = textBeforeCursor.match(/(?:^|\s)@([^\s@#]{0,25})$/);
    if (mentionMatch) {
      setMentionFilter(mentionMatch[1] || '');
      setShowMentionPicker(true);
      setShowCasePicker(false);
      return;
    } else {
      setShowMentionPicker(false);
    }

    // Detect "#" case reference query
    const caseMatch = textBeforeCursor.match(/(?:^|\s)#([^\s@#]{0,25})$/);
    if (caseMatch) {
      setCaseFilter(caseMatch[1] || '');
      setShowCasePicker(true);
      setShowEmojiPicker(false);
    } else {
      setShowCasePicker(false);
    }
  };

  const insertMention = (user: User) => {
    const tag = `@${user.fullName} `;
    selectedMentionsRef.current.add(user.username);

    setInputText((prev) => {
      const match = prev.match(/(?:^|\s)@([^\s@#]{0,25})$/);
      if (match && match.index !== undefined) {
        const leadingSpace = match[0].startsWith(' ') ? ' ' : '';
        return prev.slice(0, match.index) + leadingSpace + tag;
      }
      return prev ? `${prev.trimEnd()} ${tag}` : tag;
    });
    setShowMentionPicker(false);
    setMentionFilter('');
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const insertCaseLink = (c: Case) => {
    const tag = `#${c.caseId} `;
    setInputText((prev) => {
      const match = prev.match(/(?:^|\s)#([^\s@#]{0,25})$/);
      if (match && match.index !== undefined) {
        const leadingSpace = match[0].startsWith(' ') ? ' ' : '';
        return prev.slice(0, match.index) + leadingSpace + tag;
      }
      return prev ? `${prev.trimEnd()} ${tag}` : tag;
    });
    setShowCasePicker(false);
    setCaseFilter('');
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const insertEmoji = (emoji: string) => {
    setInputText((prev) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const handleFilesSelected = (selectedList: FileList | File[] | null) => {
    if (!selectedList) return;
    const incoming = Array.from(selectedList);
    if (incoming.length === 0) return;

    setErrorMsg(null);
    const accepted: QueuedAttachmentFile[] = [];

    for (const file of incoming) {
      if (queuedAttachments.length + accepted.length >= MAX_CHAT_ATTACHMENTS_PER_MESSAGE) {
        setErrorMsg(`الحد الأقصى للمرفقات في الرسالة الواحدة هو ${MAX_CHAT_ATTACHMENTS_PER_MESSAGE} ملفات.`);
        break;
      }
      const err = validateAttachmentFile(file);
      if (err) {
        setErrorMsg(err);
        continue;
      }
      const alreadyAdded = queuedAttachments.some(
        (f) => f.file.name === file.name && f.file.size === file.size && f.file.lastModified === file.lastModified
      );
      if (alreadyAdded) continue;

      const canPreview = isPreviewableImage(file.type, file.name) || isPreviewablePdf(file.type, file.name);
      accepted.push({
        localId: `chat_q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: canPreview ? URL.createObjectURL(file) : undefined,
      });
    }

    if (accepted.length > 0) {
      setQueuedAttachments((prev) => [...prev, ...accepted]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeQueuedAttachment = (localId: string) => {
    setQueuedAttachments((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  };

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleFilesSelected(files);
    }
  };

  const startReplyToMessage = (msg: TeamChatMessage) => {
    setReplyingTo({
      id: msg.id,
      senderName: msg.senderName,
      senderUsername: msg.senderUsername,
      message:
        msg.message ||
        (msg.attachments && msg.attachments.length > 0
          ? `📎 مرفق: ${msg.attachments[0].fileName}`
          : ''),
    });
    selectedMentionsRef.current.add(msg.senderUsername);
    const senderUser = usersByUsername.get(msg.senderUsername) || null;
    if (senderUser && senderUser.username !== currentUser.username) {
      setDirectedToUser(senderUser);
    }
    setShowMentionPicker(false);
    setShowCasePicker(false);
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const openDirectChatWithUsername = (username: string) => {
    const target = usersByUsername.get(username);
    if (target && target.username !== currentUser.username) {
      setActiveDmUser(target);
      setShowUserPicker(false);
      setDirectedToUser(null);
      setReplyingTo(null);
    }
  };

  const scrollToMessage = (msgId?: string) => {
    if (!msgId) return;
    const node = messageNodeRefs.current[msgId];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === msgId ? null : prev));
      }, 1800);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteTeamChatMessage(messageId);
      setConfirmDeleteId(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر حذف الرسالة.');
    }
  };

  const isAdmin = currentUser.role === 'super_admin';
  const isChatPaused = isTeamChatPaused(chatControl, nowMs);
  const pauseRemainingLabel = formatChatPauseRemaining(chatControl, nowMs);

  const handleAdminPauseChat = async () => {
    if (!isAdmin || adminActionBusy) return;
    setAdminActionBusy(true);
    setAdminFeedback(null);
    setErrorMsg(null);
    try {
      const mins = pauseIndefinite ? null : Math.max(1, pauseDurationMins);
      await pauseTeamChat({
        durationMinutes: mins,
        reason: pauseReason,
        actingUser: currentUser,
      });
      setAdminFeedback(
        mins
          ? `تم إيقاف الشات مؤقتاً لمدة ${mins} دقيقة بنجاح.`
          : 'تم إيقاف الشات مؤقتاً حتى إعادة تفعيله يدوياً.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إيقاف الشات.');
    } finally {
      setAdminActionBusy(false);
    }
  };

  const handleAdminResumeChat = async () => {
    if (!isAdmin || adminActionBusy) return;
    setAdminActionBusy(true);
    setAdminFeedback(null);
    setErrorMsg(null);
    try {
      await resumeTeamChat(currentUser);
      setAdminFeedback('تم إعادة تشغيل الشات للجميع بنجاح.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إعادة تشغيل الشات.');
    } finally {
      setAdminActionBusy(false);
    }
  };

  const handleAdminClearMessages = async (scope: 'public' | 'dm' | 'all') => {
    if (!isAdmin || adminActionBusy) return;
    setAdminActionBusy(true);
    setAdminFeedback(null);
    setErrorMsg(null);
    try {
      let deletedCount = 0;
      if (scope === 'public') {
        deletedCount = await clearPublicTeamChatMessages(currentUser);
        setAdminFeedback(`تم تفريغ القناة العامة (${deletedCount} رسالة).`);
      } else if (scope === 'dm' && activeDmUser) {
        deletedCount = await clearDmTeamChatMessages(
          currentUser.username,
          activeDmUser.username,
          currentUser
        );
        setAdminFeedback(`تم تفريغ المحادثة مع ${activeDmUser.fullName} (${deletedCount} رسالة).`);
      } else {
        deletedCount = await clearAllTeamChatMessages(currentUser);
        setAdminFeedback(`تم تفريغ جميع رسائل الشات بالمنظومة (${deletedCount} رسالة).`);
      }
      setConfirmClearScope(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تفريغ رسائل الشات.');
    } finally {
      setAdminActionBusy(false);
    }
  };

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

  const handleSend = useCallback(
    async (presetText?: string) => {
      const text = (presetText ?? inputText).trim();
      const filesToUpload = presetText ? [] : queuedAttachments;
      if ((!text && filesToUpload.length === 0) || isSending) return;

      const mentionsList = Array.from(selectedMentionsRef.current);
      for (const u of allUsers) {
        if (text.includes(`@${u.fullName}`)) {
          mentionsList.push(u.username);
        }
      }
      if (directedToUser) {
        mentionsList.push(directedToUser.username);
      }

      // Detect first #CRM-XXXXXX token for optional caseId field
      const caseTagMatch = text.match(/#?(CRM-\d{3,8})/i);
      const detectedCaseId = caseTagMatch ? caseTagMatch[1].toUpperCase() : undefined;

      setIsSending(true);
      setErrorMsg(null);
      try {
        const uploadedAttachments: ChatAttachment[] = [];
        for (const q of filesToUpload) {
          const uploaded = await uploadChatAttachment(q.file);
          uploadedAttachments.push(uploaded);
        }

        await sendTeamChatMessage({
          sender: currentUser,
          message: text,
          urgency: isUrgent ? 'urgent' : 'normal',
          caseId: detectedCaseId,
          recipient: activeDmUser,
          targetUser: directedToUser,
          replyTo: replyingTo || undefined,
          mentions: mentionsList,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        });
        if (!presetText) {
          setInputText('');
          filesToUpload.forEach((item) => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          });
          setQueuedAttachments([]);
        }
        setIsUrgent(false);
        setReplyingTo(null);
        setDirectedToUser(null);
        setShowMentionPicker(false);
        setShowCasePicker(false);
        setShowEmojiPicker(false);
        selectedMentionsRef.current.clear();
      } catch (err: any) {
        setErrorMsg(err?.message || 'تعذر إرسال الرسالة.');
      } finally {
        setIsSending(false);
      }
    },
    [
      inputText,
      queuedAttachments,
      isSending,
      currentUser,
      isUrgent,
      activeDmUser,
      directedToUser,
      replyingTo,
      allUsers,
    ]
  );

  const getPanelStyle = (): React.CSSProperties => {
    if (typeof window === 'undefined') return { left: 16, bottom: 20 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelWidth = Math.min(430, vw - 24);
    const panelHeight = Math.min(560, vh - 96);

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

  // Parse @Mentions and #CRM-XXXXXX Case Hyperlinks inside message text
  const renderMessageContent = (text: string, isMine: boolean, isUrgentMsg: boolean) => {
    const knownNames = allUsers
      .map((u) => u.fullName.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const escapedNames = knownNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const mentionGroup =
      escapedNames.length > 0
        ? `@(?:${escapedNames.join('|')}|[^\\s@#]+)`
        : `@[^\\s@#]+`;
    const combinedRegex = new RegExp(`(#?CRM-\\d{3,8}|${mentionGroup})`, 'gi');
    const parts = text.split(combinedRegex);

    return parts.map((part, i) => {
      if (!part) return null;
      if (/^#?CRM-\d{3,8}$/i.test(part)) {
        const cleanCode = part.replace(/^#/, '').toUpperCase();
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenCaseById?.(cleanCode)}
            title={`فتح تفاصيل الحالة ${cleanCode}`}
            className={`inline-flex items-center gap-0.5 font-mono font-black underline decoration-2 underline-offset-2 px-1 py-0.2 rounded cursor-pointer transition-colors ${
              isMine && !isUrgentMsg
                ? 'bg-white/20 text-[#00E676] hover:bg-white/30'
                : 'bg-[#004B87]/15 text-[#004B87] dark:bg-[#00386B] dark:text-[#00E676] hover:bg-[#004B87]/25'
            }`}
          >
            <span>#{cleanCode}</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        );
      }
      if (part.startsWith('@') && part.length > 1) {
        return (
          <span
            key={i}
            className={`font-black px-1 rounded ${
              isMine && !isUrgentMsg
                ? 'bg-white/20 text-[#00E676]'
                : 'bg-[#00A651]/15 text-[#008742] dark:text-[#00E676]'
            }`}
          >
            {part}
          </span>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const isAgent = normalizeUserRole(currentUser.role) === 'agent';
  const quickMessages = isAgent
    ? [
        'أحتاج مساعدة سريعة من الإدارة والدعم التقني بخصوص مكالمة حالية',
        'هل يوجد تحديث على الحالة المحولة للإدارة؟',
        'استفسار فني عاجل عن منظومة الفاتورة الإلكترونية',
      ]
    : [
        'فريق الإدارة والدعم التقني متاح الآن للمساعدة الفورية',
        'تمت مراجعة الطلب والرد على الحالة في المنظومة',
        'يرجى إرسال #رقم الحالة للمتابعة الفورية',
      ];

  const latestUnread = unreadMessages[unreadMessages.length - 1];
  const toastLeft =
    typeof window !== 'undefined' && position.x < window.innerWidth / 2
      ? Math.min(position.x + BTN_SIZE + 10, window.innerWidth - 260)
      : Math.max(12, position.x - 255);

  return createPortal(
    <>
      {/* New-Message Toast Alert beside closed floating button */}
      {!isOpen && totalUnread > 0 && !toastDismissed && latestUnread && (
        <div
          style={{
            left: `${toastLeft}px`,
            top: `${Math.max(12, position.y - 6)}px`,
          }}
          dir="rtl"
          className="fixed z-45 w-60 bg-[#00264D] text-white rounded-2xl shadow-2xl border-2 border-[#00E676] p-2.5 animate-scale-in print:hidden"
        >
          <div className="flex items-start justify-between gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (latestUnread.recipientUsername) {
                  openDirectChatWithUsername(latestUnread.senderUsername);
                } else {
                  setActiveDmUser(null);
                }
                setIsOpen(true);
              }}
              className="flex-1 text-right min-w-0 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-black text-[#00E676]">
                <BellDot className="w-3.5 h-3.5 animate-bounce shrink-0" />
                <span className="truncate">
                  {totalUnread === 1
                    ? 'رسالة جديدة في الشات'
                    : `${totalUnread} رسائل غير مقروءة`}
                </span>
              </div>
              <div className="text-[11px] font-bold text-white truncate mt-0.5">
                {latestUnread.senderName}
                {latestUnread.recipientUsername ? ' (رسالة خاصة)' : ''}
              </div>
              <div className="text-[10px] text-sky-200 truncate">
                {latestUnread.message ||
                  (latestUnread.attachments && latestUnread.attachments.length > 0
                    ? `📎 مرفق (${latestUnread.attachments.length})`
                    : '')}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setToastDismissed(true)}
              className="p-1 text-sky-300 hover:text-white rounded-lg cursor-pointer shrink-0"
              title="إخفاء التنبيه"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Draggable Pulsing Team Chat Floating Button */}
      <div
        style={{ left: `${position.x}px`, top: `${position.y}px`, width: BTN_SIZE, height: BTN_SIZE }}
        className="fixed z-45 select-none print:hidden"
        dir="rtl"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full opacity-50 animate-ping pointer-events-none ${
            totalUnread > 0 ? 'bg-amber-400' : 'bg-[#004B87]'
          }`}
        />
        <span
          aria-hidden="true"
          className={`absolute -inset-1 rounded-full border-2 animate-pulse pointer-events-none ${
            totalUnread > 0 ? 'border-amber-400' : 'border-[#00A651]/70'
          }`}
        />

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="شات التواصل السريع (اسحب للتحريك في أي مكان)"
          aria-label="شات التواصل السريع"
          className={`relative w-full h-full rounded-full bg-[#00A651] hover:bg-[#008742] text-white border-2 border-white dark:border-[#0B1D35] shadow-xl flex flex-col items-center justify-center touch-none transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004B87] ${
            isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab hover:scale-105'
          }`}
        >
          <MessageSquare className="w-5 h-5 text-white" />
          <span className="text-[10px] font-extrabold leading-none mt-0.5 text-white">
            {isChatPaused ? 'متوقف' : 'شات'}
          </span>
          {isChatPaused && (
            <span
              title="الشات متوقف مؤقتاً من مدير النظام"
              className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center border-2 border-white shadow-sm"
            >
              <Lock className="w-2.5 h-2.5" />
            </span>
          )}
          {totalUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm tabular-nums animate-bounce">
              {totalUnread > 99 ? '+99' : totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* Team Quick Chat Window (Always user-toggled; never auto-opened) */}
      {isOpen && (
        <div
          style={getPanelStyle()}
          dir="rtl"
          className="fixed z-[75] bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#004B87] flex flex-col overflow-hidden animate-scale-in text-right print:hidden"
        >
          {/* Header */}
          <div className="bg-[#004B87] text-white px-3.5 py-2.5 flex items-center justify-between border-b border-[#00264D] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#00A651] text-white flex items-center justify-center shadow-xs shrink-0">
                {activeDmUser ? <UserCheck className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5 truncate">
                  <span className="truncate">
                    {activeDmUser ? `محادثة: ${activeDmUser.fullName}` : 'شات التواصل الفوري'}
                  </span>
                  {activeDmUser ? (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 ${
                        isUserOnline(activeDmUser, nowMs)
                          ? 'bg-[#00A651] text-white'
                          : 'bg-slate-600 text-slate-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isUserOnline(activeDmUser, nowMs) ? 'bg-white' : 'bg-slate-300'
                        }`}
                      />
                      {isUserOnline(activeDmUser, nowMs) ? 'أون لاين' : 'أوف لاين'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-[#00264D] text-[#00E676] px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                      {onlineColleaguesCount} متصل
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-sky-100 flex items-center gap-1 truncate">
                  <GripHorizontal className="w-3 h-3 opacity-75 shrink-0" />
                  <span>
                    {isChatPaused
                      ? 'الشات متوقف مؤقتاً بقرار مدير النظام'
                      : activeDmUser
                      ? getRoleDefaultJobTitle(activeDmUser.role)
                      : 'القناة العامة · كل الرسائل محفوظة'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminControls((prev) => !prev);
                    setConfirmClearScope(null);
                  }}
                  title="أدوات تحكم الأدمن (حذف وتفريغ / إيقاف مؤقت)"
                  className={`px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition-colors cursor-pointer ${
                    showAdminControls || isChatPaused
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#00264D] text-amber-300 hover:bg-[#003366]'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>تحكم الأدمن</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="إغلاق الشات"
                aria-label="إغلاق الشات"
                className="p-1.5 text-sky-100 hover:text-white hover:bg-white/15 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Admin Moderation Drawer (Clear / Pause / Resume) */}
          {isAdmin && showAdminControls && (
            <div className="bg-amber-50 dark:bg-[#071A30] border-b border-amber-300 dark:border-amber-700/60 p-3 space-y-2.5 text-[11px] shrink-0 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>إدارة الشات والتحكم الزمني (مدير النظام)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdminControls(false)}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {adminFeedback && (
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold">
                  {adminFeedback}
                </div>
              )}

              {/* Timed Pause / Resume Section */}
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0B1D35] border border-amber-200 dark:border-[#00386B] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#004B87] dark:text-sky-300" />
                    <span>إيقاف الشات لوقت محدد:</span>
                  </span>
                  {isChatPaused && (
                    <button
                      type="button"
                      disabled={adminActionBusy}
                      onClick={handleAdminResumeChat}
                      className="px-2.5 py-1 rounded-lg bg-[#00A651] hover:bg-[#008742] text-white font-black flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>إعادة تشغيل الآن</span>
                    </button>
                  )}
                </div>

                {isChatPaused && (
                  <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800">
                    الحالة: متوقف حالياً ({pauseRemainingLabel})
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1">
                  {[15, 30, 60, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        setPauseIndefinite(false);
                        setPauseDurationMins(mins);
                      }}
                      className={`px-2 py-1 rounded-lg font-bold border text-[10px] cursor-pointer ${
                        !pauseIndefinite && pauseDurationMins === mins
                          ? 'bg-[#004B87] text-white border-[#004B87]'
                          : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                      }`}
                    >
                      {mins >= 60 ? `${mins / 60} ساعة` : `${mins} دقيقة`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPauseIndefinite(true)}
                    className={`px-2 py-1 rounded-lg font-bold border text-[10px] cursor-pointer ${
                      pauseIndefinite
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 dark:bg-[#071629] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#00386B]'
                    }`}
                  >
                    مفتوح
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {!pauseIndefinite && (
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={pauseDurationMins}
                      onChange={(e) => setPauseDurationMins(Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 p-1.5 rounded-lg bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-center font-mono font-bold text-slate-900 dark:text-white"
                      title="المدة بالدقائق"
                    />
                  )}
                  <input
                    type="text"
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="سبب الإيقاف (اختياري)..."
                    className="flex-1 p-1.5 rounded-lg bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={adminActionBusy}
                    onClick={handleAdminPauseChat}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>إيقاف</span>
                  </button>
                </div>
              </div>

              {/* Clear / Empty Chat Messages Section */}
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0B1D35] border border-rose-200 dark:border-rose-900/60 space-y-2">
                <div className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                  <Eraser className="w-3.5 h-3.5" />
                  <span>تفريغ وحذف رسائل الشات (كما يمكنك حذف أي رسالة فردية من القائمة):</span>
                </div>

                {confirmClearScope ? (
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 flex items-center justify-between gap-2">
                    <span className="font-bold text-rose-900 dark:text-rose-200 text-[10px]">
                      {confirmClearScope === 'all'
                        ? 'تأكيد حذف كافة رسائل الشات نهائياً؟'
                        : confirmClearScope === 'dm' && activeDmUser
                        ? `تأكيد تفريغ المحادثة مع ${activeDmUser.fullName}؟`
                        : 'تأكيد تفريغ جميع رسائل القناة العامة؟'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={adminActionBusy}
                        onClick={() => handleAdminClearMessages(confirmClearScope)}
                        className="px-2 py-1 rounded bg-rose-600 text-white font-black text-[10px] cursor-pointer disabled:opacity-50"
                      >
                        نعم، تفريغ
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearScope(null)}
                        className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-[10px] cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmClearScope('public')}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>تفريغ القناة العامة</span>
                    </button>
                    {activeDmUser && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearScope('dm')}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>تفريغ هذه المحادثة</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmClearScope('all')}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Eraser className="w-3 h-3" />
                      <span>تفريغ الشات بالكامل</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Chat Pause Notice Banner for All Users */}
          {isChatPaused && (
            <div className="px-3 py-2 bg-amber-100 dark:bg-amber-950/70 border-b border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 text-[11px] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Lock className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                <div className="min-w-0">
                  <div className="font-black truncate">
                    تم إيقاف الشات مؤقتاً من قِبل مدير النظام
                  </div>
                  <div className="text-[10px] font-semibold opacity-90 truncate">
                    {chatControl?.pauseReason ? `${chatControl.pauseReason} · ` : ''}
                    {pauseRemainingLabel}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleAdminResumeChat}
                  className="px-2 py-1 rounded-lg bg-[#00A651] text-white font-black text-[10px] shrink-0 cursor-pointer"
                >
                  تفعيل
                </button>
              )}
            </div>
          )}

          {/* Channel / Direct Message Switcher */}
          <div className="px-2.5 py-1.5 bg-[#00264D] text-white flex items-center gap-1.5 border-b border-[#00386B] shrink-0 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setActiveDmUser(null);
                setShowUserPicker(false);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                !activeDmUser && !showUserPicker
                  ? 'bg-[#00A651] text-white'
                  : 'bg-[#003366] text-sky-200 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>القناة العامة</span>
              {publicUnreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black tabular-nums">
                  {publicUnreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowUserPicker((prev) => !prev)}
              className={`flex-1 px-2.5 py-1 rounded-lg font-bold flex items-center justify-between gap-1.5 transition-colors cursor-pointer truncate ${
                activeDmUser || showUserPicker
                  ? 'bg-[#004B87] text-white border border-[#00E676]/50'
                  : 'bg-[#003366] text-sky-200 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <UserCheck className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
                <span className="truncate">
                  {activeDmUser ? activeDmUser.fullName : 'محادثة مستخدم محدد'}
                </span>
              </span>
              {totalDmUnread > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black tabular-nums shrink-0">
                  {totalDmUnread}
                </span>
              )}
            </button>
          </div>

          {/* Direct Message Colleague Picker Drawer */}
          {showUserPicker ? (
            <div className="flex-1 overflow-y-auto p-3 bg-slate-50 dark:bg-[#071629] space-y-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  placeholder="ابحث بالاسم أو الكود لبدء محادثة خاصة..."
                  className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#00A651]"
                />
              </div>

              <div className="space-y-1">
                {sortedFilteredColleagues.map((u) => {
                  const online = isUserOnline(u, nowMs);
                  const unreadForUser = dmUnreadByUsername.get(u.username) || 0;
                  const isSelected = activeDmUser?.username === u.username;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setActiveDmUser(u);
                        setShowUserPicker(false);
                        setDirectedToUser(null);
                      }}
                      className={`w-full text-right p-2 rounded-xl border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#004B87] text-white border-[#00A651]'
                          : 'bg-white dark:bg-[#0B1D35] text-slate-800 dark:text-slate-100 border-slate-200 dark:border-[#00386B] hover:border-[#00A651]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            online ? 'bg-[#00E676] animate-pulse' : 'bg-slate-400'
                          }`}
                          title={online ? 'أون لاين' : 'أوف لاين'}
                        />
                        <div className="min-w-0">
                          <div className="font-bold truncate">{u.fullName}</div>
                          <div
                            className={`text-[10px] truncate ${
                              isSelected ? 'text-sky-200' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {getRoleDefaultJobTitle(u.role)} ·{' '}
                            <span
                              className={
                                online
                                  ? isSelected
                                    ? 'text-[#00E676] font-bold'
                                    : 'text-[#00A651] dark:text-[#00E676] font-bold'
                                  : ''
                              }
                            >
                              {online ? 'أون لاين' : 'أوف لاين'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {unreadForUser > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black tabular-nums shrink-0">
                          {unreadForUser}
                        </span>
                      )}
                    </button>
                  );
                })}
                {sortedFilteredColleagues.length === 0 && (
                  <div className="py-8 text-center text-slate-400">لا يوجد مستخدمون مطابقون</div>
                )}
              </div>
            </div>
          ) : (
            /* Live Messages Feed */
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/80 dark:bg-[#071629]">
              {visibleMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 dark:text-slate-400 space-y-2">
                  <MessageSquare className="w-9 h-9 text-[#004B87]/40 dark:text-sky-400/40" />
                  <div className="font-bold text-xs text-slate-700 dark:text-slate-200">
                    {activeDmUser
                      ? `ابدأ محادثة خاصة مباشرة مع ${activeDmUser.fullName}`
                      : 'قناة التواصل الفوري بين وكلاء الاتصال والإدارة والدعم التقني'}
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    استخدم @ للإشارة لزميل أو # لإدراج رقم حالة كرابط سريع، ويمكنك حذف رسائلك أو إرسال الإيموشن.
                  </p>
                </div>
              ) : (
                visibleMessages.map((msg) => {
                  const isMine =
                    msg.senderId === currentUser.id || msg.senderUsername === currentUser.username;
                  const roleLabel = getRoleDefaultJobTitle(msg.senderRole);
                  const senderProfile = usersByUsername.get(msg.senderUsername);
                  const senderOnline = isUserOnline(senderProfile, nowMs);
                  const timeStr = new Date(msg.createdAt).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const isDirectedToMe =
                    !isMine &&
                    (msg.targetUsername === currentUser.username ||
                      msg.replyToSenderUsername === currentUser.username ||
                      msg.mentions?.includes(currentUser.username) ||
                      (msg.message || '').includes(`@${currentUser.fullName}`));

                  const readers = (msg.readByDetails || []).filter(
                    (r) => r.username !== msg.senderUsername
                  );
                  const fallbackReaderCount = (msg.readByUsernames || []).filter(
                    (uname) => uname !== msg.senderUsername
                  ).length;
                  const readCount = Math.max(readers.length, fallbackReaderCount);
                  const readerNamesTitle =
                    readers.length > 0
                      ? `تمت القراءة بواسطة: ${readers.map((r) => r.fullName).join('، ')}`
                      : readCount > 0
                      ? `تمت القراءة بواسطة ${readCount} مستخدم`
                      : 'تم الإرسال وبانتظار القراءة';

                  const canDelete = isMine || currentUser.role === 'super_admin';

                  return (
                    <div
                      key={msg.id}
                      ref={(el) => {
                        messageNodeRefs.current[msg.id] = el;
                      }}
                      className={`flex flex-col ${isMine ? 'items-start' : 'items-end'} transition-colors ${
                        highlightedMsgId === msg.id
                          ? 'bg-amber-100/70 dark:bg-amber-900/30 rounded-xl p-1'
                          : ''
                      }`}
                    >
                      <div
                        className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs shadow-2xs border ${
                          msg.urgency === 'urgent'
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-slate-900 dark:text-white'
                            : isDirectedToMe
                            ? 'bg-emerald-50 dark:bg-[#0E2B4B] border-[#00A651] text-slate-900 dark:text-white'
                            : isMine
                            ? 'bg-[#004B87] text-white border-[#00386B] rounded-tr-sm'
                            : 'bg-white dark:bg-[#0B1D35] text-slate-800 dark:text-slate-100 border-slate-200 dark:border-[#00386B] rounded-tl-sm'
                        }`}
                      >
                        <div
                          className={`flex items-center justify-between gap-2 text-[10px] mb-1 font-bold ${
                            msg.urgency === 'urgent'
                              ? 'text-rose-700 dark:text-rose-300'
                              : isMine
                              ? 'text-sky-200'
                              : 'text-[#004B87] dark:text-sky-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (!isMine) openDirectChatWithUsername(msg.senderUsername);
                            }}
                            title={isMine ? undefined : 'فتح محادثة خاصة مع هذا المستخدم'}
                            className={`flex items-center gap-1.5 truncate ${
                              !isMine ? 'hover:underline cursor-pointer' : ''
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                senderOnline ? 'bg-[#00E676]' : 'bg-slate-400'
                              }`}
                              title={senderOnline ? 'أون لاين' : 'أوف لاين'}
                            />
                            <span className="truncate">
                              {msg.senderName} · {roleLabel}
                            </span>
                            {!isMine && (
                              <span
                                className={`text-[9px] font-semibold ${
                                  senderOnline ? 'text-[#00E676]' : 'opacity-70'
                                }`}
                              >
                                ({senderOnline ? 'أون لاين' : 'أوف لاين'})
                              </span>
                            )}
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isDirectedToMe && (
                              <span className="text-[9px] font-black text-[#008742] dark:text-[#00E676]">
                                موجه لك
                              </span>
                            )}
                            {msg.urgency === 'urgent' && (
                              <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-300 font-black">
                                <AlertTriangle className="w-3 h-3" />
                                عاجل
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Directed target badge if set */}
                        {msg.targetName && (
                          <div
                            className={`mb-1 text-[10px] font-bold flex items-center gap-1 ${
                              isMine && msg.urgency !== 'urgent'
                                ? 'text-[#00E676]'
                                : 'text-[#00A651] dark:text-[#00E676]'
                            }`}
                          >
                            <Target className="w-3 h-3 shrink-0" />
                            <span>رد موجه إلى: {msg.targetName}</span>
                          </div>
                        )}

                        {/* Quoted Replied-To Message */}
                        {msg.replyToId && msg.replyToMessage && (
                          <button
                            type="button"
                            onClick={() => scrollToMessage(msg.replyToId)}
                            className={`w-full text-right mb-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] transition-colors cursor-pointer ${
                              isMine && msg.urgency !== 'urgent'
                                ? 'bg-white/10 border-white/20 text-sky-100 hover:bg-white/15'
                                : 'bg-slate-100 dark:bg-[#071629] border-slate-200 dark:border-[#00386B] text-slate-600 dark:text-slate-300 hover:border-[#00A651]'
                            }`}
                          >
                            <div className="font-extrabold text-[10px] text-[#00A651] dark:text-[#00E676] flex items-center gap-1">
                              <Reply className="w-3 h-3" />
                              <span>رد على {msg.replyToSenderName}</span>
                            </div>
                            <div className="truncate opacity-90">{msg.replyToMessage}</div>
                          </button>
                        )}

                        {msg.message && (
                          <div className="leading-relaxed whitespace-pre-wrap break-words">
                            {renderMessageContent(msg.message, isMine, msg.urgency === 'urgent')}
                          </div>
                        )}

                        {/* Chat Message Document & Image Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className={`${msg.message ? 'mt-2' : 'mt-0.5'} space-y-1.5`}>
                            {msg.attachments.map((att) => {
                              const isImg = isPreviewableImage(att.mimeType, att.fileName);
                              const inlineUrl = getAttachmentInlineUrl(att);
                              const downloadUrl = getAttachmentDownloadUrl(att);
                              const openPreview = () =>
                                setPreviewAttachmentTarget({
                                  fileName: att.fileName,
                                  mimeType: att.mimeType,
                                  sizeBytes: att.sizeBytes,
                                  inlineUrl,
                                  downloadUrl,
                                  subtitle: `مرفق من ${msg.senderName}`,
                                });

                              if (isImg) {
                                return (
                                  <div
                                    key={att.id}
                                    className={`rounded-xl overflow-hidden border ${
                                      isMine && msg.urgency !== 'urgent'
                                        ? 'border-white/25 bg-[#003366]'
                                        : 'border-slate-200 dark:border-[#00386B] bg-slate-100 dark:bg-[#071629]'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={openPreview}
                                      className="block w-full text-right cursor-pointer group relative"
                                      title="معاينة الصورة بالحجم الكامل"
                                    >
                                      <img
                                        src={inlineUrl}
                                        alt={att.fileName}
                                        loading="lazy"
                                        className="w-full max-h-44 object-cover bg-white/90 group-hover:opacity-95 transition-opacity"
                                      />
                                      <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-lg bg-[#001F3F]/80 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                                        <Eye className="w-3 h-3 text-[#00E676]" />
                                        <span>معاينة</span>
                                      </span>
                                    </button>
                                    <div className="px-2 py-1 flex items-center justify-between gap-2 text-[10px]">
                                      <span className="truncate font-semibold opacity-90">{att.fileName}</span>
                                      <a
                                        href={downloadUrl}
                                        download={att.fileName}
                                        className={`inline-flex items-center gap-1 font-bold shrink-0 hover:underline ${
                                          isMine && msg.urgency !== 'urgent'
                                            ? 'text-[#00E676]'
                                            : 'text-[#004B87] dark:text-[#00E676]'
                                        }`}
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>تحميل</span>
                                      </a>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={att.id}
                                  className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                                    isMine && msg.urgency !== 'urgent'
                                      ? 'bg-white/10 border-white/20 text-white'
                                      : 'bg-slate-50 dark:bg-[#071629] border-slate-200 dark:border-[#00386B] text-slate-800 dark:text-slate-100'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {renderChatFileIcon(att.mimeType, att.fileName)}
                                    <div className="min-w-0">
                                      <div className="font-bold text-[11px] truncate">{att.fileName}</div>
                                      <div className="text-[9px] opacity-75">
                                        {formatFileSizeArabic(att.sizeBytes)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={openPreview}
                                      title="معاينة المستند"
                                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                        isMine && msg.urgency !== 'urgent'
                                          ? 'bg-white/15 hover:bg-white/25 text-white'
                                          : 'bg-white dark:bg-[#0B1D35] hover:bg-[#004B87] hover:text-white text-[#004B87] dark:text-sky-200 border border-slate-200 dark:border-[#00386B]'
                                      }`}
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>معاينة</span>
                                    </button>
                                    <a
                                      href={downloadUrl}
                                      download={att.fileName}
                                      title="تحميل المستند"
                                      className="px-2 py-1 rounded-lg bg-[#00A651] hover:bg-[#008742] text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>تحميل</span>
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {msg.caseId && !(msg.message || '').toUpperCase().includes(msg.caseId.toUpperCase()) && (
                          <div className="mt-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenCaseById?.(msg.caseId!)}
                              className={`text-[10px] font-mono font-bold underline px-2 py-0.5 rounded-lg inline-flex items-center gap-1 cursor-pointer ${
                                isMine && msg.urgency !== 'urgent'
                                  ? 'bg-white/15 text-[#00E676] hover:bg-white/25'
                                  : 'bg-[#004B87]/10 text-[#004B87] dark:bg-[#00386B] dark:text-[#00E676] hover:bg-[#004B87]/20'
                              }`}
                            >
                              <Hash className="w-3 h-3" />
                              {msg.caseId}
                            </button>
                          </div>
                        )}

                        <div
                          className={`mt-1.5 pt-1 border-t flex items-center justify-between gap-2 text-[10px] ${
                            isMine && msg.urgency !== 'urgent'
                              ? 'border-white/10 text-sky-200/85'
                              : 'border-slate-100 dark:border-[#00386B]/60 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startReplyToMessage(msg)}
                              className={`inline-flex items-center gap-1 font-bold transition-colors cursor-pointer ${
                                isMine && msg.urgency !== 'urgent'
                                  ? 'text-sky-200 hover:text-white'
                                  : 'text-[#004B87] dark:text-sky-300 hover:text-[#00A651]'
                              }`}
                            >
                              <Reply className="w-3 h-3" />
                              <span>رد وتوجيه</span>
                            </button>

                            {canDelete && (
                              confirmDeleteId === msg.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-black text-[9px] cursor-pointer"
                                  >
                                    تأكيد الحذف
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-1 text-[9px] underline cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(msg.id)}
                                  title="حذف الرسالة"
                                  className={`inline-flex items-center gap-0.5 transition-colors cursor-pointer ${
                                    isMine && msg.urgency !== 'urgent'
                                      ? 'text-rose-300 hover:text-rose-200'
                                      : 'text-rose-500 hover:text-rose-700'
                                  }`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>حذف</span>
                                </button>
                              )
                            )}
                          </div>

                          <div className="flex items-center gap-1.5" title={isMine ? readerNamesTitle : undefined}>
                            <span className="tabular-nums">{timeStr}</span>
                            {isMine && (
                              readCount > 0 ? (
                                <span className="inline-flex items-center gap-0.5 font-black text-[#00E676]">
                                  <CheckCheck className="w-3.5 h-3.5" />
                                  <span>
                                    {activeDmUser
                                      ? 'تمت القراءة'
                                      : `تمت القراءة (${readCount})`}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 opacity-80">
                                  <Check className="w-3 h-3" />
                                  <span>تم الإرسال</span>
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {errorMsg && (
                <div className="p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 font-semibold">
                  {errorMsg}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Active Reply or Directed User Preview Banner */}
          {!showUserPicker && (replyingTo || directedToUser) && (
            <div className="px-3 py-1.5 bg-emerald-50 dark:bg-[#0A2540] border-t border-emerald-200 dark:border-[#00A651]/40 flex items-center justify-between gap-2 shrink-0 text-xs">
              <div className="min-w-0 flex items-center gap-2">
                {directedToUser ? (
                  <Target className="w-3.5 h-3.5 text-[#00A651] shrink-0" />
                ) : (
                  <Reply className="w-3.5 h-3.5 text-[#00A651] shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-extrabold text-[11px] text-[#004B87] dark:text-[#00E676] flex items-center gap-1.5 truncate">
                    <span>
                      {directedToUser
                        ? `رد موجه إلى: ${directedToUser.fullName}`
                        : `رد على ${replyingTo?.senderName}`}
                    </span>
                    {directedToUser && (
                      <span
                        className={`text-[9px] px-1.5 rounded ${
                          isUserOnline(directedToUser, nowMs)
                            ? 'bg-[#00A651] text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {isUserOnline(directedToUser, nowMs) ? 'أون لاين' : 'أوف لاين'}
                      </span>
                    )}
                  </div>
                  {replyingTo && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      {replyingTo.message}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  setDirectedToUser(null);
                }}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-md shrink-0 cursor-pointer"
                title="إلغاء الرد / التوجيه"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Directed Reply Target Picker */}
          {!showUserPicker && showTargetPicker && (
            <div className="max-h-40 overflow-y-auto bg-white dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] px-2.5 py-2 space-y-1 shrink-0">
              <div className="text-[10px] font-bold text-[#004B87] dark:text-[#00E676] px-1">
                توجيه الرد لمستخدم محدد:
              </div>
              {teamColleagues.map((u) => {
                const online = isUserOnline(u, nowMs);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setDirectedToUser(u);
                      setShowTargetPicker(false);
                      setTimeout(() => inputRef.current?.focus(), 40);
                    }}
                    className="w-full text-right px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#0B1D35] flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-white truncate">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          online ? 'bg-[#00E676]' : 'bg-slate-400'
                        }`}
                      />
                      <span className="truncate">{u.fullName}</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold shrink-0 ${
                        online ? 'text-[#00A651] dark:text-[#00E676]' : 'text-slate-400'
                      }`}
                    >
                      {online ? 'أون لاين' : 'أوف لاين'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* @Mention Autocomplete Picker */}
          {!showUserPicker && showMentionPicker && mentionableUsers.length > 0 && (
            <div className="max-h-36 overflow-y-auto bg-white dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] px-2 py-1.5 space-y-1 shrink-0">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-1.5">
                اختر زميلاً للإشارة إليه (@منشن):
              </div>
              {mentionableUsers.map((u) => {
                const online = isUserOnline(u, nowMs);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => insertMention(u)}
                    className="w-full text-right px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#0B1D35] flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-white truncate">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          online ? 'bg-[#00E676]' : 'bg-slate-400'
                        }`}
                      />
                      <span className="truncate">@{u.fullName}</span>
                    </span>
                    <span className="text-[10px] text-[#004B87] dark:text-sky-300 font-semibold shrink-0">
                      {online ? 'أون لاين' : 'أوف لاين'} · {getRoleDefaultJobTitle(u.role)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* #Case Autocomplete Picker */}
          {!showUserPicker && showCasePicker && (
            <div className="max-h-40 overflow-y-auto bg-white dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] px-2 py-1.5 space-y-1 shrink-0">
              <div className="text-[10px] font-bold text-[#004B87] dark:text-[#00E676] px-1.5">
                اختر رقم الحالة لإدراجه كرابط (#CRM):
              </div>
              {matchingCases.length === 0 ? (
                <div className="text-[11px] text-slate-400 px-2 py-2">لا توجد حالات مطابقة</div>
              ) : (
                matchingCases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => insertCaseLink(c)}
                    className="w-full text-right px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#0B1D35] flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-black text-[#004B87] dark:text-[#00E676]">
                        #{c.caseId}
                      </span>{' '}
                      <span className="font-bold text-slate-800 dark:text-white truncate">
                        {c.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0 truncate max-w-[110px]">
                      {c.taxpayerName}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Emoji Picker Grid */}
          {!showUserPicker && showEmojiPicker && (
            <div className="bg-white dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] p-2 shrink-0">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_LIST.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => insertEmoji(em)}
                    className="p-1.5 text-base rounded-lg hover:bg-slate-100 dark:hover:bg-[#0B1D35] transition-transform hover:scale-110 cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Templates + Composer */}
          {!showUserPicker && (
            isChatPaused && !isAdmin ? (
              <div className="p-3 bg-slate-100 dark:bg-[#071629] border-t border-slate-200 dark:border-[#00386B] text-center text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 shrink-0">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>الإرسال متوقف مؤقتاً بقرار مدير النظام ({pauseRemainingLabel})</span>
              </div>
            ) : (
            <>
              <div className="px-3 py-1.5 bg-white dark:bg-[#0B1D35] border-t border-slate-100 dark:border-[#00386B]/70 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {quickMessages.map((qm, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(qm)}
                    disabled={isSending}
                    className="whitespace-nowrap text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#071629] hover:bg-[#00A651]/15 text-slate-700 dark:text-sky-200 border border-slate-200 dark:border-[#00386B] transition-colors shrink-0 cursor-pointer"
                  >
                    {qm}
                  </button>
                ))}
              </div>

              {/* Queued Attachments Preview Bar before sending */}
              {queuedAttachments.length > 0 && (
                <div className="px-2.5 py-2 bg-emerald-50/90 dark:bg-[#071A30] border-t border-emerald-200 dark:border-[#004B87] space-y-1.5 max-h-32 overflow-y-auto shrink-0">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#004B87] dark:text-[#00E676]">
                    <span className="flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      <span>مرفقات جاهزة للإرسال ({queuedAttachments.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        queuedAttachments.forEach((item) => {
                          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                        });
                        setQueuedAttachments([]);
                      }}
                      className="text-rose-600 hover:underline cursor-pointer"
                    >
                      إزالة الكل
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {queuedAttachments.map((item) => {
                      const isImg = isPreviewableImage(item.file.type, item.file.name);
                      return (
                        <div
                          key={item.localId}
                          className="flex items-center gap-1.5 bg-white dark:bg-[#0B1D35] border border-slate-200 dark:border-[#00386B] rounded-xl p-1.5 max-w-[195px]"
                        >
                          {isImg && item.previewUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewAttachmentTarget({
                                  fileName: item.file.name,
                                  mimeType: item.file.type || 'image/png',
                                  sizeBytes: item.file.size,
                                  inlineUrl: item.previewUrl!,
                                  subtitle: 'معاينة قبل الإرسال',
                                })
                              }
                              className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 shrink-0 cursor-pointer"
                              title="معاينة الصورة"
                            >
                              <img
                                src={item.previewUrl}
                                alt={item.file.name}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            renderChatFileIcon(item.file.type, item.file.name)
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-slate-800 dark:text-white truncate">
                              {item.file.name}
                            </div>
                            <div className="text-[9px] text-slate-500 dark:text-slate-400">
                              {formatFileSizeArabic(item.file.size)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQueuedAttachment(item.localId)}
                            className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                            title="إزالة المرفق"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-2 bg-white dark:bg-[#0B1D35] border-t border-slate-200 dark:border-[#00386B] space-y-1.5 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT_ATTR}
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="hidden"
                />

                {/* Compact Tools Row */}
                <div className="flex items-center justify-between gap-1 overflow-x-auto">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSending}
                      title="إرفاق مستند أو صورة (PDF، صور، Word، Excel)"
                      className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${
                        queuedAttachments.length > 0
                          ? 'bg-[#00A651] text-white border-[#008742]'
                          : 'bg-slate-100 dark:bg-[#071629] text-[#004B87] dark:text-sky-200 border-slate-200 dark:border-[#00386B] hover:border-[#00A651]'
                      }`}
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>إرفاق</span>
                      {queuedAttachments.length > 0 && (
                        <span className="px-1 rounded-full bg-white text-[#008742] text-[9px] font-black tabular-nums">
                          {queuedAttachments.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker((prev) => !prev);
                        setShowMentionPicker(false);
                        setShowCasePicker(false);
                        setShowTargetPicker(false);
                      }}
                      title="إضافة إيموشن"
                      className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 cursor-pointer ${
                        showEmojiPicker
                          ? 'bg-[#00A651] text-white border-[#008742]'
                          : 'bg-slate-100 dark:bg-[#071629] text-amber-500 border-slate-200 dark:border-[#00386B]'
                      }`}
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowTargetPicker((prev) => !prev);
                        setShowEmojiPicker(false);
                        setShowMentionPicker(false);
                        setShowCasePicker(false);
                      }}
                      title="توجيه الرد لمستخدم محدد"
                      className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 cursor-pointer ${
                        directedToUser || showTargetPicker
                          ? 'bg-[#004B87] text-white border-[#00386B]'
                          : 'bg-slate-100 dark:bg-[#071629] text-[#004B87] dark:text-sky-300 border-slate-200 dark:border-[#00386B]'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMentionFilter('');
                        setShowMentionPicker((prev) => !prev);
                        setShowCasePicker(false);
                        setShowEmojiPicker(false);
                        setShowTargetPicker(false);
                      }}
                      title="منشن زميل (@)"
                      className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 cursor-pointer ${
                        showMentionPicker
                          ? 'bg-[#00A651] text-white border-[#008742]'
                          : 'bg-slate-100 dark:bg-[#071629] text-[#004B87] dark:text-sky-300 border-slate-200 dark:border-[#00386B]'
                      }`}
                    >
                      <AtSign className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCaseFilter('');
                        setShowCasePicker((prev) => !prev);
                        setShowMentionPicker(false);
                        setShowEmojiPicker(false);
                        setShowTargetPicker(false);
                      }}
                      title="إدراج رقم حالة كرابط (#)"
                      className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 cursor-pointer ${
                        showCasePicker
                          ? 'bg-[#004B87] text-white border-[#00386B]'
                          : 'bg-slate-100 dark:bg-[#071629] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#00386B]'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsUrgent((prev) => !prev)}
                      title="تمييز الرسالة كعاجلة"
                      className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 cursor-pointer ${
                        isUrgent
                          ? 'bg-rose-600 text-white border-rose-700'
                          : 'bg-slate-100 dark:bg-[#071629] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#00386B] hover:text-rose-600'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsVoiceOpen(true)}
                      title="إملاء صوتي بالعامية المصرية"
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#071629] hover:bg-emerald-50 text-[#00A651] border border-slate-200 dark:border-[#00386B] transition-colors shrink-0 cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-[9px] text-slate-400 dark:text-slate-500 hidden sm:inline shrink-0">
                    يمكنك لصق صورة مباشرة (Ctrl+V)
                  </span>
                </div>

                {/* Message Input + Send Row */}
                <div className="flex items-end gap-1.5">
                  <StyledTextarea
                    ref={inputRef}
                    rows={1}
                    value={inputText}
                    onChange={handleInputChange}
                    onPaste={handleComposerPaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      activeDmUser
                        ? `رسالة أو مرفق إلى ${activeDmUser.fullName}...`
                        : 'اكتب رسالتك أو أرفق مستند/صورة (@منشن، #حالة)...'
                    }
                    className="flex-1 max-h-20 p-2 text-xs bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none resize-none"
                  />

                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={(!inputText.trim() && queuedAttachments.length === 0) || isSending}
                    className="p-2.5 rounded-xl bg-[#00A651] hover:bg-[#008742] text-white disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
                    aria-label="إرسال"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
            )
          )}
        </div>
      )}

      {/* Voice input modal for team chat */}
      <VoiceRecorderModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onConfirm={(text) => {
          if (text) {
            setInputText(text);
            setTimeout(() => inputRef.current?.focus(), 60);
          }
        }}
        title="إملاء رسالة شات المساعدة السريعة صوتياً"
        initialText={inputText}
      />

      {/* In-app preview modal for chat images & documents */}
      <CaseAttachmentPreviewModal
        target={previewAttachmentTarget}
        onClose={() => setPreviewAttachmentTarget(null)}
      />
    </>,
    document.body
  );
};
