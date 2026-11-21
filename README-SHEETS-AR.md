# تشغيل الـ CRM على Google Sheets بدل Firebase

## الفكرة
- الداتا كلها بتتخزن في **Google Sheet**: كل collection ليها تاب (users, cases, taxpayers, callers, notifications, auditLogs, teamChatMessages, settings, counters, backups) والـ timeline بتاع الحالات في تاب `cases.timeline`.
- السيرفر (`server.ts`) بيحمّل الشيت في الذاكرة عند التشغيل، وكل القراءات بتتخدم من الذاكرة (يعني **صفر قراءات** على Google)، والكتابة بتتجمّع وتتبعت للشيت كل ~3 ثواني في request واحد (حد جوجل 60 كتابة/دقيقة).
- التحديث اللحظي بين المستخدمين بيشتغل عن طريق SSE، والـ transactions (زي ترقيم الحالات وسحب الحالة) محمية من التعارض.
- نبضة "أونلاين/أوفلاين" (heartbeat كل 45 ثانية) بقت في الذاكرة بس ومش بتتكتب في الشيت.

## خطوات الإعداد (مرة واحدة)
1. ادخل على Google Cloud Console واختار مشروعك (ممكن نفس مشروع Firebase) ← **APIs & Services ← Library** ← فعّل **Google Sheets API**.
2. **IAM & Admin ← Service Accounts ← Create** ← بعد ما تتعمل: **Keys ← Add key ← JSON** (هينزل ملف).
3. اعمل Google Sheet جديد فاضي. انسخ الـ ID من اللينك (الجزء اللي بين `/d/` و `/edit`).
4. اعمل **Share** للشيت على إيميل الـ service account (`client_email` في ملف الـ JSON) بصلاحية **Editor**.
5. حط المتغيرات دي (في AI Studio: لوحة Secrets، أو ملف `.env`):
   - `GOOGLE_SHEET_ID` = ID الشيت
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = محتوى ملف الـ JSON كله في سطر واحد
6. شغّل: `npm install` ثم `npm run dev` (أو `npm run build` ثم `npm start` للإنتاج). التابات بتتعمل لوحدها.
7. تأكد من الحالة: افتح `/api/db/status` (لازم يظهر `"driver":"google-sheets"`).

## نقل الداتا القديمة من Firestore (لو عندك داتا)
```
npm i --no-save firebase
npx tsx scripts/migrate-from-firestore.ts http://localhost:3000
```
بيستهلك تقريبًا قراءة واحدة لكل مستند من حصة Firestore، فشغّله بعد ما الحصة اليومية تتصفّر. (ملفات Firebase القديمة في فولدر `legacy-firebase/`.)

## لازم تعرف
- **سيرفر واحد بس**: لو على Cloud Run خلّي `max-instances = 1`، لأن الذاكرة هي المرجع وأكتر من نسخة هيعمل تضارب.
- **تعديل الشيت بإيدك**: السيرفر مش بيشوفه لحد ما تعمل restart أو تبعت `POST /api/db/reload` مع الهيدر `x-admin-token` (لو ضبطت `DB_ADMIN_TOKEN`). متعدّلش عمود `_id` ولا تمسح الصف الأول. ولو كتبت رقم تليفون/رقم ضريبي يدويًا خلّي الخلية Plain text.
- لو الشيت وقع أو الإنترنت فصل، الكتابات بتفضل في الذاكرة وبتتعاد تلقائيًا؛ و`/api/db/status` بيوريك `pendingWrites` و`lastFlushError`.
- المرفقات لسه بتتخزن على ديسك السيرفر (`uploads/`) زي ما كانت، فلو الاستضافة ديسكها مؤقت المرفقات هتضيع عند إعادة النشر.
- اختبار: `npm run test:db` (بيشغّل الطبقة الجديدة على نسخة وهمية من Sheets API).
