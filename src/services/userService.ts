/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch
} from '../lib/sheetsDb';
import { db, handleDatabaseError, OperationType } from '../config/sheetsConfig';
import { User, UserRole, ImportReport } from '../types';
import { INITIAL_USERS_DATA } from '../data/initialUsers';
import { hashPassword, generateSalt } from '../utils/crypto';
import { logAuditEvent } from './auditService';

const USERS_COLLECTION = 'users';

let initUsersPromise: Promise<{ count: number; initialized: boolean }> | null = null;

/**
 * Normalizes user input: converts Eastern Arabic digits to standard digits and strips whitespace
 */
export function normalizeInputId(input: string): string {
  if (!input) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return input
    .trim()
    .replace(/[٠-٩]/g, (d) => arabicDigits.indexOf(d).toString())
    .replace(/\s+/g, '');
}

export function normalizeFullName(name: string): string {
  if (!name) return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeCrmCode(crm: string): string {
  if (!crm) return '';
  return crm.trim().toLowerCase();
}

export function sanitizeUserDocId(username: string): string {
  const cleaned = normalizeInputId(username)
    .replace(/\//g, '_')
    .replace(/\s+/g, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return `u_${Date.now()}`;
  }
  return cleaned;
}

/**
 * Unifies management & technical_support into a single canonical role ('management')
 */
export function normalizeUserRole(role: UserRole): UserRole {
  if (role === 'technical_support') return 'management';
  return role;
}

export function getRoleDefaultJobTitle(role: UserRole): string {
  const canonical = normalizeUserRole(role);
  if (canonical === 'super_admin') return 'مدير عام النظام';
  if (canonical === 'management') return 'ادارة ودعم تقني';
  return 'وكيل الاتصال';
}

export async function updateUserPresence(userId: string, isOnline: boolean): Promise<void> {
  if (!userId) return;
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      isOnline,
      lastActiveAt: new Date().toISOString(),
      ...(isOnline ? { lastLoginAt: new Date().toISOString() } : {}),
    });
  } catch {
    // Non-blocking presence update
  }
}

export function isUserOnline(user?: Pick<User, 'isOnline' | 'lastActiveAt'> | null, nowMs = Date.now()): boolean {
  if (!user || !user.isOnline) return false;
  if (!user.lastActiveAt) return false;
  const activeMs = new Date(user.lastActiveAt).getTime();
  if (Number.isNaN(activeMs)) return false;
  return nowMs - activeMs <= 120_000;
}

/**
 * Deduplicates users list by normalized username & crmUser to prevent duplicate rows in UI
 */
export function deduplicateUsers(users: User[]): User[] {
  const seenUsernames = new Set<string>();
  const seenCrm = new Set<string>();
  const unique: User[] = [];

  for (const u of users) {
    const unameKey = normalizeInputId(u.username || '').toLowerCase();
    const crmKey = normalizeCrmCode(u.crmUser || '');

    if (unameKey && seenUsernames.has(unameKey)) continue;
    if (crmKey && seenCrm.has(crmKey)) continue;

    if (unameKey) seenUsernames.add(unameKey);
    if (crmKey) seenCrm.add(crmKey);
    unique.push(u);
  }

  return unique;
}

/**
 * Removes duplicate user documents in the database (keeps the earliest/active canonical doc)
 */
