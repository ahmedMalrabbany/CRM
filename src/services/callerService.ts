/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  onSnapshot
} from '../lib/sheetsDb';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import { Caller, CallerTitle, CallerClassification, User } from '../types';
import { logAuditEvent } from './auditService';
import { cleanFirestoreData } from './caseService';

const CALLERS_COLLECTION = 'callers';
const CASES_COLLECTION = 'cases';

export interface CallerPhoneMatch {
  id: string;
  name: string;
  title: CallerTitle;
  classification: CallerClassification;
  taxRegistrationNumber?: string;
  nationalId?: string;
  primaryPhone: string;
  secondaryPhone?: string;
  emailAvailability: 'متوفر' | 'غير متوفر';
  email?: string;
  description?: string;
  source: 'callers' | 'cases';
}

export async function findCallerByPhone(phone: string): Promise<Caller | null> {
  const cleanPhone = phone.trim();
  try {
    const q = query(
      collection(db, CALLERS_COLLECTION),
      where('primaryPhone', '==', cleanPhone),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, ...(docSnap.data() as Omit<Caller, 'id'>) };
    }

    // Check secondary phone if any
    const qSec = query(
      collection(db, CALLERS_COLLECTION),
      where('secondaryPhone', '==', cleanPhone),
      limit(1)
    );
    const snapSec = await getDocs(qSec);
    if (!snapSec.empty) {
      const docSnap = snapSec.docs[0];
      return { id: docSnap.id, ...(docSnap.data() as Omit<Caller, 'id'>) };
    }

    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, CALLERS_COLLECTION);
  }
}

export async function findAllCallersByPhone(phone: string): Promise<CallerPhoneMatch[]> {
  const cleanPhone = phone.trim();
  if (!cleanPhone) return [];

  const matchesByName = new Map<string, CallerPhoneMatch>();
  const registerMatch = (entry: CallerPhoneMatch) => {
    const normalizedNameKey = entry.name.trim().replace(/\s+/g, ' ');
    if (!normalizedNameKey) return;
    const existing = matchesByName.get(normalizedNameKey);
    if (!existing) {
      matchesByName.set(normalizedNameKey, { ...entry, name: normalizedNameKey });
      return;
    }
    // Prefer richer fields if missing on the existing record
    matchesByName.set(normalizedNameKey, {
      ...existing,
      title: existing.title || entry.title,
      classification: existing.classification || entry.classification,
      taxRegistrationNumber: existing.taxRegistrationNumber || entry.taxRegistrationNumber,
      nationalId: existing.nationalId || entry.nationalId,
      secondaryPhone: existing.secondaryPhone || entry.secondaryPhone,
      emailAvailability:
        existing.emailAvailability === 'متوفر' ? 'متوفر' : entry.emailAvailability,
      email: existing.email || entry.email,
      description: existing.description || entry.description,
    });
  };

  try {
    const [snapPrimary, snapSecondary, snapCases] = await Promise.all([
      getDocs(
        query(collection(db, CALLERS_COLLECTION), where('primaryPhone', '==', cleanPhone), limit(30))
      ),
      getDocs(
        query(collection(db, CALLERS_COLLECTION), where('secondaryPhone', '==', cleanPhone), limit(30))
      ),
      getDocs(
        query(collection(db, CASES_COLLECTION), where('callerPhone', '==', cleanPhone), limit(50))
      ),
    ]);

    snapPrimary.forEach((d) => {
      const c = d.data() as Omit<Caller, 'id'>;
      registerMatch({
        id: d.id,
        name: c.name || '',
        title: c.title || '',
        classification: c.classification || '',
        taxRegistrationNumber: c.taxRegistrationNumber || '',
        nationalId: c.nationalId || '',
        primaryPhone: c.primaryPhone || cleanPhone,
        secondaryPhone: c.secondaryPhone || '',
        emailAvailability: c.emailAvailability || (c.email ? 'متوفر' : 'غير متوفر'),
        email: c.email || '',
        description: c.description || '',
        source: 'callers',
      });
    });

    snapSecondary.forEach((d) => {
      const c = d.data() as Omit<Caller, 'id'>;
      registerMatch({
        id: d.id,
        name: c.name || '',
        title: c.title || '',
        classification: c.classification || '',
        taxRegistrationNumber: c.taxRegistrationNumber || '',
        nationalId: c.nationalId || '',
        primaryPhone: c.primaryPhone || cleanPhone,
        secondaryPhone: c.secondaryPhone || '',
        emailAvailability: c.emailAvailability || (c.email ? 'متوفر' : 'غير متوفر'),
        email: c.email || '',
        description: c.description || '',
        source: 'callers',
      });
    });

    snapCases.forEach((d) => {
      const cs = d.data() as any;
      if (cs.isDeleted || !cs.callerName) return;
      registerMatch({
        id: `case_${d.id}`,
        name: cs.callerName || '',
        title: cs.callerTitle || '',
        classification: cs.callerClassification || '',
        taxRegistrationNumber: cs.taxRegistrationNumber || '',
        nationalId: cs.callerNationalId || '',
        primaryPhone: cs.callerPhone || cleanPhone,
        secondaryPhone: cs.callerSecondaryPhone || '',
        emailAvailability: cs.callerEmail ? 'متوفر' : 'غير متوفر',
        email: cs.callerEmail || '',
        description: cs.callerDescription || '',
        source: 'cases',
      });
    });

    return Array.from(matchesByName.values());
  } catch (error) {
    console.warn('findAllCallersByPhone error:', error);
    return [];
  }
}

