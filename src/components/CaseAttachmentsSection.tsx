/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Paperclip,
  Upload,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  Eye,
  Download,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { CaseAttachment, CaseAttachmentStage } from '../types';
import {
  ATTACHMENT_ACCEPT_ATTR,
  MAX_ATTACHMENTS_PER_CASE,
  formatFileSizeArabic,
  getAttachmentDownloadUrl,
  getAttachmentInlineUrl,
  getAttachmentStageLabel,
  getFileExtension,
  isPreviewableImage,
  isPreviewablePdf,
  validateAttachmentFile,
} from '../services/attachmentService';

export interface QueuedAttachmentFile {
  localId: string;
  file: File;
  previewUrl?: string;
}

function getFileIcon(mimeType: string, fileName: string) {
  const ext = getFileExtension(fileName);
  if (isPreviewableImage(mimeType, fileName)) {
    return <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />;
  }
  if (isPreviewablePdf(mimeType, fileName)) {
    return <FileText className="w-4 h-4 text-rose-600 shrink-0" />;
  }
  if (['.xls', '.xlsx', '.csv'].includes(ext) || mimeType.includes('sheet') || mimeType.includes('excel')) {
    return <FileSpreadsheet className="w-4 h-4 text-[#00A651] shrink-0" />;
  }
  if (['.doc', '.docx'].includes(ext) || mimeType.includes('word')) {
    return <FileText className="w-4 h-4 text-[#004B87] shrink-0" />;
  }
  return <FileIcon className="w-4 h-4 text-slate-600 shrink-0" />;
}

