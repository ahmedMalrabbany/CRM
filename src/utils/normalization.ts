/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * معيار توحيد كتابة عنوان الحالة (Case Title Text Normalization Engine)
 * 
 * القواعد المحددة في المواصفات:
 * 1. التاء المربوطة في نهاية الكلمة: استبدال "ة" بـ "ه" (مثال: مشكلة -> مشكله)
 * 2. الألف المقصورة في نهاية الكلمة: استبدال "ى" بـ "ي"
 * 3. الألف المهموزة: توحيد أ / إ / آ إلى "ا"
 * 4. الأسماء المركبة: عبد الله -> عبدالله, عبد الرحمن -> عبدالرحمن, عبد الرحيم -> عبدالرحيم
 */

export function normalizeCaseTitle(text: string): string {
  if (!text) return '';

  let normalized = text.trim();

  // قاعدة 3: توحيد الألفات المهموزة أ، إ، آ إلى ا
  normalized = normalized.replace(/[أإآ]/g, 'ا');

  // قاعدة 4: الأسماء المركبة (عبد + الاسم المعرف بأل)
  normalized = normalized.replace(/عبد\s+الله/g, 'عبدالله');
  normalized = normalized.replace(/عبد\s+الرحمن/g, 'عبدالرحمن');
  normalized = normalized.replace(/عبد\s+الرحيم/g, 'عبدالرحيم');
  normalized = normalized.replace(/عبد\s+الحميد/g, 'عبدالحميد');
  normalized = normalized.replace(/عبد\s+العاطي/g, 'عبدالعاطي');
  normalized = normalized.replace(/عبد\s+المنعم/g, 'عبدالمنعم');
  normalized = normalized.replace(/عبد\s+الخالق/g, 'عبدالخالق');
  normalized = normalized.replace(/عبد\s+الراضي/g, 'عبدالراضي');
  normalized = normalized.replace(/عبد\s+العظيم/g, 'عبدالعظيم');
  normalized = normalized.replace(/عبد\s+الصمد/g, 'عبدالصمد');
  normalized = normalized.replace(/عبد\s+الرازق/g, 'عبدالرازق');
  normalized = normalized.replace(/عبد\s+المعطي/g, 'عبدالمعطي');
  normalized = normalized.replace(/عبد\s+ربه/g, 'عبدربه');
  normalized = normalized.replace(/عبد\s+الصادق/g, 'عبدالصادق');

  // معالجة الكلمات لكل كلمة على حدة لنهاية الكلمة
  const words = normalized.split(/\s+/);
  const processedWords = words.map(word => {
    let w = word;
    // قاعدة 1: التاء المربوطة في نهاية الكلمة تستبدل بـ ه
    if (w.endsWith('ة')) {
      w = w.slice(0, -1) + 'ه';
    }
    // قاعدة 2: الألف المقصورة في نهاية الكلمة تستبدل بـ ي
    if (w.endsWith('ى')) {
      w = w.slice(0, -1) + 'ي';
    }
    return w;
  });

  return processedWords.join(' ');
}

/**
 * التحقق من الاسم الثلاثي للمتصل (3 مقاطع عربية على الأقل)
 */
export function isValidArabicThreePartName(name: string): boolean {
  if (!name) return false;
  const parts = name.trim().split(/\s+/).filter(part => part.length >= 2);
  return parts.length >= 3;
}

/**
 * التحقق من رقم التسجيل الضريبي (9 أرقام بالضبط)
 */
export function isValidTaxRegistrationNumber(taxNumber: string): boolean {
  return /^\d{9}$/.test(taxNumber.trim());
}

/**
 * التحقق من رقم الهاتف (يقبل أي عدد من الأرقام دون اشتراط طول محدد)
 */
export function isValidPhone(phone: string): boolean {
  const digits = normalizeAsciiDigits(phone || '').replace(/\D/g, '');
  return digits.length > 0;
}

/**
 * تحويل الأرقام العربية/الفارسية إلى أرقام إنجليزية (0-9) لكتابتها دائماً من اليسار لليمين
 */
export function normalizeAsciiDigits(text: string): string {
  if (!text) return '';
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * توحيد اتجاه كتابة الأرقام الناتجة عن التسجيل الصوتي لتُكتب من اليسار لليمين (LTR) دائماً
 * مع تحويل أي أرقام عربية/هندية (٠-٩) إلى أرقام لاتينية (0-9) ودمج الأرقام المتتالية المفصولة بمسافات فردية
 */
export function normalizeVoiceDigitsLtr(text: string): string {
  if (!text) return '';
  let out = normalizeAsciiDigits(text)
    // إزالة علامات الاتجاه الخفية التي قد تعكس الرقم أثناء الإملاء
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

  // دمج متتاليات الأرقام المنفردة الناتجة عن إملاء الأرقام الصوتية مثل "0 1 0 2" -> "0102"
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/(\d)[ \t]+(\d)/g, '$1$2');
  }

  return out;
}

/**
 * التحقق من الرقم القومي المصري (اختياري، وفي حال إدخاله يجب أن يكون 14 رقماً)
 */
export function isValidEgyptianNationalId(nationalId: string): boolean {
  const clean = normalizeAsciiDigits(nationalId || '').replace(/[\s-]/g, '').trim();
  if (!clean) return true;
  return /^\d{14}$/.test(clean);
}

