/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'super_admin' | 'agent' | 'management' | 'technical_support';

export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  username: string; // National ID or username code
  fullName: string;
  role: UserRole;
  crmUser: string;
  passwordHash: string;
  salt: string;
  status: UserStatus;
  jobTitle?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  isOnline?: boolean;
  lastActiveAt?: string;
}

export type CallType = 'طلب' | 'استفسار' | 'شكوى' | 'رسائل SMS';

export type TaxType = 'ضرائب دخل' | 'ضرائب قيمة مضافة';

export type ContactChannel = 'اتصال هاتفي' | 'بريد إلكتروني';

export type CallerClassification = 'شخص طبيعي' | 'شخص اعتباري' | '';

export type CallerTitle =
  | 'أستاذ'
  | 'أستاذة'
  | 'محاسب'
  | 'شريك'
  | 'مدير مالي'
  | 'صاحب الشأن'
  | 'صاحب شركة'
  | 'مهن حرة'
  | '';

export type CaseStatus =
  | 'جديدة'
  | 'مفتوحة'
  | 'قيد المعالجة'
  | 'محولة للإدارة'
  | 'محولة للدعم التقني'
  | 'محولة للدعم الفني'
  | 'محولة لوكيل الاتصال'
  | 'قيد الانتظار'
  | 'مغلقة';

export type CasePriority = 'عادي' | 'هام' | 'عاجل';

export interface Taxpayer {
  id: string; // 9-digit tax registration number
  taxRegistrationNumber: string; // 9 digits strictly
  name: string;
  taxType?: TaxType;
  city?: string;
  activity?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Caller {
  id: string;
  name: string; // 3-part Arabic name
  title: CallerTitle;
  classification: CallerClassification;
  taxRegistrationNumber: string; // 9 digits
  nationalId?: string; // Optional 14-digit Egyptian National ID
  primaryPhone: string;
  secondaryPhone?: string;
  emailAvailability: 'متوفر' | 'غير متوفر';
  email?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export type CaseAttachmentStage = 'create' | 'agent_reply' | 'management_reply';

export interface CaseAttachment {
  id: string;
  fileName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  stage: CaseAttachmentStage;
  uploadedById: string;
  uploadedByName: string;
  uploadedByRole: UserRole;
  uploadedAt: string;
}

export interface Case {
  id: string; // Firestore document ID
  caseId: string; // CRM-000001
  callType: CallType;
  taxType: TaxType;
  serviceType: string;
  channel: ContactChannel;
  title: string; // Normalized Arabic title
  rawTitle?: string; // Original input before normalization
  taxRegistrationNumber: string; // 9 digits
  taxpayerName: string;
  callerId?: string;
  callerName: string;
  callerNationalId?: string; // Optional 14-digit Egyptian National ID
  callerPhone: string;
  callerSecondaryPhone?: string;
  callerTitle?: CallerTitle;
  callerClassification?: CallerClassification;
  callerEmail?: string;
  callerDescription?: string;
  status: CaseStatus;
  priority: CasePriority;
  agentNotes?: string;
  agentReply?: string;
  agentEmployeeName?: string;
  managementReply?: string;
  managementEmployeeName?: string;
  attachments?: CaseAttachment[];
  assignedTo?: string; // userId or username
  assignedToName?: string;
  assignedToRole?: UserRole;
  assignedBy?: string;
  assignedByName?: string;
  closeReason?: string;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  createdById: string;
  createdByName: string;
  createdByCrmUser: string;
  createdByRole: UserRole;
  updatedById?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface TimelineEvent {
  id?: string;
  caseId: string;
  action: string;
  previousStatus?: CaseStatus;
  newStatus?: CaseStatus;
  notes?: string;
  userId: string;
  userName: string;
  userCrmUser: string;
  userRole: UserRole;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  recipientUsername: string;
  recipientName?: string;
  recipientRole?: UserRole;
  caseId: string;
  title: string;
  message: string;
  isRead: boolean;
  type: 'transfer' | 'assign' | 'response' | 'close' | 'reopen' | 'admin_notice' | 'overdue_alert';
  senderName?: string;
  senderUsername?: string;
  senderRole?: UserRole;
  batchId?: string;
  requiresAcknowledgment?: boolean;
  acknowledged?: boolean;
  acknowledgedAt?: string;
  acknowledgedByName?: string;
  createdAt: string;
}

export interface AuditLogItem {
  id?: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  action: string;
  recordId?: string;
  device?: string;
  details?: string;
  createdAt: string;
}

export interface SystemSettings {
  sessionTimeoutMinutes: number;
  allowDuplicateCases: boolean;
  autoAssignEnabled: boolean;
  systemNotice: string;
  slaHoursNormal: number;
  slaHoursUrgent: number;
  updatedAt?: string;
}

export type BackupFrequency = 'daily' | 'weekly' | 'monthly' | 'interval_hours';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  timeOfDay: string; // "HH:mm"
  dayOfWeek?: number; // 0 (Sun) - 6 (Sat)
  dayOfMonth?: number; // 1 - 28
  intervalHours?: number; // 1, 3, 6, 12, 24
  autoDownloadJson?: boolean;
  maxRetentionCount?: number;
  lastRunAt?: string;
  lastRunKey?: string;
  lastBackupId?: string;
  lastBackupName?: string;
  nextScheduledAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DatabaseBackup {
  id: string;
  backupName: string;
  createdAt: string;
  createdBy: string;
  triggerType?: 'manual' | 'automatic';
  recordsCount: number;
  casesCount: number;
  usersCount: number;
  taxpayersCount: number;
  dataSnapshot: string; // JSON serialized
}

export interface ImportReport {
  totalRows: number;
  newRecords: number;
  updatedRecords: number;
  duplicates: number;
  errorRecords: number;
  errorDetails: string[];
}

export interface TeamChatReadReceipt {
  username: string;
  fullName: string;
  readAt: string;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface TeamChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  senderName: string;
  senderRole: UserRole;
  recipientId?: string;
  recipientUsername?: string;
  recipientName?: string;
  targetUsername?: string;
  targetName?: string;
  message: string;
  attachments?: ChatAttachment[];
  urgency?: 'normal' | 'urgent';
  caseId?: string;
  replyToId?: string;
  replyToSenderName?: string;
  replyToSenderUsername?: string;
  replyToMessage?: string;
  mentions?: string[];
  readByUsernames?: string[];
  readByDetails?: TeamChatReadReceipt[];
  createdAt: string;
}

export interface TeamChatControl {
  isPaused: boolean;
  pausedUntil?: string | null;
  pauseReason?: string;
  pausedBy?: string;
  pausedByName?: string;
  pausedAt?: string;
  updatedAt?: string;
}