export async function cleanupDuplicateUsers(): Promise<number> {
  try {
    const snapshot = await getDocs(collection(db, USERS_COLLECTION));
    const seenByUsername = new Map<string, { id: string; user: User }>();
    const seenByCrm = new Map<string, { id: string; user: User }>();
    const toDeleteRefs: ReturnType<typeof doc>[] = [];

    const docsList: { ref: ReturnType<typeof doc>; id: string; user: User }[] = [];
    snapshot.forEach((d) => {
      docsList.push({
        ref: d.ref,
        id: d.id,
        user: { id: d.id, ...(d.data() as Omit<User, 'id'>) },
      });
    });

    // Prefer keeping active & oldest created record
    docsList.sort((a, b) => {
      if (a.user.status === 'active' && b.user.status !== 'active') return -1;
      if (b.user.status === 'active' && a.user.status !== 'active') return 1;
      return (a.user.createdAt || '').localeCompare(b.user.createdAt || '');
    });

    for (const item of docsList) {
      const unameKey = normalizeInputId(item.user.username || '').toLowerCase();
      const crmKey = normalizeCrmCode(item.user.crmUser || '');

      const isDupUsername = unameKey && seenByUsername.has(unameKey);
      const isDupCrm = crmKey && seenByCrm.has(crmKey);

      if (isDupUsername || isDupCrm) {
        toDeleteRefs.push(item.ref);
      } else {
        if (unameKey) seenByUsername.set(unameKey, item);
        if (crmKey) seenByCrm.set(crmKey, item);
      }
    }

    if (toDeleteRefs.length > 0) {
      const batch = writeBatch(db);
      for (const ref of toDeleteRefs) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return toDeleteRefs.length;
  } catch (error) {
    console.warn('Duplicate cleanup check skipped:', error);
    return 0;
  }
}

export async function initializeUsersDatabase(): Promise<{ count: number; initialized: boolean }> {
  if (initUsersPromise) {
    return initUsersPromise;
  }

  initUsersPromise = (async () => {
    try {
      // Remove any existing duplicate docs first
      await cleanupDuplicateUsers();

      const snapshot = await getDocs(collection(db, USERS_COLLECTION));
      const existingUsernames = new Set<string>();
      const existingCrmCodes = new Set<string>();
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.username) existingUsernames.add(normalizeInputId(data.username).toLowerCase());
        if (data.crmUser) existingCrmCodes.add(normalizeCrmCode(data.crmUser));
      });

      const missingUsers = INITIAL_USERS_DATA.filter((u) => {
        const uname = normalizeInputId(u.username).toLowerCase();
        const crm = normalizeCrmCode(u.crmUser);
        return !existingUsernames.has(uname) && !existingCrmCodes.has(crm);
      });

      if (missingUsers.length === 0) {
        return { count: snapshot.size, initialized: false };
      }

      console.log(`Seeding/syncing ${missingUsers.length} users into Sheets DB...`);
      let count = 0;
      const batch = writeBatch(db);

      for (const raw of missingUsers) {
        const cleanUsername = normalizeInputId(raw.username);
        const unameKey = cleanUsername.toLowerCase();
        const crmKey = normalizeCrmCode(raw.crmUser);
        if (existingUsernames.has(unameKey) || existingCrmCodes.has(crmKey)) continue;

        const salt = generateSalt();
        const passwordHash = await hashPassword(raw.initialPassword, salt);
        // Deterministic document ID prevents race-condition duplicates
        const userRef = doc(db, USERS_COLLECTION, cleanUsername);
        const canonicalRole = normalizeUserRole(raw.role);

        const newUser: Omit<User, 'id'> = {
          username: cleanUsername,
          fullName: raw.fullName.trim(),
          role: canonicalRole,
          crmUser: raw.crmUser.trim(),
          jobTitle: raw.jobTitle || getRoleDefaultJobTitle(canonicalRole),
          passwordHash,
          salt,
          status: 'active',
          createdAt: new Date().toISOString(),
        };

        batch.set(userRef, newUser);
        existingUsernames.add(unameKey);
        existingCrmCodes.add(crmKey);
        count++;
      }

      if (count > 0) {
        await batch.commit();
        await logAuditEvent({
          userId: 'system',
          username: 'SYSTEM',
          fullName: 'النظام الآلي',
          role: 'super_admin',
          action: 'تهيئة قاعدة بيانات المستخدمين',
          details: `تمت تهيئة وتسجيل ${count} مستخدم معتمد بدون تكرار بنجاح`,
        });
      }

      return { count, initialized: count > 0 };
    } catch (error) {
      handleDatabaseError(error, OperationType.WRITE, USERS_COLLECTION);
    } finally {
      initUsersPromise = null;
    }
  })();

  return initUsersPromise;
}

