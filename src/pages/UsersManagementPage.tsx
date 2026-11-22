/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus,
  Search,
  Upload,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Shield,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { User, UserRole } from '../types';
import {
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  parseUsersCSV,
  bulkImportUsers,
  normalizeInputId,
  normalizeFullName,
  normalizeCrmCode,
  normalizeUserRole,
  deduplicateUsers,
  cleanupDuplicateUsers,
} from '../services/userService';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface UsersManagementPageProps {
  users: User[];
  currentUser: User;
  onRefreshUsers: () => void;
}

const isUnifiedManagementRole = (role: UserRole) =>
  role === 'management' || role === 'technical_support';

export const UsersManagementPage: React.FC<UsersManagementPageProps> = ({
  users,
  currentUser,
  onRefreshUsers,
}) => {
  const { isRtl } = useThemeLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // New user modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newCrmUser, setNewCrmUser] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('agent');
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Edit user modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editCrmUser, setEditCrmUser] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('agent');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation modal
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // CSV Import state
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    imported?: number;
    skipped?: number;
    errors?: string[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Status message
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createdUserBanner, setCreatedUserBanner] = useState<{
    fullName: string;
    username: string;
    crmUser: string;
    portalName: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Ensure displayed list is strictly deduplicated
  const uniqueUsers = useMemo(() => deduplicateUsers(users), [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return uniqueUsers.filter((u) => {
      if (roleFilter === 'management_tech') {
        if (!isUnifiedManagementRole(u.role)) return false;
      } else if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.crmUser.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [uniqueUsers, roleFilter, searchTerm]);

  // Client-side duplicate check helper
  const checkLocalDuplicate = (
    params: { username: string; crmUser: string; fullName: string },
    excludeId?: string
  ): string | null => {
    const targetUname = normalizeInputId(params.username).toLowerCase();
    const targetCrm = normalizeCrmCode(params.crmUser);
    const targetName = normalizeFullName(params.fullName);

    for (const u of uniqueUsers) {
      if (excludeId && u.id === excludeId) continue;
      if (targetUname && normalizeInputId(u.username).toLowerCase() === targetUname) {
        return `اسم المستخدم / الرقم القومي "${params.username.trim()}" مسجل مسبقاً للموظف (${u.fullName}) ولا يمكن تكراره.`;
      }
      if (targetCrm && normalizeCrmCode(u.crmUser) === targetCrm) {
        return `كود CRM "${params.crmUser.trim()}" مستخدم بالفعل للموظف (${u.fullName}) ولا يمكن تكراره.`;
      }
      if (targetName && normalizeFullName(u.fullName) === targetName) {
        return `الاسم "${params.fullName.trim()}" مسجل مسبقاً في قاعدة البيانات ولا يمكن تكراره.`;
      }
    }
    return null;
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddModalError(null);
    setErrorMessage(null);

    if (!newFullName.trim() || !newCrmUser.trim() || !newUsername.trim() || !newPassword.trim()) {
      setAddModalError('جميع الحقول إجبارية لإضافة مستخدم جديد.');
      return;
    }

    const dupMsg = checkLocalDuplicate({
      username: newUsername,
      crmUser: newCrmUser,
      fullName: newFullName,
    });
    if (dupMsg) {
      setAddModalError(dupMsg);
      return;
    }

    setIsAdding(true);
    try {
      const created = await createUser(
        {
          fullName: newFullName.trim(),
          crmUser: newCrmUser.trim(),
          username: newUsername.trim(),
          role: normalizeUserRole(newRole),
          password: newPassword.trim(),
        },
        currentUser
      );

      const portalName =
        created.role === 'super_admin'
          ? 'بوابة مدير البرنامج'
          : created.role === 'management' || created.role === 'technical_support'
          ? 'بوابة الإدارة والدعم التقني'
          : 'بوابة وكلاء الاتصال';

      setCreatedUserBanner({
        fullName: created.fullName,
        username: created.username,
        crmUser: created.crmUser,
        portalName,
      });

      setIsAddModalOpen(false);
      setNewFullName('');
      setNewCrmUser('');
      setNewUsername('');
      setNewPassword('');
      setShowNewPassword(false);
      setNewRole('agent');
      setActionMessage(`تمت إضافة وحفظ المستخدم "${created.fullName}" بنجاح في قاعدة البيانات وأصبح جاهزاً لتسجيل الدخول والعمل فوراً.`);
      onRefreshUsers();
    } catch (err: any) {
      setAddModalError(err.message || 'حدث خطأ أثناء إضافة المستخدم');
    } finally {
      setIsAdding(false);
    }
  };

  // Open Edit User
  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditCrmUser(user.crmUser);
    setEditUsername(user.username);
    setEditRole(normalizeUserRole(user.role));
    setEditNewPassword('');
    setEditModalError(null);
  };

  // Save Edit User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditModalError(null);
    setErrorMessage(null);

    if (!editFullName.trim() || !editCrmUser.trim() || !editUsername.trim()) {
      setEditModalError('الاسم وكود CRM واسم المستخدم حقول إجبارية.');
      return;
    }

    const dupMsg = checkLocalDuplicate(
      {
        username: editUsername,
        crmUser: editCrmUser,
        fullName: editFullName,
      },
      editingUser.id
    );
    if (dupMsg) {
      setEditModalError(dupMsg);
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateUser(
        editingUser.id,
        {
          fullName: editFullName.trim(),
          crmUser: editCrmUser.trim(),
          username: editUsername.trim(),
          role: normalizeUserRole(editRole),
        },
        currentUser
      );

      if (editNewPassword.trim()) {
        await resetUserPassword(editingUser.id, editNewPassword.trim(), currentUser);
      }

      setEditingUser(null);
      setActionMessage('تم تحديث بيانات المستخدم بنجاح.');
      onRefreshUsers();
    } catch (err: any) {
      setEditModalError(err.message || 'حدث خطأ أثناء تعديل المستخدم');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Confirm Delete User
  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await deleteUser(deletingUser.id, currentUser);
      setActionMessage(`تم حذف حساب "${deletingUser.fullName}" بنجاح.`);
      setDeletingUser(null);
      onRefreshUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء حذف الحساب');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle user status
  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await updateUser(user.id, { status: newStatus }, currentUser);
      setActionMessage(
        newStatus === 'active'
          ? `تم تفعيل حساب ${user.fullName}`
          : `تم تعطيل حساب ${user.fullName} بنجاح`
      );
      onRefreshUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تغيير حالة الحساب');
    }
  };

  // Cleanup any duplicate records in database manually if triggered
  const handleCleanupDuplicates = async () => {
    try {
      const removedCount = await cleanupDuplicateUsers();
      onRefreshUsers();
      setActionMessage(
        removedCount > 0
          ? `تم فحص قاعدة البيانات وإزالة ${removedCount} سجل مكرر بنجاح.`
          : 'قاعدة بيانات المستخدمين نظيفة تماماً ولا توجد أي حسابات مكررة.'
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر فحص التكرارات');
    }
  };

  // CSV Import File Handler
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const parsedRows = parseUsersCSV(text);
      const result = await bulkImportUsers(parsedRows);
      setImportStatus({
        success: true,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
      });
      onRefreshUsers();
    } catch (err: any) {
      setImportStatus({
        success: false,
        errors: [err.message || 'فشل استيراد الملف'],
      });
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const getRoleBadge = (role: UserRole) => {
    if (role === 'super_admin') {
      return { label: 'مدير النظام', cls: 'bg-amber-600 text-white' };
    }
    if (isUnifiedManagementRole(role)) {
      return { label: 'الإدارة والدعم التقني', cls: 'bg-[#004B87] text-white' };
    }
    return { label: 'وكيل اتصال', cls: 'bg-[#00A651] text-white' };
  };

  return (
    <div className="space-y-4 text-start animate-fade-up">
      {/* Header */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-5 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs mb-1">
            <Shield className="w-4 h-4" />
            <span>لوحة إدارة المستخدمين والتحكم بالأدوار (Admin Portal)</span>
          </div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">
            إدارة حسابات موظفي ووكلاء مركز الاتصال المتكامل
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-600 dark:text-slate-300">
            <span>
              إجمالي الحسابات المسجلة:{' '}
              <span className="font-bold text-[#004B87] dark:text-[#00E676] font-mono tabular-nums">
                {uniqueUsers.length}
              </span>{' '}
              مستخدم
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00A651] dark:text-[#00E676]">
              <ShieldCheck className="w-3.5 h-3.5" />
              منع التكرار مفعّل
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCleanupDuplicates}
            className="px-3 py-2 bg-slate-100 dark:bg-[#071629] hover:bg-[#EBF4FC] dark:hover:bg-[#00386B] text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-slate-200 dark:border-[#004B87] transition-colors"
            title="فحص وإزالة أي سجلات مكررة في قاعدة البيانات"
          >
            <ShieldCheck className="w-4 h-4 text-[#004B87] dark:text-sky-300" />
            <span>فحص ومنع التكرار</span>
          </button>

          {/* CSV Import */}
          <label className="px-3 py-2 bg-slate-100 dark:bg-[#071629] hover:bg-[#EBF4FC] dark:hover:bg-[#00386B] text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer border border-slate-200 dark:border-[#004B87] transition-colors">
            <Upload className="w-4 h-4 text-[#00A651]" />
            <span>{isImporting ? 'جارٍ الاستيراد...' : 'استيراد مستخدمين (CSV)'}</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              disabled={isImporting}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setAddModalError(null);
              setIsAddModalOpen(true);
            }}
            className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ مستخدم جديد</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {actionMessage && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-200 space-y-2 animate-scale-in">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{actionMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActionMessage(null);
                setCreatedUserBanner(null);
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {createdUserBanner && (
            <div className="bg-white/90 dark:bg-[#071629] border border-emerald-200 dark:border-[#004B87] rounded-xl p-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              <span>الاسم: <strong className="text-slate-900 dark:text-white">{createdUserBanner.fullName}</strong></span>
              <span>اسم المستخدم للدخول: <strong className="font-mono text-[#004B87] dark:text-[#00E676]">{createdUserBanner.username}</strong></span>
              <span>كود CRM: <strong className="font-mono text-[#00A651]">{createdUserBanner.crmUser}</strong></span>
              <span>بوابة الدخول المطلوبة: <strong className="text-amber-700 dark:text-amber-300">{createdUserBanner.portalName}</strong></span>
            </div>
          )}
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2 animate-scale-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CSV Import Report Box */}
      {importStatus && (
        <div
          className={`p-4 rounded-2xl border text-xs ${
            importStatus.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-950 dark:text-rose-100'
          }`}
        >
          <div className="font-bold flex items-center gap-2 mb-1">
            {importStatus.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-[#00E676]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            )}
            <span>تقرير استيراد ملف المستخدمين:</span>
          </div>
          <div>تم استيراد وحفظ: <span className="font-mono font-bold">{importStatus.imported || 0}</span> مستخدم جديد</div>
          <div>تم تخطي (مسجل مسبقاً / مكرر): <span className="font-mono font-bold">{importStatus.skipped || 0}</span> مستخدم</div>
          {importStatus.errors && importStatus.errors.length > 0 && (
            <div className="mt-2 text-rose-700 dark:text-rose-300">
              <span className="font-bold">أخطاء التنسيق:</span>
              <ul className="list-disc list-inside text-[11px] mt-1">
                {importStatus.errors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم، اسم المستخدم، أو كود CRM..."
              className="w-full p-2 pl-8 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="p-2 bg-slate-50 dark:bg-[#071629] border border-slate-200 dark:border-[#00386B] text-slate-900 dark:text-white rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#004B87] dark:focus:ring-[#00A651] focus:outline-none"
          >
            <option value="all">كافة الأدوار</option>
            <option value="agent">وكيل اتصال</option>
            <option value="management_tech">الإدارة والدعم التقني</option>
            <option value="super_admin">مدير النظام</option>
          </select>
        </div>

        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
          المستخدمين المعروضين: <span className="font-bold font-mono tabular-nums text-[#004B87] dark:text-[#00E676]">{filteredUsers.length}</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white/95 dark:bg-[#0B1D35]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-[#00386B] shadow-saas overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-start text-xs min-w-[750px]">
            <thead className="bg-[#00264D] text-white border-b border-[#004B87] text-[11px]">
              <tr>
                <th className="p-3">الاسم بالكامل</th>
                <th className="p-3">كود CRM</th>
                <th className="p-3">اسم المستخدم (الرقم القومي)</th>
                <th className="p-3">الدور والوظيفة</th>
                <th className="p-3">حالة الحساب</th>
                <th className="p-3">تاريخ الإنشاء</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#00386B]/70">
              {filteredUsers.map((u) => {
                const badge = getRoleBadge(u.role);
                return (
                  <tr key={u.id} className="hover:bg-[#EBF4FC] dark:hover:bg-[#002B54] transition-colors">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{u.fullName}</td>
                    <td className="p-3 font-mono font-semibold text-[#00A651] dark:text-[#00E676]">{u.crmUser}</td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">{u.username}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'active'
                            ? 'bg-[#E6F7EF] text-[#008742] dark:bg-[#00A651]/20 dark:text-[#00E676]'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                        }`}
                      >
                        {u.status === 'active' ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 bg-slate-100 dark:bg-[#071629] hover:bg-[#004B87] hover:text-white rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
                          title="تعديل المستخدم وتعيين كلمة المرور"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {u.id !== currentUser.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                u.status === 'active'
                                  ? 'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-600 hover:text-white text-amber-600 dark:text-amber-400'
                                  : 'bg-[#E6F7EF] dark:bg-[#00A651]/20 hover:bg-[#00A651] hover:text-white text-[#008742] dark:text-[#00E676]'
                              }`}
                              title={u.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              {u.status === 'active' ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingUser(u)}
                              className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 transition-colors"
                              title="حذف الحساب نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    لا يوجد مستخدمين مطابقين لمعايير البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => setIsAddModalOpen(false)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl max-w-md w-full my-auto max-h-[92dvh] shadow-2xl border border-slate-200 dark:border-[#004B87] text-start overflow-hidden flex flex-col animate-scale-in"
            >
              <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
                <h3 className="font-black text-sm flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#00E676]" />
                  <span>إضافة مستخدم جديد للنظام</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-xl bg-[#003366] hover:bg-[#004B87] text-slate-200 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleCreateUser}
                className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3 text-xs"
              >
                {addModalError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>{addModalError}</span>
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    الاسم بالكامل *
                  </label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="مثال: أحمد محمد علي"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    كود CRM User *
                  </label>
                  <input
                    type="text"
                    value={newCrmUser}
                    onChange={(e) => setNewCrmUser(e.target.value)}
                    placeholder="مثال: ETA_Ahmed_1"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    اسم المستخدم (الرقم القومي) *
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="مثال: 29801011234567"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none tabular-nums"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    الدور والوظيفة *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                  >
                    <option value="agent">وكيل اتصال (Agent)</option>
                    <option value="management">الإدارة والدعم التقني</option>
                    <option value="super_admin">مدير عام النظام (Super Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    كلمة المرور *
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="كلمة مرور لا تقل عن 4 أحرف"
                      className="w-full p-2.5 pl-10 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      title={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-[#00386B]">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629] rounded-xl font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white font-black rounded-xl shadow-xs disabled:opacity-50"
                  >
                    {isAdding ? 'جارٍ الحفظ...' : 'حفظ المستخدم'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Edit User Modal */}
      {editingUser &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => setEditingUser(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001429]/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl max-w-md w-full my-auto max-h-[92dvh] shadow-2xl border border-slate-200 dark:border-[#004B87] text-start overflow-hidden flex flex-col animate-scale-in"
            >
              <div className="bg-[#00264D] p-4 text-white flex items-center justify-between border-b border-[#004B87] shrink-0">
                <h3 className="font-black text-sm flex items-center gap-2 min-w-0">
                  <Edit2 className="w-4 h-4 text-[#00E676] shrink-0" />
                  <span className="truncate">تعديل بيانات المستخدم ({editingUser.fullName})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="p-1.5 rounded-xl bg-[#003366] hover:bg-[#004B87] text-slate-200 hover:text-white shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleSaveEdit}
                className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3 text-xs"
              >
                {editModalError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>{editModalError}</span>
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    الاسم بالكامل
                  </label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    كود CRM User
                  </label>
                  <input
                    type="text"
                    value={editCrmUser}
                    onChange={(e) => setEditCrmUser(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    اسم المستخدم (الرقم القومي)
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none tabular-nums"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    الدور والوظيفة
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                  >
                    <option value="agent">وكيل اتصال (Agent)</option>
                    <option value="management">الإدارة والدعم التقني</option>
                    <option value="super_admin">مدير عام النظام (Super Admin)</option>
                  </select>
                </div>

                <div className="border-t border-slate-200 dark:border-[#00386B] pt-2">
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    تعيين كلمة مرور جديدة (اتركها فارغة إذا كنت لا تريد التغيير):
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editNewPassword}
                      onChange={(e) => setEditNewPassword(e.target.value)}
                      placeholder="كلمة مرور جديدة..."
                      className="w-full p-2.5 pl-10 bg-slate-50 dark:bg-[#071629] border border-slate-300 dark:border-[#00386B] rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-[#00A651] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword((prev) => !prev)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      title={showEditPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-[#00386B]">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071629] rounded-xl font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-4 py-2 bg-[#004B87] hover:bg-[#00386B] text-white font-black rounded-xl shadow-xs disabled:opacity-50"
                  >
                    {isSavingEdit ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Delete User Confirmation Modal */}
      {deletingUser &&
        createPortal(
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => !isDeleting && setDeletingUser(null)}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#001429]/80 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#0B1D35] rounded-2xl max-w-md w-full my-auto max-h-[90dvh] shadow-2xl border border-rose-200 dark:border-rose-800 text-start overflow-hidden flex flex-col animate-scale-in"
            >
              <div className="bg-rose-600 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-black text-sm">تأكيد حذف حساب المستخدم</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingUser(null)}
                  className="p-1 rounded-lg hover:bg-rose-700 text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <p className="text-slate-700 dark:text-slate-200 font-semibold leading-relaxed">
                  هل أنت متأكد من حذف حساب المستخدم «{deletingUser.fullName}» ({deletingUser.crmUser}) نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
                </p>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#00386B]">
                  <button
                    type="button"
                    onClick={() => setDeletingUser(null)}
                    disabled={isDeleting}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#071629] text-slate-700 dark:text-slate-200 font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteUser}
                    disabled={isDeleting}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isDeleting ? 'جارٍ الحذف...' : 'تأكيد الحذف'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
