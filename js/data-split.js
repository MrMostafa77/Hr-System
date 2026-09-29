// تقسيم حالة النظام إلى: بيانات عامة (hr_system/main) + بيانات مالية (hr_finance/main).
// البيانات المالية لا يقرؤها إلا المدير أو المستخدم الذي لديه صلاحية "finance" (تفرضها قواعد Firestore).
// الدوال هنا نقية (بدون Firebase) حتى يمكن اختبارها: merge(split(state)) == state.
(function(root){
  'use strict';

  // ===== الحقول المالية لكل نوع =====
  const EMP_FIN = ['basicsalary','housingPct','housing','transportPct','transport','otherallowPct','otherallow',
    'otherded','gosi','lastwage','bankname','iban','accountno','bankcode','bankAccountType',
    'delegate_name','delegate_memo','holder_name','ibans','ibanHistory','salaryHistory','payHistory'];

  // المشروع: ما يبقى عاماً (بيانات تعريفية + أعداد فقط)، وكل ما عداه مالي
  const PROJ_GENERAL = ['id','name','region','cr','vatNo','address','phones','emails','repId','repName',
    'guards','guardsFemale','supervisors','managers','patrols','devices','uniforms','cones'];
  const ITEM_GROUPS = ['revenueItems','costItems'];      // {key:[{type,quantity,unit,...}]}
  const ITEM_GENERAL = ['type','quantity'];               // الباقي (unit, medAnnual...) مالي

  // التغطية: المبالغ والحسابات البنكية مالية
  const COV_FIN = ['amount','amountManual','projectGuardSalary','iban','bank','accountno','holder','delegated','delegateHolder'];

  // العقد: النص الكامل المُنشأ يحتوي الراتب
  const CONTRACT_FIN = ['customHtml'];

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

  function pick(obj, keys){ const g = {}, f = {}; Object.keys(obj || {}).forEach(k => { (keys.includes(k) ? f : g)[k] = obj[k]; }); return { g, f }; }

  // ---------- split ----------
  function splitEmployee(e){ const { g, f } = pick(e, EMP_FIN); return { g, f }; }

  function splitProject(p){
    const g = {}, f = {};
    Object.keys(p || {}).forEach(k => {
      if(ITEM_GROUPS.includes(k) && isObj(p[k])){
        g[k] = {}; f[k] = {};
        Object.keys(p[k]).forEach(key => {
          const rows = Array.isArray(p[k][key]) ? p[k][key] : [];
          g[k][key] = rows.map(r => { const o = {}; ITEM_GENERAL.forEach(x => { if(r && x in r) o[x] = r[x]; }); return o; });
          f[k][key] = rows.map(r => { const o = {}; Object.keys(r || {}).forEach(x => { if(!ITEM_GENERAL.includes(x)) o[x] = r[x]; }); return o; });
        });
      }else if(PROJ_GENERAL.includes(k)) g[k] = p[k];
      else f[k] = p[k];
    });
    return { g, f };
  }

  function splitList(list, fields){
    const general = [], fin = {};
    (Array.isArray(list) ? list : []).forEach(x => {
      const { g, f } = pick(x, fields);
      general.push(g);
      if(Object.keys(f).length && x && x.id != null) fin[x.id] = f;
    });
    return { general, fin };
  }

  function split(state){
    state = state || {};
    const general = { ...state };
    const finance = {};

    const emps = [], empFin = {};
    (Array.isArray(state.employees) ? state.employees : []).forEach(e => {
      const { g, f } = splitEmployee(e); emps.push(g);
      if(Object.keys(f).length && e && e.id != null) empFin[e.id] = f;
    });
    general.employees = emps; finance.employees = empFin;

    const projs = [], projFin = {};
    (Array.isArray(state.projects) ? state.projects : []).forEach(p => {
      const { g, f } = splitProject(p); projs.push(g);
      if(Object.keys(f).length && p && p.id != null) projFin[p.id] = f;
    });
    general.projects = projs; finance.projects = projFin;

    const cov = splitList(state.coverage, COV_FIN);
    general.coverage = cov.general; finance.coverage = cov.fin;

    const con = splitList(state.contracts, CONTRACT_FIN);
    general.contracts = con.general; finance.contracts = con.fin;

    finance.payrollRecords = state.payrollRecords && typeof state.payrollRecords === 'object' ? state.payrollRecords : {};
    finance.projectAccounts = Array.isArray(state.projectAccounts) ? state.projectAccounts : [];
    delete general.payrollRecords; delete general.projectAccounts;

    general.schema = 2;
    finance.schema = 2;
    return { general: clone(general), finance: clone(finance) };
  }

  // ---------- merge ----------
  function mergeList(list, finMap){
    return (Array.isArray(list) ? list : []).map(x => (finMap && x && finMap[x.id]) ? { ...x, ...finMap[x.id] } : x);
  }

  function mergeProject(g, f){
    if(!f) return g;
    const out = { ...g };
    Object.keys(f).forEach(k => {
      if(ITEM_GROUPS.includes(k) && isObj(f[k])){
        const groups = { ...(g[k] || {}) };
        Object.keys(f[k]).forEach(key => {
          const gRows = Array.isArray(groups[key]) ? groups[key] : [];
          const fRows = f[k][key] || [];
          const n = Math.max(gRows.length, fRows.length);
          groups[key] = Array.from({ length: n }, (_, i) => ({ ...(gRows[i] || {}), ...(fRows[i] || {}) }));
        });
        out[k] = groups;
      }else out[k] = f[k];
    });
    return out;
  }

  // finance قد تكون null لمن لا يملك صلاحية المالية: تُرجع البيانات العامة كما هي
  function merge(general, finance){
    const state = { ...(general || {}) };
    delete state.schema;
    if(!finance) return { ...state, payrollRecords: {}, projectAccounts: [] };
    state.employees = mergeList(state.employees, finance.employees);
    state.projects = (Array.isArray(state.projects) ? state.projects : []).map(p => mergeProject(p, finance.projects && finance.projects[p.id]));
    state.coverage = mergeList(state.coverage, finance.coverage);
    state.contracts = mergeList(state.contracts, finance.contracts);
    state.payrollRecords = finance.payrollRecords || {};
    state.projectAccounts = finance.projectAccounts || [];
    return state;
  }

  // هل هذه الوثيقة بالنسق القديم (كل شيء داخل main)؟
  const isLegacy = general => !!general && general.schema !== 2;

  root.HRSplit = { split, merge, isLegacy, EMP_FIN, COV_FIN, CONTRACT_FIN, PROJ_GENERAL };
  if(typeof module !== 'undefined' && module.exports) module.exports = root.HRSplit;
})(typeof window !== 'undefined' ? window : globalThis);