export function subscribeToUsers(callback: (users: User[]) => void): () => void {
  const q = collection(db, USERS_COLLECTION);
  return onSnapshot(
    q,
    (snapshot) => {
      const users: User[] = [];
      snapshot.forEach((d) => {
        users.push({ id: d.id, ...(d.data() as Omit<User, 'id'>) });
      });
      users.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
      callback(deduplicateUsers(users));
    },
    (error) => {
      handleDatabaseError(error, OperationType.LIST, USERS_COLLECTION);
    }
  );
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const clean = normalizeInputId(username);
  if (!clean) return null;

  try {
    // 1. Query by 14-digit National ID (username)
    const q = query(
      collection(db, USERS_COLLECTION),
      where('username', '==', clean)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      return { id: firstDoc.id, ...(firstDoc.data() as Omit<User, 'id'>) };
    }

    // 2. Query by crmUser code (exact)
    const q2 = query(
      collection(db, USERS_COLLECTION),
      where('crmUser', '==', clean)
    );
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const firstDoc = snap2.docs[0];
      return { id: firstDoc.id, ...(firstDoc.data() as Omit<User, 'id'>) };
    }

    // 3. Case-insensitive scan across all database users (handles newly created users regardless of casing)
    const cleanLower = clean.toLowerCase();
    const allSnap = await getDocs(collection(db, USERS_COLLECTION));
    for (const d of allSnap.docs) {
      const data = d.data() as Omit<User, 'id'>;
      const uMatch = normalizeInputId(data.username || '').toLowerCase() === cleanLower;
      const crmMatch = normalizeCrmCode(data.crmUser || '') === cleanLower;
      if (uMatch || crmMatch) {
        return { id: d.id, ...data };
      }
    }

    // 4. Fallback: if user is in INITIAL_USERS_DATA (e.g. before batch sync completes)
    const rawMatch = INITIAL_USERS_DATA.find(
      (u) =>
        u.username.trim().toLowerCase() === cleanLower ||
        u.crmUser.trim().toLowerCase() === cleanLower ||
        (cleanLower === 'admin' && u.role === 'super_admin')
    );
    if (rawMatch) {
      const cleanRawUsername = normalizeInputId(rawMatch.username);
      const userRef = doc(db, USERS_COLLECTION, sanitizeUserDocId(cleanRawUsername));
      const existingById = await getDoc(userRef);
      if (existingById.exists()) {
        return { id: existingById.id, ...(existingById.data() as Omit<User, 'id'>) };
      }

      const salt = generateSalt();
      const passwordHash = await hashPassword(rawMatch.initialPassword, salt);
      const canonicalRole = normalizeUserRole(rawMatch.role);
      const newUser: Omit<User, 'id'> = {
        username: cleanRawUsername,
        fullName: rawMatch.fullName.trim(),
        role: canonicalRole,
        crmUser: rawMatch.crmUser.trim(),
        jobTitle: rawMatch.jobTitle || getRoleDefaultJobTitle(canonicalRole),
        passwordHash,
        salt,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      await setDoc(userRef, newUser);
      return { id: userRef.id, ...newUser };
    }

    return null;
  } catch (error) {
    handleDatabaseError(error, OperationType.GET, USERS_COLLECTION);
    return null;
  }
}

export async function lookupEmployeeInfo(
  identifier: string
): Promise<{
  fullName: string;
  jobTitle: string;
  role: UserRole;
  crmUser: string;
  nationalId: string;
  status: string;
} | null> {
  const clean = normalizeInputId(identifier);
  if (!clean || clean.length < 2) return null;
  try {
    const user = await getUserByUsername(clean);
    if (!user) return null;
    return {
      fullName: user.fullName,
      jobTitle:
        user.jobTitle ||
        (user.role === 'agent'
          ? 'وكيل الاتصال'
          : user.role === 'management' || user.role === 'technical_support'
          ? 'ادارة ودعم تقني'
          : 'مدير عام النظام'),
      role: user.role,
      crmUser: user.crmUser,
      nationalId: user.username,
      status: user.status,
    };
  } catch {
    return null;
  }
}

/**
 * Checks database for duplicate username, crmUser, or fullName
 */