export async function getCallersByTaxNumber(taxNumber: string): Promise<Caller[]> {
  try {
    const q = query(
      collection(db, CALLERS_COLLECTION),
      where('taxRegistrationNumber', '==', taxNumber.trim())
    );
    const snap = await getDocs(q);
    const callers: Caller[] = [];
    snap.forEach((d) => {
      callers.push({ id: d.id, ...(d.data() as Omit<Caller, 'id'>) });
    });
    return callers;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CALLERS_COLLECTION);
  }
}

export async function createCaller(data: {
  name: string;
  title: CallerTitle;
  classification: CallerClassification;
  taxRegistrationNumber: string;
  nationalId?: string;
  primaryPhone: string;
  secondaryPhone?: string;
  emailAvailability: 'متوفر' | 'غير متوفر';
  email?: string;
  description?: string;
}): Promise<Caller> {
  try {
    const docRef = doc(collection(db, CALLERS_COLLECTION));
    const newCaller: Omit<Caller, 'id'> = {
      name: data.name.trim(),
      title: data.title,
      classification: data.classification,
      taxRegistrationNumber: data.taxRegistrationNumber.trim(),
      nationalId: data.nationalId?.trim() || '',
      primaryPhone: data.primaryPhone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || '',
      emailAvailability: data.emailAvailability,
      email: data.email?.trim() || '',
      description: data.description?.trim() || '',
      createdAt: new Date().toISOString(),
    };

    await setDoc(docRef, cleanFirestoreData(newCaller));
    return { id: docRef.id, ...newCaller };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, CALLERS_COLLECTION);
  }
}

export async function updateCaller(
  callerId: string,
  data: {
    name: string;
    title: CallerTitle;
    classification: CallerClassification;
    taxRegistrationNumber: string;
    nationalId?: string;
    primaryPhone: string;
    secondaryPhone?: string;
    emailAvailability: 'متوفر' | 'غير متوفر';
    email?: string;
    description?: string;
  },
  actingUser?: User
): Promise<Caller> {
  const docRef = doc(db, CALLERS_COLLECTION, callerId);
  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error('سجل المتصل غير موجود في قاعدة البيانات.');
    }
    const existing = snap.data() as Omit<Caller, 'id'>;
    const now = new Date().toISOString();

    const updatedFields: Partial<Caller> = {
      name: data.name.trim(),
      title: data.title,
      classification: data.classification,
      taxRegistrationNumber: data.taxRegistrationNumber.trim(),
      nationalId: data.nationalId?.trim() || '',
      primaryPhone: data.primaryPhone.trim(),
      secondaryPhone: data.secondaryPhone?.trim() || '',
      emailAvailability: data.emailAvailability,
      email: data.emailAvailability === 'متوفر' ? data.email?.trim() || '' : '',
      description: data.description?.trim() || '',
      updatedAt: now,
    };

    await updateDoc(docRef, cleanFirestoreData(updatedFields));

    if (actingUser) {
      await logAuditEvent({
        userId: actingUser.id,
        username: actingUser.username,
        fullName: actingUser.fullName,
        role: actingUser.role,
        action: 'تعديل بيانات متصل',
        recordId: callerId,
        details: `تحديث بيانات المتصل: ${data.name.trim()} (${data.primaryPhone.trim()})`,
      });
    }

    return {
      id: callerId,
      ...existing,
      ...updatedFields,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('سجل المتصل')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${CALLERS_COLLECTION}/${callerId}`);
  }
}

export async function deleteCaller(
  callerId: string,
  callerName: string,
  actingUser?: User
): Promise<void> {
  if (!actingUser || actingUser.role !== 'super_admin') {
    throw new Error('صلاحية الحذف متاحة لمدير النظام (الأدمن) فقط.');
  }

  const docRef = doc(db, CALLERS_COLLECTION, callerId);
  try {
    await deleteDoc(docRef);
    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'حذف سجل متصل',
      recordId: callerId,
      details: `تم حذف المتصل: ${callerName}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${CALLERS_COLLECTION}/${callerId}`);
  }
}

export function subscribeToCallers(callback: (callers: Caller[]) => void): () => void {
  const q = query(collection(db, CALLERS_COLLECTION), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Caller[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Caller, 'id'>) });
      });
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, CALLERS_COLLECTION);
    }
  );
}
