# montry-general

Skill عام لأي مستخدم لإنشاء ريلز بالذكاء الاصطناعي - بدون صوت، بحركة Reveal، وخاتمة مقفلة.

## التثبيت

### Claude / Codex / Antigravity
1. حمّل `montry-general.zip`
2. في Claude: Load a plugin -> اختر الملف
3. في Codex: ضع المجلد في جهازك ووجّه الأداة إلى مساره:
```
اقرأ المهارة من: ./montry-general/skills/template-reels/
```

### ChatGPT
لا يقبل ZIP. استخدم Project + انسخ محتوى `skills/template-reels/SKILL.md` في تعليمات Project.

## كيف تخصصه لعلامتك؟

افتح `skills/template-reels/brand.json` وغيّر 3 أشياء فقط:
1. `brand_name` - اسم علامتك
2. `colors` - ألوانك الأربعة
3. `logo_file` - ضع ملف شعارك 360×360 مكان `logo-360.svg`

لا تغيّر بنية الخاتمة. غيّر القيم فقط.

## القواعد الثابتة

- فيديو: 1080×1920، 60fps، بدون صوت (صامت)
- حركة: Reveal من اليسار إلى اليمين، كل كلمة 0.4 ثانية، مسح ناعم قبل كل مشهد
- الخاتمة: 4 عناصر معاً، تبقى حتى نهاية الفيديو، لا يُحذف أي منها
- إذا كان ملف الشعار مفقوداً، توقف ولا تحذفه
- QC: مشاكل فقط

## بنية المجلد

```
montry-general/
  README.md
  skills/
    montry/SKILL.md
    template-reels/
      SKILL.md
      template.html
      logo-360.svg (مثال - استبدله بشعارك)
      brand.json
    motion-builder/SKILL.md
    qc-checker/SKILL.md
```

## الترخيص

MIT - مجاني للاستخدام الشخصي والتجاري.
# montry-general