async function assertNoDuplicateUser(
  params: { username?: string; crmUser?: string; fullName?: string },
  excludeUserId?: string
): Promise<void> {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  const targetUsername = params.username ? normalizeInputId(params.username).toLowerCase() : '';
  const targetCrm = params.crmUser ? normalizeCrmCode(params.crmUser) : '';
  const targetName = params.fullName ? normalizeFullName(params.fullName) : '';

  snap.forEach((d) => {
    if (excludeUserId && d.id === excludeUserId) return;
    const u = d.data() as User;

    if (targetUsername && normalizeInputId(u.username || '').toLowerCase() === targetUsername) {
      throw new Error(`اسم المستخدم / الرقم القومي "${params.username?.trim()}" مسجل مسبقاً لموظف آخر ولا يمكن تكراره.`);
    }
    if (targetCrm && normalizeCrmCode(u.crmUser || '') === targetCrm) {
      throw new Error(`كود CRM "${params.crmUser?.trim()}" مسجل مسبقاً لمستخدم آخر ولا يمكن تكراره.`);
    }
    if (targetName && normalizeFullName(u.fullName || '') === targetName) {
      throw new Error(`الموظف "${params.fullName?.trim()}" مسجل مسبقاً في قاعدة البيانات ولا يمكن تكراره.`);
    }
  });
}

export async function createUser(
  data: {
    username: string;
    fullName: string;
    password: string;
    role: UserRole;
    crmUser: string;
    jobTitle?: string;
  },
  actingUser: User
): Promise<User> {
  const cleanUsername = normalizeInputId(data.username);
  const cleanFullName = data.fullName.trim().replace(/\s+/g, ' ');
  const cleanCrm = data.crmUser.trim();
  const cleanPassword = data.password.trim();
  const canonicalRole = normalizeUserRole(data.role);

  if (!cleanUsername || cleanUsername.length < 2) {
    throw new Error('يرجى إدخال اسم مستخدم أو رقم قومي صالح (حرفين على الأقل بدون مسافات).');
  }
  if (!cleanFullName || cleanFullName.length < 2) {
    throw new Error('يرجى إدخال الاسم بالكامل بشكل صحيح.');
  }
  if (!cleanCrm) {
    throw new Error('يرجى إدخال كود CRM User.');
  }
  if (!cleanPassword || cleanPassword.length < 4) {
    throw new Error('يرجى إدخال كلمة مرور لا تقل عن 4 أحرف أو أرقام.');
  }

  try {
    await assertNoDuplicateUser({
      username: cleanUsername,
      crmUser: cleanCrm,
      fullName: cleanFullName,
    });

    const salt = generateSalt();
    const passwordHash = await hashPassword(cleanPassword, salt);
    const docId = sanitizeUserDocId(cleanUsername);
    const userRef = doc(db, USERS_COLLECTION, docId);

    // Prevent silent overwrite if a sanitized doc ID somehow collided
    const collisionSnap = await getDoc(userRef);
    if (collisionSnap.exists()) {
      const existingData = collisionSnap.data() as User;
      throw new Error(
        `يوجد حساب مسجل بالفعل بنفس المعرف (${existingData.fullName || cleanUsername}).`
      );
    }

    const newUser: Omit<User, 'id'> = {
      username: cleanUsername,
      fullName: cleanFullName,
      role: canonicalRole,
      crmUser: cleanCrm,
      jobTitle: data.jobTitle || getRoleDefaultJobTitle(canonicalRole),
      passwordHash,
      salt,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    await setDoc(userRef, newUser);

    // Verify persistence immediately
    const verifiedSnap = await getDoc(userRef);
    if (!verifiedSnap.exists()) {
      throw new Error('تعذر التحقق من حفظ المستخدم في قاعدة البيانات، يرجى المحاولة مرة أخرى.');
    }

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'إضافة مستخدم جديد',
      recordId: userRef.id,
      details: `تمت إضافة المستخدم ${cleanFullName} (${cleanCrm}) بصلاحية ${getRoleDefaultJobTitle(canonicalRole)}`,
    });

    return { id: userRef.id, ...newUser };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('مسجل مسبقاً') ||
        error.message.includes('يرجى إدخال') ||
        error.message.includes('يوجد حساب') ||
        error.message.includes('تعذر التحقق'))
    ) {
      throw error;
    }
    const rawMsg = error instanceof Error ? error.message : String(error);
    console.error('createUser failed:', rawMsg);
    throw new Error(`تعذر حفظ المستخدم الجديد في قاعدة البيانات (${rawMsg}).`);
  }
}

