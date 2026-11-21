# Security Specification - Egyptian Tax Authority CRM

## 1. Data Invariants
1. Cases must have a valid sequential caseId (e.g. CRM-000001) and valid 9-digit tax registration number.
2. Timeline entries are append-only; existing timeline events can never be edited or deleted.
3. Case Close operation strictly requires a non-empty `closeReason`.
4. Call center agents cannot modify managementReply or managementEmployeeName.
5. Management and Technical Support can claim, assign, reply, transfer, or close cases.
6. Passwords in `users` collection must never be stored as plaintext; only salted cryptographic hashes.
7. AuditLogs can only be appended and never modified or deleted by ordinary users.
8. Taxpayers must be keyed by 9-digit tax registration number matching `^[0-9]{9}$`.

## 2. The Dirty Dozen Payloads
1. **Plaintext Password Injection**: User document created with `password: "plain123"`. (Rejected: must contain `passwordHash`).
2. **Invalid Tax Number**: Case created with `taxRegistrationNumber: "123"` (< 9 digits). (Rejected: regex requires 9 digits).
3. **Agent Modifying Management Reply**: Agent user attempting update where `managementReply` is modified. (Rejected).
4. **Closing Case without Reason**: Status updated to 'مغلقة' with empty or missing `closeReason`. (Rejected).
5. **Timeline Tampering**: Attempting `delete` or `update` on a `cases/{id}/timeline/{id}` document. (Rejected).
6. **AuditLog Deletion**: User attempting to delete entries from `auditLogs`. (Rejected).
7. **Ghost Field Shadow Update**: Injecting extra unexpected fields like `isAdmin: true` on user document. (Rejected).
8. **Negative Counter**: Attempting to set counter below current value. (Rejected).
9. **Fake Case ID**: Case created with `caseId: "INVALID-99"`. (Rejected: regex pattern mismatch).
10. **Unauthorized Role Escalation**: User attempting to change their own role from agent to super_admin. (Rejected).
11. **Taxpayer Oversized Payload**: Injecting 500KB string in notes. (Rejected by length guards).
12. **Disabled User Action**: Any write from a user whose account is marked `disabled`. (Rejected).
