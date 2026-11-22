# تشغيل الـ CRM على Google Sheets

## الفكرة
- الداتا كلها بتتخزن في **Google Sheet**: كل collection ليها تاب (`users`, `cases`, `taxpayers`, `callers`, `notifications`, `auditLogs`, `teamChatMessages`, `settings`, `counters`, `backups`) والـ timeline بتاع الحالات في تاب `cases.timeline`.
- كما يتصل النظام مباشرةً بملف Google Sheets المحدد (`1HsxOPbasrVx1sWY7GSfkXy1IxLZp0xKPsLYS7yFDQoU`) وتاب **`Details`** لمطابقة حقول الحالات ومزامنتها ثنائياً مع جدول البيانات.
- السيرفر (`server.ts`) بيحمّل الشيت في الذاكرة عند التشغيل، وكل القراءات بتتخدم من الذاكرة (يعني **صفر قراءات** على Google)، والكتابة بتتجمّع وتتبعت للشيت كل ~3 ثواني في request واحد.
- التحديث اللحظي بين المستخدمين بيشتغل عن طريق SSE، والـ transactions (زي ترقيم الحالات وسحب الحالة) محمية من التعارض.
- نبضة "أونلاين/أوفلاين" (heartbeat كل 45 ثانية) بقت في الذاكرة بس ومش بتتكتب في الشيت.

## خطوات الإعداد عبر حساب Google أو Service Account
1. يمكنك تسجيل الدخول مباشرة بحساب Google من داخل نافذة **مزامنة Google Sheets (Details)** لقراءة واستيراد أو مزامنة تاب `Details` من الملف `1HsxOPbasrVx1sWY7GSfkXy1IxLZp0xKPsLYS7yFDQoU` بعد تأكيدك الصريح.
2. أو للربط الخلفي الدائم عبر Service Account: فعّل **Google Sheets API** وأنشئ Service Account مع مفتاح JSON وشارك الشيت مع `client_email` بصلاحية **Editor**، ثم اضبط `GOOGLE_SHEET_ID` و`GOOGLE_SERVICE_ACCOUNT_JSON`.
3. شغّل: `npm install` ثم `npm run dev` (أو `npm run build` ثم `npm start` للإنتاج).
4. تأكد من الحالة: افتح `/api/db/status`.

## لازم تعرف
- **سيرفر واحد بس**: لو على Cloud Run خلّي `max-instances = 1`، لأن الذاكرة هي المرجع وأكتر من نسخة هيعمل تضارب.
- **تعديل الشيت بإيدك**: السيرفر مش بيشوفه لحد ما تعمل restart أو تبعت `POST /api/db/reload` مع الهيدر `x-admin-token` (لو ضبطت `DB_ADMIN_TOKEN`). متعدّلش عمود `_id` ولا تمسح الصف الأول. ولو كتبت رقم تليفون/رقم ضريبي يدويًا خلّي الخلية Plain text.
- لو الشيت وقع أو الإنترنت فصل، الكتابات بتفضل في الذاكرة وبتتعاد تلقائيًا؛ و`/api/db/status` بيوريك `pendingWrites` و`lastFlushError`.
- المرفقات لسه بتتخزن على ديسك السيرفر (`uploads/`) زي ما كانت، فلو الاستضافة ديسكها مؤقت المرفقات هتضيع عند إعادة النشر.
- اختبار: `npm run test:db` و `npx --yes tsx --test src/utils/sheetsDetailsMapper.test.ts`.