export async function updateUser(
  userId: string,
  data: Partial<Pick<User, 'fullName' | 'username' | 'role' | 'crmUser' | 'jobTitle' | 'status'>>,
  actingUser: User
): Promise<void> {
  try {
    const cleanUpdates: Record<string, any> = { ...data };

    if (data.role) {
      const canonicalRole = normalizeUserRole(data.role);
      cleanUpdates.role = canonicalRole;
      if (!data.jobTitle) {
        cleanUpdates.jobTitle = getRoleDefaultJobTitle(canonicalRole);
      }
    }

    if (data.fullName !== undefined) {
      cleanUpdates.fullName = data.fullName.trim().replace(/\s+/g, ' ');
    }
    if (data.crmUser !== undefined) {
      cleanUpdates.crmUser = data.crmUser.trim();
    }
    if (data.username !== undefined) {
      cleanUpdates.username = normalizeInputId(data.username);
    }

    if (cleanUpdates.username || cleanUpdates.crmUser || cleanUpdates.fullName) {
      await assertNoDuplicateUser(
        {
          username: cleanUpdates.username,
          crmUser: cleanUpdates.crmUser,
          fullName: cleanUpdates.fullName,
        },
        userId
      );
    }

    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      ...cleanUpdates,
      updatedAt: new Date().toISOString(),
    });

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'تعديل بيانات مستخدم',
      recordId: userId,
      details: `تم تحديث الحقول: ${Object.keys(cleanUpdates).join(', ')}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('مسجل مسبقاً')) {
      throw error;
    }
    handleDatabaseError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
  }
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
  actingUser: User
): Promise<void> {
  try {
    const salt = generateSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    const userRef = doc(db, USERS_COLLECTION, userId);

    await updateDoc(userRef, {
      passwordHash,
      salt,
      updatedAt: new Date().toISOString(),
    });

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'إعادة تعيين كلمة المرور',
      recordId: userId,
      details: 'تم تغيير كلمة المرور للمستخدم بنجاح',
    });
  } catch (error) {
    handleDatabaseError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
  }
}

export async function toggleUserStatus(
  userId: string,
  currentStatus: 'active' | 'disabled',
  actingUser: User
): Promise<void> {
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
  return updateUser(userId, { status: newStatus }, actingUser);
}

export async function deleteUser(userId: string, actingUser: User): Promise<void> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const docSnap = await getDoc(userRef);
    const targetUser = docSnap.data() as User | undefined;

    await deleteDoc(userRef);

    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'حذف مستخدم نهائياً',
      recordId: userId,
      details: `تم حذف حساب ${targetUser?.fullName || userId}`,
    });
  } catch (error) {
    handleDatabaseError(error, OperationType.DELETE, `${USERS_COLLECTION}/${userId}`);
  }
}

export async function importUsersFromCSV(
  csvContent: string,
  mode: 'add_merge' | 'replace',
  actingUser: User
): Promise<ImportReport> {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  const report: ImportReport = {
    totalRows: 0,
    newRecords: 0,
    updatedRecords: 0,
    duplicates: 0,
    errorRecords: 0,
    errorDetails: [],
  };

  if (lines.length < 2) {
    report.errorDetails.push('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة');
    return report;
  }

  // Header line inspection
  const header = lines[0].split(',').map(h => h.trim());
  const nameIdx = header.findIndex(h => h.includes('الاسم'));
  const userIdx = header.findIndex(h => h.includes('اسم المستخدم'));
  const passIdx = header.findIndex(h => h.includes('كلمة المرور'));
  const jobIdx = header.findIndex(h => h.includes('الوظيفة'));
  const crmIdx = header.findIndex(h => h.toLowerCase().includes('crm'));

  if (nameIdx === -1 || userIdx === -1 || passIdx === -1) {
    report.errorDetails.push('أعمدة الملف غير مطابقة (مطلوب: الاسم، اسم المستخدم، كلمة المرور، الوظيفة، crm user)');
    return report;
  }

  // If mode is 'replace', wipe existing non-admin users
  if (mode === 'replace') {
    const existingSnap = await getDocs(collection(db, USERS_COLLECTION));
    const deleteBatch = writeBatch(db);
    existingSnap.forEach(d => {
      const data = d.data() as User;
      if (data.username !== 'admin') {
        deleteBatch.delete(d.ref);
      }
    });
    await deleteBatch.commit();
  }

  const existingUsersSnap = await getDocs(collection(db, USERS_COLLECTION));
  const existingMap = new Map<string, { id: string; user: User }>();
  const existingCrmMap = new Map<string, string>();
  const existingNameSet = new Set<string>();

  existingUsersSnap.forEach(d => {
    const u = d.data() as User;
    const unameKey = normalizeInputId(u.username || '').toLowerCase();
    const crmKey = normalizeCrmCode(u.crmUser || '');
    const nameKey = normalizeFullName(u.fullName || '');
    if (unameKey) existingMap.set(unameKey, { id: d.id, user: u });
    if (crmKey) existingCrmMap.set(crmKey, unameKey);
    if (nameKey) existingNameSet.add(nameKey);
  });

  const batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    report.totalRows++;

    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const fullName = (cols[nameIdx] || '').trim().replace(/\s+/g, ' ');
    const username = normalizeInputId(cols[userIdx] || '');
    const password = (cols[passIdx] || '').trim();
    const jobTitle = jobIdx !== -1 ? cols[jobIdx] : 'وكيل الاتصال';
    const crmUser = crmIdx !== -1 ? cols[crmIdx].trim() : `ETA_${username}`;

    if (!fullName || !username || !password) {
      report.errorRecords++;
      report.errorDetails.push(`السطر ${i + 1}: بيانات ناقصة (الاسم أو اسم المستخدم أو كلمة المرور غير متوفرة)`);
      continue;
    }

    let role: UserRole = 'agent';
    if (
      jobTitle.includes('ادارة') ||
      jobTitle.includes('إدارة') ||
      jobTitle.includes('دعم تقني') ||
      jobTitle.includes('دعم فني')
    ) {
      role = 'management';
    } else if (jobTitle.includes('مدير النظام')) {
      role = 'super_admin';
    }

    const unameKey = username.toLowerCase();
    const crmKey = normalizeCrmCode(crmUser);
    const nameKey = normalizeFullName(fullName);

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    if (existingMap.has(unameKey)) {
      if (mode === 'add_merge') {
        const existingRec = existingMap.get(unameKey)!;
        const userRef = doc(db, USERS_COLLECTION, existingRec.id);
        batch.update(userRef, {
          fullName,
          jobTitle: getRoleDefaultJobTitle(role),
          crmUser,
          passwordHash,
          salt,
          role,
          updatedAt: new Date().toISOString(),
        });
        report.updatedRecords++;
        batchCount++;
      } else {
        report.duplicates++;
      }
    } else if (existingCrmMap.has(crmKey) || existingNameSet.has(nameKey)) {
      report.duplicates++;
    } else {
      const userRef = doc(db, USERS_COLLECTION, username);
      batch.set(userRef, {
        username,
        fullName,
        jobTitle: getRoleDefaultJobTitle(role),
        crmUser,
        passwordHash,
        salt,
        role,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      existingMap.set(unameKey, { id: userRef.id, user: { id: userRef.id, username, fullName, crmUser, role, passwordHash, salt, status: 'active', createdAt: '' } });
      existingCrmMap.set(crmKey, unameKey);
      existingNameSet.add(nameKey);
      report.newRecords++;
      batchCount++;
    }

    if (batchCount >= 400) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  await logAuditEvent({
    userId: actingUser.id,
    username: actingUser.username,
    fullName: actingUser.fullName,
    role: actingUser.role,
    action: `استيراد مستخدمين (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'})`,
    details: `تمت معالجة ${report.totalRows} صف: ${report.newRecords} جديد، ${report.updatedRecords} محدث، ${report.duplicates} مكرر، ${report.errorRecords} أخطاء`,
  });

  return report;
}

