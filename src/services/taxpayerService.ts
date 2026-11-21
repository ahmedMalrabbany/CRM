/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  limit,
  onSnapshot
} from '../lib/sheetsDb';
import { db, handleFirestoreError, OperationType } from '../config/firebase';
import { Taxpayer, TaxType, User } from '../types';
import { logAuditEvent } from './auditService';
import { cleanFirestoreData } from './caseService';

const TAXPAYERS_COLLECTION = 'taxpayers';

export async function getTaxpayerByNumber(taxRegistrationNumber: string): Promise<Taxpayer | null> {
  const cleanNumber = taxRegistrationNumber.trim();
  try {
    const docRef = doc(db, TAXPAYERS_COLLECTION, cleanNumber);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Taxpayer, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TAXPAYERS_COLLECTION}/${cleanNumber}`);
  }
}

export async function upsertTaxpayer(data: {
  taxRegistrationNumber: string;
  name: string;
  taxType?: TaxType;
  city?: string;
  activity?: string;
  notes?: string;
}): Promise<Taxpayer> {
  const cleanNumber = data.taxRegistrationNumber.trim();
  try {
    const docRef = doc(db, TAXPAYERS_COLLECTION, cleanNumber);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as Taxpayer;
      const updated: Partial<Taxpayer> = {
        name: data.name.trim() || existingData.name,
        taxType: data.taxType || existingData.taxType,
        city: data.city || existingData.city,
        activity: data.activity || existingData.activity,
        notes: data.notes || existingData.notes,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(docRef, cleanFirestoreData(updated));
      return { ...existingData, ...updated, id: cleanNumber };
    } else {
      const newTaxpayer: Omit<Taxpayer, 'id'> = {
        taxRegistrationNumber: cleanNumber,
        name: data.name.trim(),
        taxType: data.taxType || 'ضرائب دخل',
        city: data.city || '',
        activity: data.activity || '',
        notes: data.notes || '',
        createdAt: new Date().toISOString(),
      };
      await setDoc(docRef, cleanFirestoreData(newTaxpayer));
      return { id: cleanNumber, ...newTaxpayer };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${TAXPAYERS_COLLECTION}/${cleanNumber}`);
  }
}

export async function updateTaxpayer(
  taxpayerId: string,
  data: {
    taxRegistrationNumber?: string;
    name: string;
    taxType?: TaxType;
    city?: string;
    activity?: string;
    notes?: string;
  },
  actingUser?: User
): Promise<Taxpayer> {
  const oldRef = doc(db, TAXPAYERS_COLLECTION, taxpayerId);
  const newNumber = (data.taxRegistrationNumber || taxpayerId).trim();
  const now = new Date().toISOString();

  try {
    const oldSnap = await getDoc(oldRef);
    if (!oldSnap.exists()) {
      throw new Error('سجل الممول غير موجود في قاعدة البيانات.');
    }
    const oldData = oldSnap.data() as Omit<Taxpayer, 'id'>;

    if (newNumber !== taxpayerId) {
      const newRef = doc(db, TAXPAYERS_COLLECTION, newNumber);
      const conflictSnap = await getDoc(newRef);
      if (conflictSnap.exists()) {
        throw new Error('رقم التسجيل الضريبي الجديد مسجل بالفعل لممول آخر.');
      }

      const migratedTaxpayer: Omit<Taxpayer, 'id'> = {
        taxRegistrationNumber: newNumber,
        name: data.name.trim(),
        taxType: data.taxType || oldData.taxType || 'ضرائب دخل',
        city: data.city?.trim() ?? '',
        activity: data.activity?.trim() ?? '',
        notes: data.notes?.trim() ?? '',
        createdAt: oldData.createdAt || now,
        updatedAt: now,
      };

      await setDoc(newRef, cleanFirestoreData(migratedTaxpayer));
      await deleteDoc(oldRef);

      if (actingUser) {
        await logAuditEvent({
          userId: actingUser.id,
          username: actingUser.username,
          fullName: actingUser.fullName,
          role: actingUser.role,
          action: 'تعديل بيانات ممول',
          recordId: newNumber,
          details: `تعديل الممول (${data.name.trim()}) وتحديث رقم التسجيل من ${taxpayerId} إلى ${newNumber}`,
        });
      }

      return { id: newNumber, ...migratedTaxpayer };
    }

    const updatedFields: Partial<Taxpayer> = {
      taxRegistrationNumber: newNumber,
      name: data.name.trim(),
      taxType: data.taxType || oldData.taxType || 'ضرائب دخل',
      city: data.city?.trim() ?? '',
      activity: data.activity?.trim() ?? '',
      notes: data.notes?.trim() ?? '',
      updatedAt: now,
    };

    await updateDoc(oldRef, cleanFirestoreData(updatedFields));

    if (actingUser) {
      await logAuditEvent({
        userId: actingUser.id,
        username: actingUser.username,
        fullName: actingUser.fullName,
        role: actingUser.role,
        action: 'تعديل بيانات ممول',
        recordId: newNumber,
        details: `تحديث بيانات الممول: ${data.name.trim()}`,
      });
    }

    return {
      id: taxpayerId,
      ...oldData,
      ...updatedFields,
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('سجل الممول') || error.message.includes('رقم التسجيل الضريبي'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${TAXPAYERS_COLLECTION}/${taxpayerId}`);
  }
}

export async function deleteTaxpayer(
  taxpayerId: string,
  taxpayerName: string,
  actingUser?: User
): Promise<void> {
  if (!actingUser || actingUser.role !== 'super_admin') {
    throw new Error('صلاحية الحذف متاحة لمدير النظام (الأدمن) فقط.');
  }

  const docRef = doc(db, TAXPAYERS_COLLECTION, taxpayerId);
  try {
    await deleteDoc(docRef);
    await logAuditEvent({
      userId: actingUser.id,
      username: actingUser.username,
      fullName: actingUser.fullName,
      role: actingUser.role,
      action: 'حذف سجل ممول',
      recordId: taxpayerId,
      details: `تم حذف الممول: ${taxpayerName} (${taxpayerId})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TAXPAYERS_COLLECTION}/${taxpayerId}`);
  }
}

export function subscribeToTaxpayers(callback: (taxpayers: Taxpayer[]) => void): () => void {
  const q = query(collection(db, TAXPAYERS_COLLECTION), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Taxpayer[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Taxpayer, 'id'>) });
      });
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, TAXPAYERS_COLLECTION);
    }
  );
}
