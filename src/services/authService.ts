/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getUserByUsername } from './userService';
import { verifyPassword } from '../utils/crypto';
import { User } from '../types';
import { logAuditEvent } from './auditService';

export interface LoginResult {
  success: boolean;
  user?: User;
  errorMessage?: string;
}

export type LoginPortalSection = 'agents' | 'management_tech' | 'admin';

export async function loginWithCredentials(
  username: string,
  password: string,
  activeSection?: LoginPortalSection
): Promise<LoginResult> {
  const cleanUsername = username.trim();
  const cleanPassword = password.trim();

  if (!cleanUsername || !cleanPassword) {
    return { success: false, errorMessage: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
  }

  const user = await getUserByUsername(cleanUsername);

  if (!user) {
    // Record failed login in audit without exposing user existence
    await logAuditEvent({
      userId: 'anonymous',
      username: cleanUsername,
      fullName: 'محاولة تسجيل دخول غير مسجلة',
      role: 'agent',
      action: 'فشل تسجيل الدخول',
      details: 'اسم المستخدم غير مسجل بالنظام',
    });
    return { success: false, errorMessage: 'بيانات تسجيل الدخول غير صحيحة، يرجى التحقق وإعادة المحاولة.' };
  }

  if (user.status === 'disabled') {
    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'محاولة دخول بحساب معطل',
      details: 'تم حجب تسجيل الدخول لأن الحساب معطل إدارياً',
    });
    return { success: false, errorMessage: 'هذا الحساب معطل حالياً من قِبل إدارة النظام. يرجى مراجعة المسؤول.' };
  }

  // Strict portal verification per user request:
  // - Agents can ONLY log in via agents portal
  // - Management & Technical Support can ONLY log in via management_tech portal
  // - Super Admin can ONLY log in via admin portal
  if (activeSection) {
    if (activeSection === 'agents' && user.role !== 'agent') {
      const properPortal =
        user.role === 'super_admin'
          ? 'بوابة مدير البرنامج'
          : 'بوابة الإدارة والدعم التقني';
      await logAuditEvent({
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        action: 'رفض تسجيل دخول - بوابة غير مصرح بها',
        details: `محاولة دخول من بوابة وكلاء الاتصال بينما حساب المستخدم يتبع (${properPortal})`,
      });
      return {
        success: false,
        errorMessage: `غير مصرح لهذا الحساب بالدخول من بوابة وكلاء الاتصال. يرجى التوجه إلى (${properPortal}).`,
      };
    }

    if (
      activeSection === 'management_tech' &&
      user.role !== 'management' &&
      user.role !== 'technical_support'
    ) {
      const properPortal =
        user.role === 'super_admin'
          ? 'بوابة مدير البرنامج'
          : 'بوابة وكلاء الاتصال';
      await logAuditEvent({
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        action: 'رفض تسجيل دخول - بوابة غير مصرح بها',
        details: `محاولة دخول من بوابة الإدارة والدعم التقني بينما حساب المستخدم يتبع (${properPortal})`,
      });
      return {
        success: false,
        errorMessage: `غير مصرح لهذا الحساب بالدخول من بوابة الإدارة والدعم التقني. يرجى التوجه إلى (${properPortal}).`,
      };
    }

    if (activeSection === 'admin' && user.role !== 'super_admin') {
      const properPortal =
        user.role === 'agent'
          ? 'بوابة وكلاء الاتصال'
          : 'بوابة الإدارة والدعم التقني';
      await logAuditEvent({
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        action: 'رفض تسجيل دخول - بوابة غير مصرح بها',
        details: `محاولة دخول من بوابة مدير البرنامج بينما حساب المستخدم يتبع (${properPortal})`,
      });
      return {
        success: false,
        errorMessage: `غير مصرح لهذا الحساب بالدخول من بوابة مدير البرنامج. يرجى التوجه إلى (${properPortal}).`,
      };
    }
  }

  const isValid = await verifyPassword(cleanPassword, user.passwordHash, user.salt);

  if (!isValid) {
    await logAuditEvent({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      action: 'فشل تسجيل الدخول',
      details: 'كلمة مرور غير متطابقة',
    });
    return { success: false, errorMessage: 'بيانات تسجيل الدخول غير صحيحة، يرجى التحقق وإعادة المحاولة.' };
  }

  // Successful login
  await logAuditEvent({
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    action: 'تسجيل دخول ناجح',
    details: `تم تسجيل الدخول بنجاح - CRM: ${user.crmUser}`,
  });

  return { success: true, user };
}
