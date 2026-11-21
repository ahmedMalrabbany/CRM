/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole } from '../types';

export interface InitialUserSeed {
  username: string;
  fullName: string;
  role: UserRole;
  crmUser: string;
  initialPassword: string;
  jobTitle?: string;
}

export const INITIAL_USERS_DATA: InitialUserSeed[] = [
  {
    username: 'admin',
    fullName: 'مدير النظام العام',
    role: 'super_admin',
    crmUser: 'ETA_ADMIN',
    initialPassword: 'Admin@16395',
    jobTitle: 'مدير عام النظام',
  },
  {
    username: '29001010100011',
    fullName: 'مسؤول الإدارة والدعم التقني',
    role: 'management',
    crmUser: 'ETA_MGT_1',
    initialPassword: 'Pass@2024',
    jobTitle: 'ادارة ودعم تقني',
  },
  {
    username: '29501010100022',
    fullName: 'وكيل الاتصال الافتراضي',
    role: 'agent',
    crmUser: 'ETA_AGT_1',
    initialPassword: 'Pass@2024',
    jobTitle: 'وكيل الاتصال',
  },
];