export async function fetchUsers(): Promise<User[]> {
  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    const users: User[] = [];
    snap.forEach((d) => {
      users.push({ id: d.id, ...(d.data() as Omit<User, 'id'>) });
    });
    users.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));
    return deduplicateUsers(users);
  } catch (error) {
    handleDatabaseError(error, OperationType.LIST, USERS_COLLECTION);
    return [];
  }
}

export function parseUsersCSV(csvText: string): any[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim());
  const nameIdx = header.findIndex(h => h.includes('الاسم'));
  const userIdx = header.findIndex(h => h.includes('اسم المستخدم'));
  const passIdx = header.findIndex(h => h.includes('كلمة المرور'));
  const jobIdx = header.findIndex(h => h.includes('الوظيفة'));
  const crmIdx = header.findIndex(h => h.toLowerCase().includes('crm'));

  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    rows.push({
      fullName: cols[nameIdx] || '',
      username: cols[userIdx] || '',
      password: cols[passIdx] || 'Pass@2024',
      jobTitle: jobIdx !== -1 ? cols[jobIdx] : 'وكيل الاتصال',
      crmUser: crmIdx !== -1 ? cols[crmIdx] : `ETA_${cols[userIdx]}`,
    });
  }
  return rows;
}

export async function bulkImportUsers(
  rows: any[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const existingUsersSnap = await getDocs(collection(db, USERS_COLLECTION));
  const existingUsernames = new Set<string>();
  const existingCrmCodes = new Set<string>();
  const existingFullNames = new Set<string>();

  existingUsersSnap.forEach((d) => {
    const u = d.data() as User;
    if (u.username) existingUsernames.add(normalizeInputId(u.username).toLowerCase());
    if (u.crmUser) existingCrmCodes.add(normalizeCrmCode(u.crmUser));
    if (u.fullName) existingFullNames.add(normalizeFullName(u.fullName));
  });

  const batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cleanFullName = (row.fullName || '').trim().replace(/\s+/g, ' ');
    const cleanUsername = normalizeInputId(row.username || '');
    const cleanCrm = (row.crmUser || '').trim();

    if (!cleanFullName || !cleanUsername) {
      errors.push(`صف ${i + 1}: بيانات مفقودة`);
      continue;
    }

    const unameKey = cleanUsername.toLowerCase();
    const crmKey = normalizeCrmCode(cleanCrm);
    const nameKey = normalizeFullName(cleanFullName);

    if (
      existingUsernames.has(unameKey) ||
      (crmKey && existingCrmCodes.has(crmKey)) ||
      existingFullNames.has(nameKey)
    ) {
      skipped++;
      continue;
    }

    // Unified role: الإدارة والدعم التقني -> management
    let role: UserRole = 'agent';
    const jt = (row.jobTitle || '').toLowerCase();
    if (
      jt.includes('ادارة') ||
      jt.includes('إدارة') ||
      jt.includes('دعم تقني') ||
      jt.includes('فني')
    ) {
      role = 'management';
    } else if (jt.includes('مدير') || jt.includes('admin')) {
      role = 'super_admin';
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(row.password || 'Pass@2024', salt);
    const userRef = doc(db, USERS_COLLECTION, cleanUsername);

    batch.set(userRef, {
      username: cleanUsername,
      fullName: cleanFullName,
      jobTitle: getRoleDefaultJobTitle(role),
      crmUser: cleanCrm,
      passwordHash,
      salt,
      role,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    existingUsernames.add(unameKey);
    if (crmKey) existingCrmCodes.add(crmKey);
    existingFullNames.add(nameKey);

    imported++;
    batchCount++;

    if (batchCount >= 400) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return { imported, skipped, errors };
}
