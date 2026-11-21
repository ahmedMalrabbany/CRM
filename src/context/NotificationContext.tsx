/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from '../lib/sheetsDb';
import { db } from '../config/firebase';
import { NotificationItem } from '../types';
import { useAuth } from './AuthContext';
import { playAlertSound } from '../utils/soundAlerts';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  pendingMandatoryNotices: NotificationItem[];
  markAsRead: (notificationId: string) => Promise<void>;
  acknowledgeNotification: (notificationId: string, acknowledgedByName: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

function getNotificationTimeMs(item: NotificationItem): number {
  if (!item?.createdAt) return 0;
  const parsed = Date.parse(item.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortNotificationsNewestFirst(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => {
    const timeDiff = getNotificationTimeMs(b) - getNotificationTimeMs(a);
    if (timeDiff !== 0) return timeDiff;
    const strCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
    if (strCmp !== 0) return strCmp;
    return (b.id || '').localeCompare(a.id || '');
  });
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isVerifiedInScreen } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initialSnapshotDoneRef = useRef<boolean>(false);

  useEffect(() => {
    seenNotifIdsRef.current.clear();
    initialSnapshotDoneRef.current = false;

    if (!currentUser) {
      setNotifications([]);
      return;
    }

    const rawTargets = [
      currentUser.username,
      currentUser.username?.trim(),
      currentUser.crmUser,
      currentUser.crmUser?.trim(),
      currentUser.id,
      currentUser.role,
      'all',
    ].filter((val): val is string => typeof val === 'string' && val.trim().length > 0);

    const targets = Array.from(new Set(rawTargets)).slice(0, 10);

    // Query without orderBy to avoid Firestore composite index requirement, then sort newest-first in JS
    const q = query(
      collection(db, 'notifications'),
      where('recipientUsername', 'in', targets)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: NotificationItem[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) });
        });
        const sortedItems = sortNotificationsNewestFirst(items);
        setNotifications(sortedItems);

        // Play audio alert for newly arrived unread notifications (and on initial load if unread exist)
        const newlyDetectedUnread = sortedItems.filter(
          (n) => !n.isRead && !seenNotifIdsRef.current.has(n.id)
        );
        sortedItems.forEach((n) => seenNotifIdsRef.current.add(n.id));

        if (newlyDetectedUnread.length > 0 && isVerifiedInScreen) {
          const hasMandatory = newlyDetectedUnread.some((n) => n.type === 'admin_notice');
          const hasOverdue = newlyDetectedUnread.some((n) => n.type === 'overdue_alert');
          if (hasMandatory) {
            playAlertSound('mandatory');
          } else if (hasOverdue) {
            playAlertSound('overdue');
          } else if (initialSnapshotDoneRef.current || newlyDetectedUnread.length > 0) {
            playAlertSound('notification');
          }
        }
        initialSnapshotDoneRef.current = true;
      },
      (error) => {
        console.warn('Notifications subscription note:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser, isVerifiedInScreen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const pendingMandatoryNotices = notifications
    .filter(
      (n) =>
        n.type === 'admin_notice' &&
        !n.acknowledged &&
        (n.requiresAcknowledgment === true || !n.isRead)
    )
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const markAsRead = async (notificationId: string) => {
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, { isRead: true });
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const acknowledgeNotification = async (notificationId: string, acknowledgedByName: string) => {
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, {
        isRead: true,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedByName,
      });
    } catch (err) {
      console.error('Failed to acknowledge notification:', err);
      throw err;
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.isRead && n.type !== 'admin_notice');
      if (unread.length === 0) return;

      const batch = writeBatch(db);
      unread.forEach((n) => {
        const ref = doc(db, 'notifications', n.id);
        batch.update(ref, { isRead: true });
      });
      await batch.commit();
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        pendingMandatoryNotices,
        markAsRead,
        acknowledgeNotification,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