function getStageBadgeStyle(stage: CaseAttachmentStage): string {
  switch (stage) {
    case 'create':
      return 'bg-slate-100 text-slate-800 border-slate-300';
    case 'agent_reply':
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    case 'management_reply':
      return 'bg-blue-100 text-blue-900 border-blue-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

interface PreviewTarget {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  inlineUrl: string;
  downloadUrl?: string;
  subtitle?: string;
}

export const CaseAttachmentPreviewModal: React.FC<{
  target: PreviewTarget | null;
  onClose: () => void;
}> = ({ target, onClose }) => {
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  if (!target) return null;

  const isImg = isPreviewableImage(target.mimeType, target.fileName);
  const isPdf = isPreviewablePdf(target.mimeType, target.fileName);

  return createPortal(
    <div
      dir="rtl"
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#001429]/85 backdrop-blur-xs p-3 sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 bg-[#00264D] text-white flex items-center justify-between gap-3 border-b border-[#004B87] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Paperclip className="w-4 h-4 text-[#00E676] shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-xs sm:text-sm truncate">{target.fileName}</div>
              <div className="text-[11px] text-sky-200 truncate">
                {formatFileSizeArabic(target.sizeBytes)}
                {target.subtitle ? ` · ${target.subtitle}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {target.downloadUrl && (
              <a
                href={target.downloadUrl}
                download={target.fileName}
                className="px-3 py-1.5 bg-[#00A651] hover:bg-[#008742] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>إغلاق</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center min-h-[360px]">
          {isImg ? (
            <img
              src={target.inlineUrl}
              alt={target.fileName}
              className="max-w-full max-h-[75dvh] object-contain rounded-xl shadow-md bg-white"
            />
          ) : isPdf ? (
            <iframe
              src={target.inlineUrl}
              title={target.fileName}
              className="w-full h-[75dvh] rounded-xl border border-slate-300 bg-white"
            />
          ) : (
            <div className="text-center bg-white p-6 rounded-2xl border border-slate-200 max-w-md space-y-3">
              <FileIcon className="w-10 h-10 text-[#004B87] mx-auto" />
              <div className="font-bold text-sm text-slate-900">
                المعاينة المباشرة غير متاحة لهذه الصيغة داخل المتصفح
              </div>
              <p className="text-xs text-slate-600">
                يمكنك تحميل المستند مباشرة على جهازك لفتحه بالتطبيق المناسب.
              </p>
              {target.downloadUrl && (
                <a
                  href={target.downloadUrl}
                  download={target.fileName}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#004B87] hover:bg-[#00386B] text-white text-xs font-bold rounded-xl transition-colors"
                >
                  <Download className="w-4 h-4" />
                  تحميل المستند ({target.fileName})
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

interface PendingAttachmentsPickerProps {
  files: QueuedAttachmentFile[];
  onChange: React.Dispatch<React.SetStateAction<QueuedAttachmentFile[]>>;
  disabled?: boolean;
}

export const PendingAttachmentsPicker: React.FC<PendingAttachmentsPickerProps> = ({
  files,
  onChange,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  const handleFilesSelected = (selectedList: FileList | null) => {
    if (!selectedList || selectedList.length === 0) return;
    setLocalError(null);

    const incoming = Array.from(selectedList);
    const accepted: QueuedAttachmentFile[] = [];

    for (const file of incoming) {
      if (files.length + accepted.length >= MAX_ATTACHMENTS_PER_CASE) {
        setLocalError(`الحد الأقصى للمرفقات هو ${MAX_ATTACHMENTS_PER_CASE} مستندات.`);
        break;
      }
      const err = validateAttachmentFile(file);
      if (err) {
        setLocalError(err);
        continue;
      }
      const alreadyAdded = files.some(
        (f) => f.file.name === file.name && f.file.size === file.size
      );
      if (alreadyAdded) continue;

      const canPreview = isPreviewableImage(file.type, file.name) || isPreviewablePdf(file.type, file.name);
      accepted.push({
        localId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: canPreview ? URL.createObjectURL(file) : undefined,
      });
    }

    if (accepted.length > 0) {
      onChange((prev) => [...prev, ...accepted]);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = (localId: string) => {
    onChange((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  };

  return (
    <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
            <Paperclip className="w-4 h-4 text-[#00A651]" />
            6. المستندات والمرفقات (اختياري)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            يمكنك إرفاق صور الشاشات، مستندات PDF، أو ملفات Word / Excel (بحد أقصى 10 ميجابايت للملف الواحد).
          </p>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT_ATTR}
            disabled={disabled}
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="px-3.5 py-2 bg-[#004B87] hover:bg-[#00386B] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>اختيار مستندات للإرفاق</span>
          </button>
        </div>
      </div>

      {localError && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] font-bold flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
          <span>{localError}</span>
        </div>
      )}

      {files.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((item) => (
            <div
              key={item.localId}
              className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(item.file.type, item.file.name)}
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-xs truncate">{item.file.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {formatFileSizeArabic(item.file.size)} · جاهز للرفع عند الحفظ
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {item.previewUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewTarget({
                        fileName: item.file.name,
                        mimeType: item.file.type,
                        sizeBytes: item.file.size,
                        inlineUrl: item.previewUrl!,
                        subtitle: 'معاينة قبل حفظ الحالة',
                      })
                    }
                    className="p-1.5 text-[#004B87] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="معاينة المستند"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemove(item.localId)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  title="إزالة المستند"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          className="border border-dashed border-slate-300 bg-white/70 hover:bg-white rounded-xl py-3 px-4 text-center text-[11px] text-slate-500 cursor-pointer transition-colors"
        >
          لا توجد مستندات مرفقة حتى الآن — اضغط لاختيار ملفات (PDF، صور، Word، Excel)
        </div>
      )}

      <CaseAttachmentPreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
};

interface ReplyAttachmentTriggerProps {
  stage: CaseAttachmentStage;
  canUpload: boolean;
  isUploading: boolean;
  onFilesSelected: (files: File[], stage: CaseAttachmentStage) => void;
  variant?: 'emerald' | 'blue';
}

export const ReplyAttachmentTrigger: React.FC<ReplyAttachmentTriggerProps> = ({
  stage,
  canUpload,
  isUploading,
  onFilesSelected,
  variant = 'emerald',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!canUpload) return null;

  const btnClasses =
    variant === 'blue'
      ? 'text-blue-800 bg-blue-100 hover:bg-blue-200 border border-blue-300'
      : 'text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT_ATTR}
        disabled={isUploading}
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : [];
          if (list.length > 0) onFilesSelected(list, stage);
          if (inputRef.current) inputRef.current.value = '';
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer ${btnClasses}`}
      >
        {isUploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Paperclip className="w-3.5 h-3.5" />
        )}
        <span>{isUploading ? 'جارٍ الرفع...' : 'إرفاق مستند مع الرد'}</span>
      </button>
    </>
  );
};

interface CaseAttachmentsManagerProps {
  attachments: CaseAttachment[];
  canEdit: boolean;
  isUploading: boolean;
  defaultUploadStage: CaseAttachmentStage;
  onUploadFiles: (files: File[], stage: CaseAttachmentStage) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
}

export const CaseAttachmentsManager: React.FC<CaseAttachmentsManagerProps> = ({
  attachments,
  canEdit,
  isUploading,
  defaultUploadStage,
  onUploadFiles,
  onDeleteAttachment,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConfirmDelete = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    try {
      await onDeleteAttachment(attachmentId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-[#004B87]" />
          <span className="font-bold text-slate-900">المستندات والمرفقات ({attachments.length})</span>
        </div>

        {canEdit && (
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT_ATTR}
              disabled={isUploading}
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                if (list.length > 0) void onUploadFiles(list, defaultUploadStage);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 bg-[#004B87] hover:bg-[#00386B] text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{isUploading ? 'جارٍ رفع المستندات...' : 'إرفاق مستندات إضافية'}</span>
            </button>
          </div>
        )}
      </div>

      {attachments.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-3 text-center text-slate-500 text-xs">
          لا توجد مستندات مرفقة بهذه الحالة حتى الآن.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {attachments.map((att) => {
            const inlineUrl = getAttachmentInlineUrl(att);
            const downloadUrl = getAttachmentDownloadUrl(att);
            const stageLabel = getAttachmentStageLabel(att.stage);
            const isConfirming = confirmDeleteId === att.id;
            const isDeleting = deletingId === att.id;

            return (
              <div
                key={att.id}
                className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="mt-0.5">{getFileIcon(att.mimeType, att.fileName)}</div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs truncate" title={att.fileName}>
                      {att.fileName}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getStageBadgeStyle(
                          att.stage
                        )}`}
                      >
                        {stageLabel}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatFileSizeArabic(att.sizeBytes)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      بواسطة: {att.uploadedByName} ·{' '}
                      {new Date(att.uploadedAt).toLocaleString('ar-EG')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewTarget({
                        fileName: att.fileName,
                        mimeType: att.mimeType,
                        sizeBytes: att.sizeBytes,
                        inlineUrl,
                        downloadUrl,
                        subtitle: `${stageLabel} · ${att.uploadedByName}`,
                      })
                    }
                    className="p-1.5 text-[#004B87] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="معاينة"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={downloadUrl}
                    download={att.fileName}
                    className="p-1.5 text-[#00A651] hover:bg-emerald-50 rounded-lg transition-colors"
                    title="تحميل المستند"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>

                  {canEdit &&
                    (isConfirming ? (
                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-1.5 py-0.5">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void handleConfirmDelete(att.id)}
                          className="text-[10px] font-bold text-rose-700 hover:text-rose-900 flex items-center gap-0.5 cursor-pointer"
                          title="تأكيد الحذف"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>تأكيد</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(att.id)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="حذف المرفق"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CaseAttachmentPreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
};
