HR Management System — GitHub + Firebase

البنية:
- index.html: الواجهة الرئيسية.
- css/style.css: التنسيقات.
- js/app.js: منطق النظام.
- js/data.js: بيانات ابتدائية ثابتة (فارغة من الموظفين وبيانات الشركة عمداً).
- js/firebase-config.js: إعدادات Firebase (الملف الوحيد الذي يتغير لكل عميل) + مفتاح App Check الاختياري.
- js/firebase-init.js: تسجيل الدخول وFirestore والمزامنة اللحظية.
- js/access.js: المستخدمون والصلاحيات + النسخ الاحتياطي والاسترجاع + قياس حجم البيانات (للمدير).
- js/permissions.js, js/data-split.js: الصلاحيات وتقسيم البيانات عام/مالي.
- firestore.rules: قواعد الأمان (تُنشر مع النظام). storage.rules: منع كامل (Storage غير مستخدم).
- DEPLOY_NEW_CLIENT_AR.md: خطوات تسليم النظام لشركة جديدة بمشروع Firebase منفصل.

التشغيل على Firebase Hosting:
  firebase login
  firebase deploy --only hosting,firestore:rules

التشغيل على GitHub Pages:
1. ارفع محتويات المشروع إلى Repository (لا ترفع ملفات zip أو ملفات hr-backup*.json).
2. فعّل GitHub Pages، وأضف النطاق في Firebase Authentication > Settings > Authorized domains.
3. انشر firestore.rules (من الأمر أعلاه أو يدوياً من تبويب Rules).

بنية البيانات في Firestore:
    hr_system/main               : البيانات العامة (بدون رواتب/بنوك/أسعار)
    hr_system/main/employee_files: مرفقات الموظفين (base64) — لمن لديه تبويب شؤون الموظفين أو المالية أو المدير
    hr_finance/main              : الرواتب والآيبان وأسعار المشاريع ومسيرات الرواتب وحسابات المشاريع ونص العقود
    hr_finance/backup_v1         : نسخة احتياطية من الوثيقة القديمة قبل الترحيل
    hr_users/{uid}               : صلاحيات كل مستخدم (role, views, finance, disabled)
    hr_meta/access               : علامة أن أول مدير أُنشئ (يُسمح بإنشائه ببريد محدد في firestore.rules فقط)

مهم:
- حد Firestore لحجم المستند الواحد 1 MB. شاشة «المستخدمون والصلاحيات» تعرض نسبة الاستهلاك.
- خذ نسخة احتياطية دورية من نفس الشاشة، واحفظها بعيداً عن GitHub.
- لإضافة حقل مالي جديد: عدّله في js/data-split.js (EMP_FIN / COV_FIN / CONTRACT_FIN / PROJ_GENERAL).
