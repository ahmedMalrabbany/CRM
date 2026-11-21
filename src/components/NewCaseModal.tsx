/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Check,
  AlertTriangle,
  Mic,
  Sparkles,
  Phone,
  FileText,
  Building,
  UserPlus,
  Clock,
  Lock,
  CheckCircle2,
  Info,
  Wrench,
  Headphones,
  MessageSquare,
  CreditCard,
} from 'lucide-react';
import {
  CallType,
  TaxType,
  ContactChannel,
  CallerTitle,
  CallerClassification,
  User,
  CasePriority,
  Taxpayer,
  Caller,
  Case,
  CaseAttachment
} from '../types';
import { getServicesByTaxType, OTHER_SERVICE_OPTION } from '../data/taxServices';
import {
  normalizeCaseTitle,
  isValidTaxRegistrationNumber,
  isValidEgyptianNationalId,
  normalizeAsciiDigits,
} from '../utils/normalization';
import { getTaxpayerByNumber, upsertTaxpayer } from '../services/taxpayerService';
import { findAllCallersByPhone, CallerPhoneMatch } from '../services/callerService';
import { createCase, findPotentialDuplicates } from '../services/caseService';
import { uploadCaseAttachment } from '../services/attachmentService';
import { classifyCaseWithAI } from '../services/geminiService';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { AddCallerModal } from './AddCallerModal';
import { PendingAttachmentsPicker, QueuedAttachmentFile } from './CaseAttachmentsSection';
import { StyledTextarea } from './StyledTextarea';
import { collection, getDocs, limit, orderBy, query, where } from '../lib/sheetsDb';
import { db } from '../config/firebase';

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onCaseCreated: (createdCase: Case) => void;
}

