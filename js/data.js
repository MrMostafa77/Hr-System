// Initial offline seed data for the HR Management System.
// Firestore becomes the shared source of truth after the first authenticated load.
window.INITIAL_DATA = {
  employees: [
      {id:'e1', fullname:'سارة عبدالله القحطاني', idnum:'1098765432', civilreg:'', nationality:'سعودية', dob:'1994-03-12', gender:'أنثى',
       iddate_issue:'2020-01-01', idtime_issue:'', iddate_expiry:'2027-01-01', idplace:'جدة', phone:'0501234567', email:'sara.q@example.com',
       address:'جدة - حي الروضة', emname:'عبدالله القحطاني', emphone:'0559876543',
       empcode:'EMP-1001', jobtitle:'محاسبة أولى', dept:'المالية', manager:'خالد العتيبي', startdate:'2022-06-01',
       contracttype:'دائم', contractstatus:'دائم', contractduration:12, contractend:'2027-06-01',
       basicsalary:6500, housing:1300, transport:500, otherallow:200, gosi:487.5, otherded:0, bankname:'مصرف الراجحي', iban:'SA0380000000608010167519'},
      {id:'e2', fullname:'ماجد محمد الحربي', idnum:'1123456789', civilreg:'', nationality:'سعودي', dob:'1990-11-05', gender:'ذكر',
       iddate_issue:'2019-05-10', idtime_issue:'', iddate_expiry:'2026-10-15', idplace:'الرياض', phone:'0567891234', email:'majed.h@example.com',
       address:'الرياض - حي النخيل', emname:'محمد الحربي', emphone:'0551122334',
       empcode:'EMP-1002', jobtitle:'مشرف عمليات', dept:'العمليات', manager:'سارة القحطاني', startdate:'2021-02-15',
       contracttype:'دائم', contractstatus:'دائم', contractduration:12, contractend:'2026-11-01',
       basicsalary:5200, housing:1040, transport:400, otherallow:0, gosi:390, otherded:0, bankname:'بنك الجزيرة', iban:'SA5320000009321595809940'}
    ],
  regions: ['مكة المكرمة','جدة','الطائف','الرياض','المدينة المنورة','الدمام','الخبر','الظهران','الهفوف','الأحساء','القطيف','حائل','تبوك','أبها','خميس مشيط','جازان','نجران','الباحة','عرعر','سكاكا','بريدة','عنيزة','الرس','ينبع','رابغ','القنفذة','الليث','رنية','بيشة','محايل عسير','صبيا','أبو عريش','شرورة','القريات','دومة الجندل','وادي الدواسر','الخرج','الجبيل','رأس تنورة','حفر الباطن','الجبيل الصناعية','القصيم','الطائف الصناعية'],
  settings: {company:'شركة فخر الجزيرة للحراسات الأمنية', cr:'4031263286', manager:'زهير سفر القثامي', managerphone:'0537030099'}
};
