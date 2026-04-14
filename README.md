# كُتُب

مكتبة عربية ثابتة مبنية على `Astro` و`Pagefind` للنشر السريع على `Cloudflare Pages`.

## التشغيل

```bash
npm install
npm run dev
```

## البناء

```bash
npm run build
```

أثناء `dev` و`build` يتم أولًا تشغيل `npm run sync-content` لتوليد الفصول من المصادر canonical، ثم
يقوم Astro بإنتاج الصفحات داخل `dist/` ثم يقوم Pagefind بإنشاء فهرس البحث داخل المجلد نفسه.

إذا وُجد `canonicalSource` للكتاب، تُنسخ نسخة Markdown أيضًا إلى `public/downloads/<slug>.md` لتكون
قابلة للتنزيل مباشرة من الموقع.

## هيكل المحتوى

- `src/data/books/*.json`: بيانات الكتب
- `src/data/chapters/<book>/*.md`: فصول الكتب
- `sources/turath/*.meta.json`: بيانات تراث والفهارس
- `sources/turath/*.book.json`: المصدر الآلي الخام للصفحات
- `sources/turath/*.md`: المصدر canonical الكامل للكتب المستوردة
- `src/generated/chapters/<book>/*.md`: فصول مولدة آليًا من المصدر canonical

## إضافة كتاب جديد

1. أضف ملف بيانات جديدًا داخل `src/data/books/`.
2. إذا كان الكتاب سيأتي من ملف canonical واحد، ضع مساره في `canonicalSource`.
3. شغّل `npm run sync-content` لتوليد الفصول أو `npm run build` لتوليدها مع فهرس البحث.

## استيراد من تراث

```bash
npm run import:turath -- 8180
```

هذا الأمر يحفظ:

- ملف Markdown كامل للقراءة البشرية
- ملف `*.meta.json` للفهرسة والعناوين
- ملف `*.book.json` كنص آلي خام للصفحات

## ملاحظة عن البحث

صفحة البحث تعمل بعد البناء فقط لأن ملفات Pagefind لا تُولد أثناء `astro dev`.