export const NewCaseModal: React.FC<NewCaseModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onCaseCreated,
}) => {
  const isAgent = currentUser.role === 'agent';
  const isTechTeam = currentUser.role === 'technical_support' || currentUser.role === 'management' || currentUser.role === 'super_admin';
  const modalRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (formRef.current) formRef.current.scrollTop = 0;
      modalRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // Step 1: Call Type (طلب – استفسار – شكوى – رسائل SMS)
  const [callType, setCallType] = useState<CallType>('استفسار');

  // Step 2: Tax Registration Number (9 digits) & Taxpayer Name
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState('');
  const [taxpayerName, setTaxpayerName] = useState('');
  const [existingTaxpayer, setExistingTaxpayer] = useState<Taxpayer | null>(null);
  const [taxpayerFromPastCase, setTaxpayerFromPastCase] = useState(false);
  const [isSearchingTaxpayer, setIsSearchingTaxpayer] = useState(false);

  // Step 3: Caller Phone & Details
  const [callerPhone, setCallerPhone] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerNationalId, setCallerNationalId] = useState('');
  const [callerTitle, setCallerTitle] = useState<CallerTitle>('');
  const [callerClassification, setCallerClassification] = useState<CallerClassification>('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [emailAvailability, setEmailAvailability] = useState<'متوفر' | 'غير متوفر'>('غير متوفر');
  const [callerEmail, setCallerEmail] = useState('');
  const [callerDescription, setCallerDescription] = useState('');
  const [existingCaller, setExistingCaller] = useState<Caller | null>(null);
  const [phoneCallerMatches, setPhoneCallerMatches] = useState<CallerPhoneMatch[]>([]);
  const [useCustomCallerNameInput, setUseCustomCallerNameInput] = useState(false);
  const [callerFromPastCase, setCallerFromPastCase] = useState(false);
  const [isSearchingCaller, setIsSearchingCaller] = useState(false);
  const [isAddCallerModalOpen, setIsAddCallerModalOpen] = useState(false);

  // Step 4: Case Details
  // Date and Time live display
  const [currentDateTimeStr, setCurrentDateTimeStr] = useState('');

  const [channel, setChannel] = useState<ContactChannel>('اتصال هاتفي');
  const [taxType, setTaxType] = useState<TaxType>('ضرائب دخل');
  const [serviceType, setServiceType] = useState<string>('الاقرارات الضريبية');
  const [customServiceType, setCustomServiceType] = useState<string>('');
  const [priority, setPriority] = useState<CasePriority>('عادي');

  // Title with history auto-suggest & normalization
  const [rawTitle, setRawTitle] = useState('');
  const [normalizedTitle, setNormalizedTitle] = useState('');
  const [previousTitles, setPreviousTitles] = useState<string[]>([]);

  // Notes & Responses
  const [agentNotes, setAgentNotes] = useState('');
  const [agentReply, setAgentReply] = useState('');
  const [agentEmployeeName, setAgentEmployeeName] = useState(currentUser.fullName);

  // Technical team response (active for tech team, disabled for agents)
  const [managementReply, setManagementReply] = useState('');
  const [managementEmployeeName, setManagementEmployeeName] = useState(
    isTechTeam ? currentUser.fullName : ''
  );

  // Voice recording state
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [voiceTargetField, setVoiceTargetField] = useState<'agentNotes' | 'agentReply' | 'managementReply'>('agentReply');

  // Duplicates alert & submission
  const [duplicateCases, setDuplicateCases] = useState<Case[]>([]);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedAttachmentFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Always reset all form fields to a clean, empty state whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setCallType('استفسار');
    setTaxRegistrationNumber('');
    setTaxpayerName('');
    setExistingTaxpayer(null);
    setTaxpayerFromPastCase(false);
    setIsSearchingTaxpayer(false);

    setCallerPhone('');
    setCallerName('');
    setCallerNationalId('');
    setCallerTitle('');
    setCallerClassification('');
    setSecondaryPhone('');
    setEmailAvailability('غير متوفر');
    setCallerEmail('');
    setCallerDescription('');
    setExistingCaller(null);
    setPhoneCallerMatches([]);
    setUseCustomCallerNameInput(false);
    setCallerFromPastCase(false);
    setIsSearchingCaller(false);

    setChannel('اتصال هاتفي');
    setTaxType('ضرائب دخل');
    setServiceType('الاقرارات الضريبية');
    setCustomServiceType('');
    setPriority('عادي');

    setRawTitle('');
    setNormalizedTitle('');
    setAgentReply('');
    setAgentNotes('');
    setAgentEmployeeName(currentUser.fullName);
    setManagementReply('');
    setManagementEmployeeName(isTechTeam ? currentUser.fullName : '');

    setDuplicateCases([]);
    setQueuedAttachments((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, currentUser.fullName, isTechTeam]);

  // Update live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(now);
      setCurrentDateTimeStr(formatted);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch previous case titles on load for autocomplete
  useEffect(() => {
    const fetchPreviousTitles = async () => {
      try {
        const qCases = query(collection(db, 'cases'), orderBy('createdAt', 'desc'), limit(150));
        const snap = await getDocs(qCases);
        const titlesSet = new Set<string>();
        snap.forEach((d) => {
          const t = d.data().title;
          if (t && typeof t === 'string' && t.trim().length > 3) {
            titlesSet.add(t.trim());
          }
          const raw = d.data().rawTitle;
          if (raw && typeof raw === 'string' && raw.trim().length > 3) {
            titlesSet.add(raw.trim());
          }
        });
        setPreviousTitles(Array.from(titlesSet));
      } catch (e) {
        console.warn('Could not load previous titles for autocomplete', e);
      }
    };
    fetchPreviousTitles();
  }, []);

  // Reset service when tax type changes if current selection isn't valid for new tax type
  useEffect(() => {
    const services = getServicesByTaxType(taxType);
    if (services.length > 0 && serviceType !== OTHER_SERVICE_OPTION && !services.includes(serviceType)) {
      setServiceType(services[0]);
    }
  }, [taxType]);

  // Real-time title normalization
  useEffect(() => {
    if (rawTitle) {
      const norm = normalizeCaseTitle(rawTitle);
      setNormalizedTitle(norm);
    } else {
      setNormalizedTitle('');
    }
  }, [rawTitle]);

  // Auto-search Taxpayer when 9 digits are entered
  useEffect(() => {
    const clean = taxRegistrationNumber.trim();
    if (clean.length === 9 && /^\d{9}$/.test(clean)) {
      setIsSearchingTaxpayer(true);
      setTaxpayerFromPastCase(false);

      getTaxpayerByNumber(clean).then(async (tp) => {
        if (tp && tp.name) {
          setExistingTaxpayer(tp);
          setTaxpayerName(tp.name);
          if (tp.taxType) setTaxType(tp.taxType);
          setIsSearchingTaxpayer(false);
        } else {
          // If not in taxpayers collection, search past cases
          try {
            const qCases = query(
              collection(db, 'cases'),
              where('taxRegistrationNumber', '==', clean),
              limit(1)
            );
            const snap = await getDocs(qCases);
            if (!snap.empty) {
              const data = snap.docs[0].data();
              if (data.taxpayerName) {
                setTaxpayerName(data.taxpayerName);
                setTaxpayerFromPastCase(true);
              }
              if (data.taxType) {
                setTaxType(data.taxType);
              }
            } else {
              setExistingTaxpayer(null);
            }
          } catch (err) {
            console.error(err);
          }
          setIsSearchingTaxpayer(false);
        }
      });

      // Check duplicates
      findPotentialDuplicates(clean, rawTitle).then(setDuplicateCases);
    } else {
      setExistingTaxpayer(null);
      setTaxpayerFromPastCase(false);
      setDuplicateCases([]);
    }
  }, [taxRegistrationNumber]);

  const applyCallerMatch = (match: CallerPhoneMatch) => {
    setUseCustomCallerNameInput(false);
    setCallerName(match.name);
    setCallerTitle(match.title || '');
    setCallerClassification(match.classification || '');
    setCallerNationalId(match.nationalId || '');
    setSecondaryPhone(match.secondaryPhone || '');
    setEmailAvailability(match.emailAvailability || (match.email ? 'متوفر' : 'غير متوفر'));
    setCallerEmail(match.email || '');
    setCallerDescription(match.description || '');
    if (match.source === 'callers') {
      setExistingCaller({
        id: match.id,
        name: match.name,
        title: match.title,
        classification: match.classification,
        taxRegistrationNumber: match.taxRegistrationNumber || '',
        nationalId: match.nationalId || '',
        primaryPhone: match.primaryPhone,
        secondaryPhone: match.secondaryPhone,
        emailAvailability: match.emailAvailability,
        email: match.email,
        description: match.description,
        createdAt: '',
      });
      setCallerFromPastCase(false);
    } else {
      setExistingCaller(null);
      setCallerFromPastCase(true);
    }
    if (match.taxRegistrationNumber && !taxRegistrationNumber) {
      setTaxRegistrationNumber(match.taxRegistrationNumber);
    }
  };

  // Auto-search ALL previously recorded caller names when phone number is entered
  useEffect(() => {
    const cleanPhone = callerPhone.trim();
    if (cleanPhone.length >= 3) {
      setIsSearchingCaller(true);
      setCallerFromPastCase(false);

      findAllCallersByPhone(cleanPhone)
        .then((matches) => {
          setPhoneCallerMatches(matches);
          if (matches.length > 0) {
            applyCallerMatch(matches[0]);
          } else {
            setExistingCaller(null);
            setCallerFromPastCase(false);
            setUseCustomCallerNameInput(false);
          }
        })
        .catch(() => {
          setPhoneCallerMatches([]);
          setExistingCaller(null);
          setCallerFromPastCase(false);
        })
        .finally(() => {
          setIsSearchingCaller(false);
        });
    } else {
      setPhoneCallerMatches([]);
      setUseCustomCallerNameInput(false);
      setExistingCaller(null);
      setCallerFromPastCase(false);
    }
  }, [callerPhone]);

  // Handler when a caller is saved in AddCallerModal
  const handleCallerSaved = (newCaller: Caller) => {
    const newMatch: CallerPhoneMatch = {
      id: newCaller.id,
      name: newCaller.name,
      title: newCaller.title,
      classification: newCaller.classification,
      taxRegistrationNumber: newCaller.taxRegistrationNumber,
      nationalId: newCaller.nationalId,
      primaryPhone: newCaller.primaryPhone,
      secondaryPhone: newCaller.secondaryPhone,
      emailAvailability: newCaller.emailAvailability,
      email: newCaller.email,
      description: newCaller.description,
      source: 'callers',
    };
    setPhoneCallerMatches((prev) => {
      const filtered = prev.filter((m) => m.name !== newMatch.name);
      return [newMatch, ...filtered];
    });
    setCallerPhone(newCaller.primaryPhone);
    applyCallerMatch(newMatch);
  };

  // AI classify suggestion
  const handleAIClassify = async () => {
    if (!rawTitle && !agentNotes) return;
    try {
      const suggestion = await classifyCaseWithAI(rawTitle, agentNotes);
      const nextTax = suggestion.suggestedTaxType || taxType;
      if (suggestion.suggestedTaxType) setTaxType(suggestion.suggestedTaxType);
      if (suggestion.suggestedCallType) setCallType(suggestion.suggestedCallType);
      if (suggestion.suggestedService) {
        const list = getServicesByTaxType(nextTax);
        if (list.includes(suggestion.suggestedService)) {
          setServiceType(suggestion.suggestedService);
          setCustomServiceType('');
        } else {
          setServiceType(OTHER_SERVICE_OPTION);
          setCustomServiceType(suggestion.suggestedService);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleVoiceConfirmed = (transcribedText: string) => {
    if (voiceTargetField === 'agentNotes') {
      setAgentNotes(transcribedText);
    } else if (voiceTargetField === 'agentReply') {
      setAgentReply(transcribedText);
    } else if (voiceTargetField === 'managementReply') {
      setManagementReply(transcribedText);
    }
  };

  // Matching titles for recommendations
  const matchingTitles = rawTitle.trim().length >= 2
    ? previousTitles.filter((t) => t.toLowerCase().includes(rawTitle.trim().toLowerCase())).slice(0, 4)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    const cleanTaxNum = taxRegistrationNumber.trim();
    if (cleanTaxNum && !isValidTaxRegistrationNumber(cleanTaxNum)) {
      setErrorMessage('رقم التسجيل الضريبي في حال كتابته يجب أن يتكون من 9 أرقام بالضبط.');
      return;
    }

    const cleanPhone = normalizeAsciiDigits(callerPhone).replace(/\D/g, '');
    if (!cleanPhone) {
      setErrorMessage('برجاء إدخال رقم هاتف المتصل.');
      return;
    }

    if (!callerName.trim()) {
      setErrorMessage('برجاء إدخال اسم المتصل.');
      return;
    }

    const cleanNationalId = normalizeAsciiDigits(callerNationalId).replace(/\D/g, '').trim();
    if (cleanNationalId && !isValidEgyptianNationalId(cleanNationalId)) {
      setErrorMessage(
        `الرقم القومي للمتصل (في حال إدخاله) يجب أن يتكون من 14 رقماً بالضبط (المكتوب حالياً: ${cleanNationalId.length}).`
      );
      return;
    }

    if (serviceType === OTHER_SERVICE_OPTION && !customServiceType.trim()) {
      setErrorMessage('برجاء كتابة نوع الخدمة يدوياً عند اختيار "أخرى".');
      return;
    }

    if (!normalizedTitle.trim()) {
      setErrorMessage('برجاء إدخال عنوان الحالة.');
      return;
    }

    if (!agentEmployeeName.trim()) {
      setErrorMessage('برجاء تحديد اسم موظف وكيل الاتصال المسؤول.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalTaxpayerName = taxpayerName.trim() || (cleanTaxNum ? 'ممول مسجل' : callerName.trim() || 'بدون تسجيل');
      const finalServiceType =
        serviceType === OTHER_SERVICE_OPTION ? customServiceType.trim() : serviceType;

      // 1. Upsert Taxpayer if 9-digit tax number provided
      if (cleanTaxNum) {
        await upsertTaxpayer({
          taxRegistrationNumber: cleanTaxNum,
          name: finalTaxpayerName,
          taxType,
        });
      }

      // 1b. Upload any queued case attachments to server storage
      const uploadedAttachments: CaseAttachment[] = [];
      for (const item of queuedAttachments) {
        const uploaded = await uploadCaseAttachment(item.file, 'create', currentUser);
        uploadedAttachments.push(uploaded);
      }

      // 2. Create Case with all unified fields
      const newCase = await createCase(
        {
          callType,
          taxType,
          serviceType: finalServiceType,
          channel,
          title: normalizedTitle.trim(),
          rawTitle: rawTitle.trim(),
          taxRegistrationNumber: cleanTaxNum,
          taxpayerName: finalTaxpayerName,
          callerName: callerName.trim(),
          callerNationalId: cleanNationalId,
          callerPhone: callerPhone.trim(),
          callerSecondaryPhone: secondaryPhone.trim(),
          callerTitle,
          callerClassification,
          callerEmail: emailAvailability === 'متوفر' && callerEmail.trim() ? callerEmail.trim() : '',
          callerDescription: callerDescription.trim(),
          status: 'جديدة',
          priority,
          agentNotes: agentNotes.trim(),
          agentReply: agentReply.trim(),
          agentEmployeeName: agentEmployeeName.trim(),
          managementReply: managementReply.trim(),
          managementEmployeeName: managementEmployeeName.trim(),
          attachments: uploadedAttachments,
        },
        currentUser
      );

      onCaseCreated(newCase);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ الحالة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentTaxServices = getServicesByTaxType(taxType);

  // Deduplicated unique active agent users
  const rawAgentUsers = allUsers.filter((u) => u.status === 'active' && u.role === 'agent');
  const baseAgentsList = rawAgentUsers.length > 0 ? rawAgentUsers : allUsers.filter((u) => u.status === 'active');
  const seenAgentNames = new Set<string>();
  const uniqueAgentUsers: User[] = [];
  for (const u of baseAgentsList) {
    const key = u.fullName.trim();
    if (!seenAgentNames.has(key)) {
      seenAgentNames.add(key);
      uniqueAgentUsers.push(u);
    }
  }

  // Deduplicated unique active management and technical support users
  const rawTechUsers = allUsers.filter(
    (u) =>
      u.status === 'active' &&
      (u.role === 'technical_support' || u.role === 'management' || u.role === 'super_admin')
  );
  const seenTechNames = new Set<string>();
  const uniqueTechUsers: User[] = [];
  for (const u of rawTechUsers) {
    const key = u.fullName.trim();
    if (!seenTechNames.has(key)) {
      seenTechNames.add(key);
      uniqueTechUsers.push(u);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 overflow-y-auto">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white dark:bg-[#0B1D35] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#00386B] w-full max-w-4xl my-auto max-h-[92dvh] overflow-hidden flex flex-col animate-scale-in text-start focus:outline-none"
      >
        {/* Modal Header */}
        <div className="bg-[#00264D] p-4 text-white flex flex-wrap items-center justify-between gap-2.5 border-b border-[#004B87] shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#00A651] text-white shadow-xs">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base text-white">تسجيل حالة جديدة</h2>
                <span className="bg-[#004B87] text-white border border-[#00A651] text-[10px] px-2 py-0.5 rounded-full font-bold">
                  منظومة الضرائب المصرية
                </span>
              </div>
              <p className="text-xs text-sky-200">نظام خدمة العملاء وإدارة اتصالات الممولين</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('eta:open-ai-assistant'))}
              title="فتح المساعد الذكي للمساعدة أثناء تسجيل الحالة"
              className="px-2.5 py-1.5 bg-[#00A651] hover:bg-[#008742] text-white rounded-xl text-[11px] font-extrabold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>المساعد الذكي</span>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('eta:open-team-chat'))}
              title="فتح شات الفريق للتواصل والاستفسار أثناء تسجيل الحالة"
              className="px-2.5 py-1.5 bg-[#004B87] hover:bg-[#005ea8] text-white border border-sky-400/40 rounded-xl text-[11px] font-extrabold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>شات الفريق</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sky-200 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 flex flex-col gap-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Duplicates Alert */}
          {duplicateCases.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>تنبيه: توجد حالات مسجلة لنفس رقم التسجيل الضريبي ({duplicateCases.length})</span>
              </div>
              <div className="text-[11px] text-amber-800 space-y-1">
                {duplicateCases.map((dc) => (
                  <div key={dc.id} className="flex justify-between border-b border-amber-200/60 pb-1">
                    <span className="font-bold">{dc.caseId}: {dc.title}</span>
                    <span className="bg-amber-200/80 px-1.5 py-0.5 rounded text-[10px]">{dc.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 1: Call Type (نوع الاتصال) */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5 text-sm">
              <FileText className="w-4 h-4 text-blue-700" />
              1. نوع الاتصال (Call Type)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  تحديد نوع الاتصال * (من القائمة المنسدلة)
                </label>
                <select
                  value={callType}
                  onChange={(e) => setCallType(e.target.value as CallType)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
                >
                  <option value="طلب">طلب</option>
                  <option value="استفسار">استفسار</option>
                  <option value="شكوى">شكوى</option>
                  <option value="رسائل SMS">رسائل SMS</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">درجة الأولوية</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as CasePriority)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold text-slate-900 text-xs shadow-2xs"
                >
                  <option value="عادي">عادي</option>
                  <option value="هام">هام</option>
                  <option value="عاجل">عاجل</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Tax Registration Number & Taxpayer Name */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <Building className="w-4 h-4 text-blue-700" />
                2. بيانات الممول والشركة (Taxpayer Info)
              </h3>
              {(existingTaxpayer || taxpayerFromPastCase) && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تم استرجاع اسم الممول تلقائياً من السجلات السابقة
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    رقم التسجيل الضريبي المكون من 9 أرقام
                  </label>
                  <span className="text-[10px] text-slate-500 font-bold bg-slate-200/80 px-2 py-0.5 rounded-md">
                    اختياري
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={9}
                    value={taxRegistrationNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setTaxRegistrationNumber(val);
                    }}
                    placeholder="أدخل 9 أرقام (مثال: 123456789)..."
                    className="w-full p-2.5 pl-9 font-mono text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 shadow-2xs"
                  />
                  <div className="absolute left-2.5 top-3 text-slate-400">
                    {isSearchingTaxpayer ? (
                      <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block"></span>
                    ) : (
                      <span className="text-[11px] font-mono">
                        {taxRegistrationNumber.length > 0 ? `${taxRegistrationNumber.length}/9` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  * في حال كان الرقم مسجلاً في حالة سابقة، سيظهر اسم الممول/الشركة تلقائياً.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم الممول أو الشركة</label>
                <input
                  type="text"
                  value={taxpayerName}
                  onChange={(e) => setTaxpayerName(e.target.value)}
                  placeholder="اسم الممول أو الكيان التجاري..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
                />
                {taxpayerName && (
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    يمكن تعديل الاسم أو اعتماده كما هو للحالة.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Caller Info & Add Button */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <Phone className="w-4 h-4 text-blue-700" />
                3. بيانات المتصل (Caller Details)
              </h3>
              <button
                type="button"
                onClick={() => setIsAddCallerModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                title="إضافة وتسجيل بيانات المتصل لأول مرة"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>إضافة بيانات المتصل</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">رقم تليفون المتصل *</label>
                <div className="relative">
                  <input
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    required
                    value={callerPhone}
                    onChange={(e) =>
                      setCallerPhone(normalizeAsciiDigits(e.target.value).replace(/\D/g, ''))
                    }
                    placeholder="أدخل رقم تليفون المتصل..."
                    className="w-full p-2.5 pl-8 font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 text-xs shadow-2xs text-left"
                  />
                  <div className="absolute left-2.5 top-3 text-slate-400">
                    {isSearchingCaller && (
                      <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block"></span>
                    )}
                  </div>
                </div>

                {/* Status indicator */}
                {existingCaller || callerFromPastCase ? (
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 mt-1.5 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    بيانات المتصل مسجلة مسبقاً (تم الاستدعاء التلقائي)
                  </span>
                ) : (
                  callerPhone.length >= 3 && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-blue-900 bg-blue-50 border border-blue-200 p-1.5 rounded-lg">
                      <span className="flex items-center gap-1 font-semibold">
                        <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        اتصال لأول مرة بهذا الرقم
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddCallerModalOpen(true)}
                        className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
                      >
                        انقر لإضافة البيانات
                      </button>
                    </div>
                  )
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1 gap-1">
                  <label className="font-bold text-slate-700">اسم المتصل *</label>
                  {phoneCallerMatches.length > 0 && (
                    <span className="text-[10px] font-bold text-[#004B87] bg-blue-100/90 px-2 py-0.5 rounded-md">
                      {phoneCallerMatches.length} {phoneCallerMatches.length === 1 ? 'اسم مسجل' : 'أسماء مسجلة'} لهذا الرقم
                    </span>
                  )}
                </div>

                {phoneCallerMatches.length > 0 && !useCustomCallerNameInput ? (
                  <div className="space-y-1.5">
                    <select
                      value={
                        phoneCallerMatches.some((m) => m.name === callerName)
                          ? callerName
                          : '__CUSTOM__'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM__') {
                          setUseCustomCallerNameInput(true);
                          setCallerName('');
                          return;
                        }
                        const picked = phoneCallerMatches.find((m) => m.name === val);
                        if (picked) {
                          applyCallerMatch(picked);
                        } else {
                          setCallerName(val);
                        }
                      }}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
                    >
                      {phoneCallerMatches.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                          {m.title ? ` (${m.title})` : ''}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ إدخال اسم متصل جديد يدوياً...</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      required
                      value={callerName}
                      onChange={(e) => setCallerName(e.target.value)}
                      placeholder="أدخل اسم المتصل..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
                    />
                    {phoneCallerMatches.length > 0 && useCustomCallerNameInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomCallerNameInput(false);
                          applyCallerMatch(phoneCallerMatches[0]);
                        }}
                        className="text-[11px] font-bold text-[#004B87] hover:underline cursor-pointer"
                      >
                        العودة لاختيار اسم مسجل مسبقاً لهذا الرقم ({phoneCallerMatches.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Optional 14-digit Caller National ID */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-blue-700" />
                  <span>الرقم القومي للمتصل (14 رقماً)</span>
                </label>
                <span className="text-[10px] text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-md font-bold">
                  اختياري — غير أساسي
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={14}
                  value={callerNationalId}
                  onChange={(e) =>
                    setCallerNationalId(
                      normalizeAsciiDigits(e.target.value).replace(/\D/g, '').slice(0, 14)
                    )
                  }
                  placeholder="أدخل 14 رقماً (اختياري)..."
                  className="w-full p-2.5 pl-12 font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 text-xs shadow-2xs text-left"
                />
                {callerNationalId.length > 0 && (
                  <span className="absolute left-3 top-2.5 text-[11px] font-mono text-slate-500">
                    {callerNationalId.length}/14
                  </span>
                )}
              </div>
              {callerNationalId.length > 0 && callerNationalId.length < 14 && (
                <span className="text-[10px] text-amber-700 block mt-1">
                  في حال كتابة الرقم القومي يجب استيفاء 14 رقماً ({callerNationalId.length}/14)
                </span>
              )}
            </div>

            {/* Readonly preview of caller metadata if present */}
            {(callerTitle || callerClassification || secondaryPhone || callerEmail) && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex flex-wrap gap-2 text-[11px]">
                {callerTitle && (
                  <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                    الصفة: <strong className="text-slate-900">{callerTitle}</strong>
                  </span>
                )}
                {callerClassification && (
                  <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                    التصنيف: <strong className="text-slate-900">{callerClassification}</strong>
                  </span>
                )}
                {secondaryPhone && (
                  <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-semibold font-mono">
                    هاتف إضافي: {secondaryPhone}
                  </span>
                )}
                {callerEmail && (
                  <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-semibold font-mono">
                    البريد: {callerEmail}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Case Details (تفاصيل الحالة) */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <FileText className="w-4 h-4 text-blue-700" />
                4. تفاصيل الحالة والخدمة الضريبية
              </h3>
            </div>

            {/* Auto Case ID & Live Date/Time Banner */}
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></div>
                <span className="font-bold text-emerald-950 text-xs">رقم الحالة:</span>
                <span className="font-mono font-black text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200 text-xs">
                  توليد تلقائي تسلسلي عام لكافة الحسابات (CRM-XXXXXX)
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-700 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>تاريخ ووقت الحالة:</span>
                <span className="font-mono text-emerald-900 font-bold">{currentDateTimeStr || 'جاري التحديد...'}</span>
              </div>
            </div>

            {/* Case Title with auto-suggestions & normalization */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800">
                  عنوان الحالة يدوياً مع استدعاء العناوين المسجلة مسبقاً *
                </label>
                {(rawTitle || agentNotes) && (
                  <button
                    type="button"
                    onClick={handleAIClassify}
                    className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    اقتراح تصنيف ذكي بالذكاء الاصطناعي
                  </button>
                )}
              </div>
              <input
                type="text"
                list="previous-case-titles"
                required
                value={rawTitle}
                onChange={(e) => setRawTitle(e.target.value)}
                placeholder="اكتب عنوان الحالة أو اختر من العناوين المشابهة المسجلة مسبقاً..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
              />
              <datalist id="previous-case-titles">
                {previousTitles.map((title, idx) => (
                  <option key={idx} value={title} />
                ))}
              </datalist>

              {/* Quick Suggestion Pills */}
              {matchingTitles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 font-bold">عناوين سابقة مشابهة:</span>
                  {matchingTitles.map((mt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRawTitle(mt)}
                      className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer"
                    >
                      {mt}
                    </button>
                  ))}
                </div>
              )}

              {/* Normalization engine preview */}
              {normalizedTitle && (
                <div className="mt-2 p-2.5 bg-blue-50/60 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-blue-950">
                      العنوان الموحد بعد تطبيق معيار التوحيد (Normalization Engine):
                    </span>
                    <span className="text-[10px] text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full font-bold">
                      جاهز للاعتماد
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 mt-1 bg-white p-2 rounded-lg border border-blue-100 text-xs">
                    {normalizedTitle}
                  </div>
                </div>
              )}
            </div>

            {/* Channel, Tax Type & Service Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Channel */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">قناة الاتصال *</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as ContactChannel)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold text-slate-900 text-xs shadow-2xs"
                >
                  <option value="اتصال هاتفي">اتصال هاتفي</option>
                  <option value="بريد إلكتروني">بريد إلكتروني</option>
                </select>
              </div>

              {/* Tax Type */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع الضريبة *</label>
                <select
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value as TaxType)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
                >
                  <option value="ضرائب دخل">ضرائب دخل</option>
                  <option value="ضرائب قيمة مضافة">ضرائب قيمة مضافة</option>
                </select>
              </div>

              {/* Service Type */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  نوع الخدمة ({taxType}) *
                </label>
                <select
                  value={serviceType}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setServiceType(nextVal);
                    if (nextVal !== OTHER_SERVICE_OPTION) {
                      setCustomServiceType('');
                    }
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 text-xs shadow-2xs"
                >
                  {currentTaxServices.map((srv) => (
                    <option key={srv} value={srv}>
                      {srv}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {serviceType === OTHER_SERVICE_OPTION && (
              <div className="bg-white border border-[#004B87]/35 rounded-xl p-3 animate-fade-in">
                <label className="font-bold text-[#00264D] block mb-1">
                  كتابة نوع الخدمة يدوياً *
                </label>
                <input
                  type="text"
                  required
                  value={customServiceType}
                  onChange={(e) => setCustomServiceType(e.target.value)}
                  placeholder="اكتب نوع الخدمة المطلوبة يدوياً..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#00A651] font-bold text-slate-900 text-xs focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Section 5: Notes, Replies & Staff Assignments */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-3.5">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <Headphones className="w-4 h-4 text-blue-700" />
              5. الردود والملاحظات والمسؤولين
            </h3>

            {/* Agent Reply FIRST and slightly larger */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-black text-[#00264D] text-[13px]">
                  رد وكلاء الاتصال (يدوياً أو Voice):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceTargetField('agentReply');
                    setIsVoiceModalOpen(true);
                  }}
                  className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 bg-blue-100/80 hover:bg-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>تسجيل صوتي Voice للرد</span>
                </button>
              </div>
              <StyledTextarea
                rows={4}
                value={agentReply}
                onChange={(e) => setAgentReply(e.target.value)}
                placeholder="الرد أو التوجيه الموجه للممول في حال تم الرد..."
                className="w-full p-3 bg-white border-2 border-[#004B87]/35 rounded-xl focus:ring-2 focus:ring-[#00A651] focus:border-[#00A651] text-sm font-medium text-slate-900 min-h-[104px] focus:outline-none"
              />
            </div>

            {/* Agent Notes SECOND below Agent Reply */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-800">
                  ملاحظات وكلاء الاتصال (يدوياً أو Voice):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceTargetField('agentNotes');
                    setIsVoiceModalOpen(true);
                  }}
                  className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 bg-blue-100/80 hover:bg-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>تسجيل صوتي Voice مدعوم بالذكاء الاصطناعي</span>
                </button>
              </div>
              <StyledTextarea
                rows={2}
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="اكتب ملاحظات وتفاصيل اتصال الممول يدوياً أو استخدم التسجيل الصوتي..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </div>

            {/* Agent Employee Name (Automatically set from logged-in account) */}
            <div>
              <label className="font-bold text-slate-800 block mb-1">
                اسم موظف وكلاء الاتصال * (محدد تلقائياً حسب حساب الإنشاء)
              </label>
              <div className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-900 text-xs flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#00A651]" />
                  <span>
                    {currentUser.fullName} ({currentUser.crmUser})
                  </span>
                </span>
                <span className="text-[10px] font-bold text-[#004B87] bg-white px-2 py-0.5 rounded border border-slate-200">
                  تلقائي من الحساب
                </span>
              </div>
            </div>

            {/* Technical Team Reply & Employee (Disabled for agent, active for tech team) */}
            <div className={`p-3.5 rounded-xl border ${isAgent ? 'bg-slate-100/80 border-slate-300' : 'bg-blue-50/60 border-blue-200'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-blue-800" />
                  <label className="font-bold text-slate-900">
                    رد الفريق التقني (يدوياً أو Voice)
                  </label>
                  {isAgent && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      غير مفعل لوكيل الاتصال (خاص بالفريق التقني فقط)
                    </span>
                  )}
                </div>

                {!isAgent && (
                  <button
                    type="button"
                    onClick={() => {
                      setVoiceTargetField('managementReply');
                      setIsVoiceModalOpen(true);
                    }}
                    className="text-xs text-blue-800 hover:text-blue-950 font-bold flex items-center gap-1 bg-blue-200/70 hover:bg-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>تسجيل صوتي Voice للفريق التقني</span>
                  </button>
                )}
              </div>

              <StyledTextarea
                rows={2}
                disabled={isAgent}
                value={managementReply}
                onChange={(e) => setManagementReply(e.target.value)}
                placeholder={
                  isAgent
                    ? 'هذا الحقل مخصص للفريق التقني والإدارة فقط (غير متاح للكتابة لوكيل الاتصال).'
                    : 'اكتب توجيه أو حل الفريق التقني يدوياً أو بواسطة التسجيل الصوتي...'
                }
                className={`w-full p-2.5 rounded-xl border text-xs ${
                  isAgent
                    ? 'bg-slate-200/60 border-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 text-slate-900'
                }`}
              />

              {/* Technical / Management Employee Name (Automatically set from logged-in account) */}
              <div className="mt-3">
                <label className="font-bold text-slate-800 block mb-1">
                  اسم موظف الإدارة والدعم التقني (محدد تلقائياً حسب حساب الإنشاء)
                </label>
                <div
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                    isAgent
                      ? 'bg-slate-200/60 border-slate-300 text-slate-500'
                      : 'bg-slate-100 border-blue-300 text-slate-900'
                  }`}
                >
                  <span>
                    {isAgent
                      ? '— غير مفعل لوكيل الاتصال —'
                      : `${currentUser.fullName} (${currentUser.crmUser})`}
                  </span>
                  {!isAgent && (
                    <span className="text-[10px] font-bold text-[#004B87] bg-white px-2 py-0.5 rounded border border-blue-200">
                      تلقائي من الحساب
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Attachments */}
          <PendingAttachmentsPicker
            files={queuedAttachments}
            onChange={setQueuedAttachments}
            disabled={isSubmitting}
          />

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-black bg-[#00A651] hover:bg-[#008742] text-white rounded-xl shadow-md shadow-[#00A651]/25 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  جارٍ الحفظ وإنشاء رقم الحالة...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  حفظ وإنشاء الحالة رسمياً
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Voice Recorder Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onConfirm={handleVoiceConfirmed}
        title={
          voiceTargetField === 'agentNotes'
            ? 'تسجيل صوتي لملاحظات وكيل الاتصال'
            : voiceTargetField === 'agentReply'
            ? 'تسجيل صوتي لرد وكيل الاتصال'
            : 'تسجيل صوتي لرد الفريق التقني'
        }
        initialText={
          voiceTargetField === 'agentNotes'
            ? agentNotes
            : voiceTargetField === 'agentReply'
            ? agentReply
            : managementReply
        }
      />

      {/* Add Caller Screen / Sub-modal */}
      <AddCallerModal
        isOpen={isAddCallerModalOpen}
        onClose={() => setIsAddCallerModalOpen(false)}
        initialPhone={callerPhone}
        initialTaxNumber={taxRegistrationNumber}
        onCallerSaved={handleCallerSaved}
      />
    </div>
  );
};
