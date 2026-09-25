(async function(){
  "use strict";
  const STORAGE_KEY = 'hr_employees_v1';
  const THEME_KEY = 'hr_theme_v1';
  const ATT_KEY = 'hr_attendance_v1';
  const PEN_KEY = 'hr_penalties_v1';
  const COV_KEY = 'hr_coverage_v1';
  const SET_KEY = 'hr_settings_v1';
  const REG_KEY = 'hr_regions_v1';
  const PROJECT_KEY = 'hr_projects_v1';
  const DEPT_KEY = 'hr_departments_v1';
  const CONTRACT_KEY = 'hr_contracts_v1';
  const COMMENCEMENT_KEY = 'hr_commencements_v1';
  const PROJECT_ACCOUNT_KEY = 'hr_project_accounts_v1';
  const ATT_CODES = ['','ح','غ','ج','ط','راحة','اضافي','انسحاب','عيد'];
  let employees = [];
  let attendance = {};   // { "YYYY-MM": { empId: { day: code } } }
  let penalties = [];    // [{id, empId, date, type, days, notes}]
  let coverage = [];     // [{id, guardId, guardName, shift, location, date, absent, status, amount, holder, iban, bank, paystatus, paydate, notes}]
  let settings = {company:'', cr:'', manager:'', managerphone:''};
  let regions = [];
  let projects = [];
  let departments = [];
  let contracts = [];
  let commencements = [];
  let projectAccounts = [];
  let currentView = 'dashboard';
  let currentProfileId = null;
  let pendingDeleteId = null;
  let currentDocType = 'contract';
  let currentContractId = null;
  let newContractMode = false;
  let pendingEmployeeFiles = {};
  const EMPLOYEE_FILE_TYPES = [
    {key:'contractCopy', label:'تحميل نسخة العقد'},
    {key:'idCopy', label:'تحميل صورة الهوية'},
    {key:'nationalAddress', label:'تحميل العنوان الوطني'},
    {key:'cv', label:'تحميل الـ CV'},
    {key:'commencement', label:'تحميل مباشرة العمل'},
    {key:'delegationMemo', label:'تحميل مذكرة التفويض'},
    {key:'criminalRecord', label:'تحميل صحيفة السوابق'},
    {key:'bankIban', label:'تحميل الايبان البنكي'},
    {key:'guaranteeCertificate', label:'شهادة كفالة حضورية'}
  ];

  function readLocal(key, fallback){
    try{
      const raw=localStorage.getItem(key);
      return raw===null ? fallback : JSON.parse(raw);
    }catch(e){ return fallback; }
  }
  function writeLocal(key,value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }
  function localState(){
    let projects = readLocal(PROJECT_KEY, []);
    if(!projects.length){
      try{
        const oldClients = readLocal('hr_clients_v1', []);
        oldClients.forEach(c=>(c.projects||[]).forEach(p=>projects.push({
          id:'p'+Date.now()+Math.random().toString(36).slice(2,7),
          name:p.name||'',region:p.region||'',basic:p.basic||0,housing:p.housing||0,
          transport:p.transport||0,other:p.other||0,guards:Number(p.guards)||0,
          supervisors:Number(p.supervisors)||0,managers:Number(p.managers)||0,
          patrols:Number(p.patrols)||0,includeBreaks:!!p.includeBreaks,notes:p.notes||''
        })));
      }catch(e){}
    }
    return {
      employees: readLocal(STORAGE_KEY, window.INITIAL_DATA?.employees ? structuredClone(window.INITIAL_DATA.employees) : []),
      attendance: readLocal(ATT_KEY, {}),
      penalties: readLocal(PEN_KEY, []),
      coverage: readLocal(COV_KEY, []),
      settings: readLocal(SET_KEY, window.INITIAL_DATA?.settings ? {...window.INITIAL_DATA.settings} : {company:'',cr:'',manager:'',managerphone:''}),
      regions: readLocal(REG_KEY, window.INITIAL_DATA?.regions ? structuredClone(window.INITIAL_DATA.regions) : []),
      projects,
      departments: readLocal(DEPT_KEY, []),
      contracts: readLocal(CONTRACT_KEY, []),
      commencements: readLocal(COMMENCEMENT_KEY, []),
      projectAccounts: readLocal(PROJECT_ACCOUNT_KEY, [])
    };
  }
  function applyState(state){
    employees = Array.isArray(state?.employees) ? state.employees : [];
    attendance = state?.attendance && typeof state.attendance==='object' ? state.attendance : {};
    penalties = Array.isArray(state?.penalties) ? state.penalties : [];
    coverage = Array.isArray(state?.coverage) ? state.coverage : [];
    settings = state?.settings && typeof state.settings==='object' ? state.settings : {company:'',cr:'',manager:'',managerphone:''};
    regions = Array.isArray(state?.regions) ? state.regions : [];
    projects = Array.isArray(state?.projects) ? state.projects : [];
    departments = Array.isArray(state?.departments) ? state.departments : [];
    contracts = Array.isArray(state?.contracts) ? state.contracts : [];
    commencements = Array.isArray(state?.commencements) ? state.commencements : [];
    projectAccounts = Array.isArray(state?.projectAccounts) ? state.projectAccounts : [];
    if(!departments.length && employees.length){
      const map={}; employees.forEach(e=>{const d=String(e.dept||'').trim(); if(!d)return; if(!map[d])map[d]={id:'d'+Math.random().toString(36).slice(2,9),name:d,jobs:[]}; const j=String(e.jobtitle||'').trim(); if(j&&!map[d].jobs.includes(j))map[d].jobs.push(j);}); departments=Object.values(map);
    }
  }
  function currentState(){
    return {employees,attendance,penalties,coverage,settings,regions,projects,departments,contracts,commencements,projectAccounts};
  }
  let cloudSaveTimer = null;
  let cloudApplying = false;
  let forceOperationalReset = false;
  function persistLocal(){
    writeLocal(STORAGE_KEY,employees); writeLocal(ATT_KEY,attendance);
    writeLocal(PEN_KEY,penalties); writeLocal(COV_KEY,coverage); writeLocal(SET_KEY,settings);
    writeLocal(REG_KEY,regions); writeLocal(PROJECT_KEY,projects); writeLocal(DEPT_KEY,departments); writeLocal(CONTRACT_KEY,contracts); writeLocal(COMMENCEMENT_KEY,commencements); writeLocal(PROJECT_ACCOUNT_KEY,projectAccounts);
  }
  function persistCloud(message='تم حفظ التغييرات بنجاح'){
    persistLocal();
    if(message) showToast(message);
    if(!window.FB?.saveState || cloudApplying) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer=setTimeout(()=>window.FB.saveState(currentState()).catch(err=>{
      console.error('Firestore save failed:',err);
      showToast('تم الحفظ محليًا، وتعذر مزامنة التغييرات مع قاعدة البيانات');
    }),120);
  }
  function loadEmployees(){
    const state=localState();
    applyState({...state, employees: state.employees || []});
  }
  function saveEmployees(){ persistCloud(); try{renderProjectCapacity(); renderProjects();}catch(e){} }
  function loadAux(){
    const state=localState();
    attendance=state.attendance; penalties=state.penalties; coverage=state.coverage;
    settings=state.settings; regions=state.regions; projects=state.projects; departments=state.departments||[]; contracts=state.contracts||[]; commencements=state.commencements||[]; projectAccounts=state.projectAccounts||[];
    if(!departments.length && employees.length){ const map={}; employees.forEach(e=>{const d=String(e.dept||'').trim(); if(!d)return; if(!map[d])map[d]={id:'d'+Math.random().toString(36).slice(2,9),name:d,jobs:[]}; const j=String(e.jobtitle||'').trim(); if(j&&!map[d].jobs.includes(j))map[d].jobs.push(j);}); departments=Object.values(map); }
    persistLocal();
  }
  function saveAttendance(){ persistCloud(); }
  function savePenalties(){ persistCloud(); }
  function saveCoverage(){ persistCloud(); }
  function saveSettings(){ persistCloud(); }
  function saveRegions(){ persistCloud(); }
  function saveProjects(){ persistCloud(); }
  function saveDepartments(){ persistCloud(); }
  function saveContracts(){ persistCloud(); }
  function saveCommencements(){ persistCloud(); }
  function saveProjectAccounts(){ persistCloud(); }
  

  function fmt(n){ n = Number(n)||0; return n.toLocaleString('ar-SA', {maximumFractionDigits:2}); }
  function daysUntil(dateStr){
    if(!dateStr) return null;
    const d = new Date(dateStr+'T00:00:00');
    if(isNaN(d)) return null;
    const now = new Date(); now.setHours(0,0,0,0);
    return Math.round((d-now)/86400000);
  }
  function initials(name){
    const parts = (name||'').trim().split(/\s+/);
    return (parts[0]?.[0]||'') + (parts[1]?.[0]||'');
  }
  function netSalary(e){
    return (Number(e.basicsalary)||0)+(Number(e.housing)||0)+(Number(e.transport)||0)+(Number(e.otherallow)||0)-(Number(e.otherded)||0);
  }
  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(showToast._h);
    showToast._h = setTimeout(()=>t.classList.remove('show'), 2200);
  }

  /* ===== regions / projects ===== */
  function renderRegions(){
    const el=document.getElementById('regionsList');
    el.innerHTML=regions.map((r,i)=>`<div class="master-item"><div><b>${escapeHtml(r.name||r)}</b>${r.notes?`<small>${escapeHtml(r.notes)}</small>`:''}</div><div><button class="btn btn-sm" data-region-edit="${i}">تعديل</button> <button class="btn btn-sm btn-danger" data-region-del="${i}">حذف</button></div></div>`).join('');
    el.querySelectorAll('[data-region-edit]').forEach(b=>b.onclick=()=>{const r=regions[Number(b.dataset.regionEdit)];document.getElementById('regionName').value=r.name||r;document.getElementById('regionNotes').value=r.notes||'';document.getElementById('regionForm').dataset.edit=String(b.dataset.regionEdit);});
    el.querySelectorAll('[data-region-del]').forEach(b=>b.onclick=()=>{if(confirm('حذف المنطقة؟')){regions.splice(Number(b.dataset.regionDel),1);saveRegions();renderRegions();refreshRegionSelects();renderProjects();}});
  }
  const projectKinds={
    managers:'مدير مشروع', supervisors:'مشرفين امن', guards:'حارس امن', guardsFemale:'حارسات امن', patrols:'سيارات ( دوريات )', devices:'اجهزة اتصالات', uniforms:'بدل امن', extras:'اقماع وملحقات', adminEmployees:'موظفين اداريين', other:'اخرى'
  };
  const roleCapacityLabels={guards:'حراس الأمن',guardsFemale:'حارسات الأمن',supervisors:'المشرفين',managers:'مدراء المشاريع',patrols:'الدوريات'};
  function money(v){return `${fmt(Number(v)||0)} ريال`;}

  /* ===== التأمينات الاجتماعية (في تكاليف المشروع) ===== */
  const SI_GUARD_RATE=10.75, SI_COMPANY_RATE=12.75;   // نسبة حصة الحارس / حصة الشركة (%)
  const siRoles=['guards','guardsFemale','supervisors','managers'];
  const SI_MIN_SALARY=4000;
  function socialInsuranceComplianceIssues(costItems, enabled=true){
    if(!enabled) return [];
    const issues=[];
    siRoles.forEach(key=>{
      (costItems?.[key]||[]).forEach((r,i)=>{
        const qty=Number(r.quantity)||0;
        const unit=Number(r.unit)||0;
        if(qty>0 && unit>0 && unit<SI_MIN_SALARY) issues.push({key,index:i,name:projectKinds[key],qty,unit});
      });
    });
    return issues;
  }
  function socialInsuranceComplianceHtml(costItems, enabled=true){
    const issues=socialInsuranceComplianceIssues(costItems,enabled);
    if(!issues.length) return '';
    const names=[...new Set(issues.map(x=>x.name))].join('، ');
    return `<div class="pj-si-warning"><b>⚠ مخالفة محتملة للتأمينات الاجتماعية</b><div>يوجد ${escapeHtml(names)} بتكلفة للفرد أقل من ${money(SI_MIN_SALARY)}. الحد الأدنى للراتب المضاف عند تفعيل التأمينات الاجتماعية هو ${money(SI_MIN_SALARY)}.</div>${issues.map(x=>`<div class="pj-si-warning-row"><span>${escapeHtml(x.name)}${x.qty>1?` × ${fmt(x.qty)}`:''}</span><b>${money(x.unit)} للفرد</b></div>`).join('')}</div>`;
  }
  function renderSocialInsuranceCompliance(){
    const box=document.getElementById('projectSiComplianceAlert'); if(!box)return;
    const on=!!document.getElementById('projectSiToggle')?.checked;
    box.innerHTML=socialInsuranceComplianceHtml(getDetailData('cost'),on);
    box.hidden=!box.innerHTML;
  }
  function socialInsuranceCalc(){
    const data=getDetailData('cost'); const rows=[];
    siRoles.forEach(key=>(data[key]||[]).forEach(r=>rows.push({key,name:projectKinds[key],salary:Number(r.unit)||0,qty:Number(r.quantity)||0})));
    const sum=rate=>rows.reduce((a,r)=>a+r.salary*rate/100*r.qty,0);
    return {rows,guardTotal:sum(SI_GUARD_RATE),companyTotal:sum(SI_COMPANY_RATE)};
  }
  function renderSocialInsurance(){
    const box=document.getElementById('projectSocialInsurance'); if(!box)return;
    const on=!!document.getElementById('projectSiToggle')?.checked;
    box.hidden=!on;
    if(!on){box.innerHTML='';return;}
    const calc=socialInsuranceCalc();
    const build=(cls,title,rate,total)=>`<div class="project-si-box ${cls}">
        <div class="si-head"><h4>${title}</h4><span class="si-rate">${rate}%</span></div>
        ${calc.rows.length?calc.rows.map(r=>`<div class="si-row">
          <div class="si-role"><b>${r.name}</b><small>الأساسي + السكن: ${money(r.salary)} × ${fmt(r.qty)}</small></div>
          <div class="si-amt"><span>للفرد</span><b>${money(r.salary*rate/100)}</b></div>
          <div class="si-amt"><span>للعدد</span><b>${money(r.salary*rate/100*r.qty)}</b></div>
        </div>`).join(''):'<div class="si-empty">أضف حارس أمن وراتبه في التكاليف لحساب المبلغ.</div>'}
        <div class="si-total"><span>إجمالي ${title}</span><b>${money(total)}</b></div>
      </div>`;
    box.innerHTML=`<div class="project-si-title">التأمينات الاجتماعية <small>محسوبة على الأساسي + السكن</small></div>
      <div class="project-si-grid">${build('si-guard','حصة الحارس',SI_GUARD_RATE,calc.guardTotal)}${build('si-company','حصة الشركة',SI_COMPANY_RATE,calc.companyTotal)}</div>`;
  }
  const ampBoxes=a=>`<div class="pd-amt-boxes"><div class="project-calc-box"><span>للفرد</span><b class="${a}">0 ريال</b></div><div class="project-calc-box"><span>للعدد</span><b class="${a}-n">0 ريال</b></div></div>`;
  function detailCard(mode,key,title,data={}){
    const isRevenue=mode==='revenue';
    const isType=key==='devices'||key==='uniforms'||key==='other';
    const qty=Number(data.quantity||data.count||0)||0;
    const unit=Number(data.unit||data.price||data.salary||0)||0;
    const type=data.type||'';
    const num=(c,l,v,st='0.01')=>`<div class="field"><label>${l}</label><input type="number" class="${c}" min="0" step="${st}" value="${v}"></div>`;
    const typeField=isType?`<div class="field"><label>النوع / البيان</label><input class="pd-type" value="${escapeAttr(type)}" placeholder="اكتب النوع أو البيان"></div>`:'';
    if(isRevenue){
      const before=qty*unit, vat=before*(vatRate()/100), after=before+vat;
      return `<div class="project-detail-card" data-project-detail="revenue-${key}" data-key="${key}">
        <div class="project-detail-head"><h4>${title}</h4>${isType?`<button type="button" class="small-btn danger project-remove-detail">×</button>`:''}</div>
        <div class="field-grid project-detail-fields project-revenue-fields">
          ${typeField}${num('pd-qty','العدد',qty,'1')}${num('pd-unit','الإيراد / للفرد',unit)}
          <div class="project-calc-box"><span>الإجمالي قبل الضريبة</span><b class="pd-before">${money(before)}</b></div>
          <div class="project-calc-box"><span>الضريبة</span><b class="pd-vat">${money(vat)}</b></div>
          <div class="project-calc-box"><span>الإجمالي بعد الضريبة</span><b class="pd-after">${money(after)}</b></div>
        </div>
      </div>`;
    }
    return `<div class="project-detail-card" data-project-detail="cost-${key}" data-key="${key}">
      <div class="project-detail-head"><h4>${title}</h4>${isType?`<button type="button" class="small-btn danger project-remove-detail">×</button>`:''}</div>
      <div class="field-grid project-detail-fields project-cost-fields">
        ${typeField}${num('pd-qty','العدد',qty,'1')}${num('pd-unit','التكلفة / للفرد',unit)}
        <div class="project-calc-box"><span>الإجمالي</span><b class="pd-total">${money(qty*unit)}</b></div>
      </div>
    </div>`;
  }
  function refreshSalaryCard(card){ return; }
  function getDetailData(mode){
    const out={};
    document.querySelectorAll(`#project${mode==='revenue'?'Revenue':'Cost'}Details .project-detail-card`).forEach(card=>{
      const key=card.dataset.key; if(!out[key])out[key]=[];
      out[key].push({type:card.querySelector('.pd-type')?.value||'',quantity:Number(card.querySelector('.pd-qty')?.value)||0,unit:Number(card.querySelector('.pd-unit')?.value)||0});
    });
    return out;
  }
  function renderDynamicDetails(mode,data={}){
    const container=document.getElementById(mode==='revenue'?'projectRevenueDetails':'projectCostDetails'); if(!container)return;
    const toggles=[...document.querySelectorAll(`[data-project-${mode}-toggle]`)].filter(x=>x.checked).map(x=>x.dataset[`project${mode[0].toUpperCase()+mode.slice(1)}Toggle`]);
    const out=[];
    toggles.forEach(key=>{
      let rows=data[key];
      if(!Array.isArray(rows)||!rows.length) rows=[{}];
      rows.forEach((row,i)=>{
        const title=(key==='devices'||key==='uniforms') ? `${projectKinds[key]} — نوع ${i+1}` : projectKinds[key];
        out.push(detailCard(mode,key,title,row));
      });
      if(key==='devices'||key==='uniforms'||key==='other') out.push(`<button type="button" class="small-btn add-type project-add-detail" data-add-detail="${mode}-${key}">+ إضافة نوع ${projectKinds[key]}</button>`);
    });
    container.innerHTML=out.join('');
    bindProjectDetailInputs();
  }
  function bindProjectDetailInputs(){
    document.querySelectorAll('#projectRevenueDetails .project-detail-card,#projectCostDetails .project-detail-card').forEach(card=>{
      const recalc=()=>{
        const q=Number(card.querySelector('.pd-qty')?.value)||0,u=Number(card.querySelector('.pd-unit')?.value)||0;
        const before=q*u, vat=before*(vatRate()/100);
        if(card.querySelector('.pd-total')) card.querySelector('.pd-total').textContent=money(before);
        if(card.querySelector('.pd-before')) card.querySelector('.pd-before').textContent=money(before);
        if(card.querySelector('.pd-vat')) card.querySelector('.pd-vat').textContent=money(vat);
        if(card.querySelector('.pd-after')) card.querySelector('.pd-after').textContent=money(before+vat);
        updateProjectTotals();
      };
      card.querySelectorAll('input').forEach(i=>i.addEventListener('input',recalc));
      card.querySelector('.project-remove-detail')?.addEventListener('click',()=>{card.remove();updateProjectTotals();});
    });
    document.querySelectorAll('.project-add-detail').forEach(btn=>btn.onclick=()=>{
      const [mode,key]=btn.dataset.addDetail.split('-');
      const box=document.getElementById(mode==='revenue'?'projectRevenueDetails':'projectCostDetails');
      const title=projectKinds[key]+' — نوع '+(box.querySelectorAll(`.project-detail-card[data-key="${key}"]`).length+1);
      btn.insertAdjacentHTML('beforebegin',detailCard(mode,key,title,{})); bindProjectDetailInputs();
    });
  }
  function selectedKeys(mode){return [...document.querySelectorAll(`[data-project-${mode}-toggle]:checked`)].map(x=>x.dataset[`project${mode[0].toUpperCase()+mode.slice(1)}Toggle`]);}
  function updateProjectTotals(){
    let detailRevenue=0, detailCost=0;
    ['revenue','cost'].forEach(mode=>{
      const box=document.getElementById(mode==='revenue'?'projectRevenueDetails':'projectCostDetails');
      if(!box)return;
      const total=[...box.querySelectorAll('.project-detail-card')].reduce((a,card)=>a+(Number(card.querySelector('.pd-qty')?.value)||0)*(Number(card.querySelector('.pd-unit')?.value)||0),0);
      box.dataset.total=total;
      if(mode==='revenue') detailRevenue=total; else detailCost=total;
    });
    const siCo=document.getElementById('projectSiToggle')?.checked?socialInsuranceCalc().companyTotal:0;
    const totalRevenue=detailRevenue, totalCost=sumRows(projectBreakdown().cost).ex, profit=totalRevenue-totalCost;
    const revData=getDetailData('revenue'), costData=getDetailData('cost');
    const humanKeys=['guards','guardsFemale','supervisors','managers','patrols'];
    const people=humanKeys.reduce((sum,key)=>{
      const rows=(costData[key]?.length?costData[key]:revData[key])||[];
      return sum+rows.reduce((n,row)=>n+(Number(row.quantity)||0),0);
    },0);
    const divisor=people>0?people:1;
    const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=money(val);};
    set('projectSummaryRevenuePerson',totalRevenue/divisor); set('projectSummaryRevenueTotal',totalRevenue);
    set('projectSummaryCostPerson',totalCost/divisor); set('projectSummaryCostTotal',totalCost);
    set('projectSummaryProfitPerson',profit/divisor); set('projectSummaryProfitTotal',profit);
    document.querySelectorAll('#projectRevenueDetails .project-detail-card').forEach(card=>{const q=Number(card.querySelector('.pd-qty')?.value)||0,u=Number(card.querySelector('.pd-unit')?.value)||0,b=q*u,v=b*vatRate()/100; if(card.querySelector('.pd-before'))card.querySelector('.pd-before').textContent=money(b); if(card.querySelector('.pd-vat'))card.querySelector('.pd-vat').textContent=money(v); if(card.querySelector('.pd-after'))card.querySelector('.pd-after').textContent=money(b+v);});
    document.querySelectorAll('#projectCostDetails .project-detail-card').forEach(refreshSalaryCard);
    renderBreakdowns(); renderProjectCapacity();
     renderSocialInsuranceCompliance();
  }


  /* ===== طي / فرد المستطيلات ===== */
  document.querySelectorAll('#view-projects .card').forEach(card=>{
    const head=card.querySelector(':scope > .project-section-head, :scope > .project-summary-title, :scope > h3'); if(!head)return;
    card.classList.add('pj-collapsible'); head.classList.add('pj-head'); head.tabIndex=0; head.setAttribute('role','button');
    (head.matches('.project-section-head')?head.querySelector('h3'):head).insertAdjacentHTML('afterbegin','<span class="pj-arrow" aria-hidden="true">▾</span> ');
    const toggle=()=>{card.classList.toggle('collapsed'); head.setAttribute('aria-expanded',String(!card.classList.contains('collapsed')));};
    head.setAttribute('aria-expanded','true');
    head.addEventListener('click',e=>{ if(e.target.closest('button'))return; toggle(); });
    head.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target===head){e.preventDefault();toggle();} });
  });

  /* ===== بيانات التواصل المتعددة ===== */
  const pjRow=(kind,val='')=>`<div class="multi-row">${kind==='phone'?'<span class="pj-pfx" dir="ltr">+966</span>':''}<input class="pj-${kind}" dir="ltr" ${kind==='phone'?'inputmode="numeric" maxlength="9" placeholder="5XXXXXXXX"':'type="email" placeholder="name@example.com"'} value="${escapeAttr(val)}"><button type="button" class="small-btn danger pj-rm">×</button></div>`;
  function setMulti(kind,arr){const box=document.getElementById(kind==='phone'?'projectPhones':'projectEmails'); if(!box)return; const l=(arr&&arr.length)?arr:['']; box.innerHTML=l.map(v=>pjRow(kind,kind==='phone'?String(v).replace(/^\+966/,''):v)).join('');}
  function getMulti(kind){return [...document.querySelectorAll('.pj-'+kind)].map(i=>{let v=i.value.trim(); if(kind==='phone'){v=normalizeDigits(v).replace(/^0+/,'').slice(0,9); return v?'+966'+v:'';} return v;}).filter(Boolean);}
  document.getElementById('addProjectPhone')?.addEventListener('click',()=>document.getElementById('projectPhones').insertAdjacentHTML('beforeend',pjRow('phone')));
  document.getElementById('addProjectEmail')?.addEventListener('click',()=>document.getElementById('projectEmails').insertAdjacentHTML('beforeend',pjRow('email')));
  document.getElementById('view-projects')?.addEventListener('click',e=>{const b=e.target.closest('.pj-rm'); if(!b)return; const row=b.closest('.multi-row'); if(row.parentElement.children.length>1) row.remove(); else row.querySelector('input').value='';});
  document.getElementById('view-projects')?.addEventListener('input',e=>{if(e.target.matches('.pj-phone'))e.target.value=normalizeDigits(e.target.value).slice(0,9);});
  setMulti('phone',[]);setMulti('email',[]);

  /* ===== جداول الإيرادات/التكاليف/الملخص + سعة المشروع ===== */
  const vatRate=()=>{const v=parseFloat(document.getElementById('projectVat')?.value);return isNaN(v)?15:v;};
  function medicalTotal(cv){return siRoles.reduce((a,key)=>a+(Array.isArray(cv[key])?cv[key].reduce((s,r)=>s+(Number(r.quantity)||0)*(Number(r.medAnnual)||0)/12,0):0),0);}
  // التكلفة الحقيقية للفرد = إجمالي الراتب − حصة الموظف + حصة الشركة (تأمينات) + التأمين الطبي (بدون ضريبة)
  function rowRealCost(key,r,siOn,medOn){
    const u=Number(r.unit)||0; if(!siRoles.includes(key)) return u;
    let c=u;
    if(siOn){const base=r.basic!=null?(Number(r.basic)||0)*(1+(Number(r.hPct)||0)/100):u; c+=base*(SI_COMPANY_RATE-SI_GUARD_RATE)/100;}
    if(medOn) c+=(Number(r.medAnnual)||0)/12;
    return c;
  }
  function breakdownFrom(rv,cv,vat,siOn,medOn){
    const k=1+vat/100, rev=[], cost=[], q=r=>Number(r.quantity)||0;
    Object.keys(projectKinds).forEach(key=>{
      if(Array.isArray(rv[key])){const ex=rv[key].reduce((a,r)=>a+q(r)*(Number(r.unit)||0),0);rev.push({k:key,name:projectKinds[key],n:rv[key].reduce((a,r)=>a+q(r),0),ex,inc:ex*k});}
      if(Array.isArray(cv[key])){const ex=cv[key].reduce((a,r)=>a+q(r)*rowRealCost(key,r,siOn,medOn),0);cost.push({k:key,name:projectKinds[key],n:cv[key].reduce((a,r)=>a+q(r),0),ex,inc:ex});}
    });
    return {rev,cost};
  }
  function projectBreakdown(){
    return breakdownFrom(getDetailData('revenue'),getDetailData('cost'),vatRate(),!!document.getElementById('projectSiToggle')?.checked,!!document.getElementById('projectMedToggle')?.checked);
  }
  function profitRows(rev,cost){
    return [...new Set([...rev,...cost].map(r=>r.k))].map(key=>{
      const a=rev.find(r=>r.k===key)||{n:0,ex:0,inc:0}, b=cost.find(r=>r.k===key)||{n:0,ex:0,inc:0};
      return {k:key,name:a.name||b.name||projectKinds[key],n:a.n||b.n,ex:a.ex-b.ex,inc:a.inc-b.inc};
    });
  }
  const sumRows=rows=>rows.reduce((a,r)=>({n:a.n+r.n,ex:a.ex+r.ex,inc:a.inc+r.inc}),{n:0,ex:0,inc:0});
  function bdTable(title,rows,person,vat=true,cm=false){
    const t=sumRows(rows), per=(ex,n)=>n?money(ex/n):'—', cnt=r=>(r.k==='si'||r.k==='med')?'—':fmt(r.n), cols=2+(person?1:0)+1+(vat?2:0);
    const cells=r=>`<td class="mono">${money(r.ex)}</td>${vat?`<td class="mono">${money(r.inc-r.ex)}</td><td class="mono">${money(r.inc)}</td>`:''}`;
    return `<div class="pj-bd-title">${title}</div><div class="table-wrap"><table class="payroll-table pj-bd"><thead><tr><th>الفئة</th><th>العدد</th>${person?`<th>${cm?'الفرد':'للفرد'}</th>`:''}<th>${cm?'كل الأفراد':'الإجمالي'}</th>${vat?'<th>الضريبة</th><th>الإجمالي بالضريبة</th>':''}</tr></thead><tbody>${
      rows.map(r=>`<tr><td>${r.name}</td><td class="mono">${cnt(r)}</td>${person?`<td class="mono">${per(r.ex,r.n)}</td>`:''}${cells(r)}</tr>`).join('')||`<tr><td colspan="${cols}" class="empty-note">لا توجد بنود.</td></tr>`
    }<tr class="pj-bd-total"><td>الإجمالي</td><td class="mono">${fmt(t.n)}</td>${person?`<td class="mono">${per(t.ex,t.n)}</td>`:''}${cells(t)}</tr></tbody></table></div>`;
  }
  function renderBreakdowns(){
    const {rev,cost}=projectBreakdown(), set=(id,h)=>{const e=document.getElementById(id);if(e)e.innerHTML=h;};
    set('projectRevenueBreakdown',bdTable('إجمالي إيرادات المشروع الشهرية',rev,false,true));
    set('projectCostBreakdown',bdTable('إجمالي تكاليف المشروع الشهرية (الرواتب)',cost,true,false,true)+'<div class="project-summary-note">التكلفة الحقيقية للفرد = إجمالي الراتب − حصة الموظف + حصة الشركة (التأمينات الاجتماعية) + التأمين الطبي، بدون ضريبة.</div>');
    const profit=profitRows(rev,cost);
    set('projectSummaryDetail',bdTable('تفصيل الإيرادات بالفئات (شهريًا)',rev,true,true)+bdTable('تفصيل التكاليف بالفئات (شهريًا)',cost,true,false,true)+bdTable('هامش الربح بالفئات (شهريًا)',profit,true,true));
  }

  /* ===== عرض المشروع (قراءة فقط) ===== */
  function closeProjectView(){document.getElementById('pjViewModal')?.remove();}
  function showProjectView(p){
    closeProjectView();
    const vat=p.vatRate??15, {rev,cost}=breakdownFrom(p.revenueItems||{},p.costItems||{},vat,!!p.siEnabled,!!p.medEnabled);
    const kv=(l,v)=>`<div class="pv-item"><span>${l}</span><b>${escapeHtml(String(v||'—'))}</b></div>`;
    const sal=[]; siRoles.forEach(key=>(p.costItems?.[key]||[]).forEach(r=>{
      const hP=r.hPct??25,tP=r.tPct??38.5,oth=Number(r.other)||0,u=Number(r.unit)||0,b=r.basic!=null?Number(r.basic)||0:Math.round(u/(1+(hP+tP)/100)*100)/100, q=Number(r.quantity)||0;
      sal.push(`<tr><td>${projectKinds[key]}</td><td class="mono">${fmt(q)}</td><td class="mono">${money(b)}</td><td class="mono">${money(b*hP/100)} <small>(${hP}%)</small></td><td class="mono">${money(b*tP/100)} <small>(${tP}%)</small></td><td class="mono">${money(oth)}</td><td class="mono">${money(u)}</td><td class="mono">${money(u*q)}</td></tr>`);
    }));
    const counts=projectEmployeeCounts(p.name,null), caps=Object.fromEntries(Object.keys(roleCapacityLabels).map(k=>[k,projectRoleCapacity(p,k)]));
    const capRows=Object.keys(roleCapacityLabels).filter(k=>caps[k]>0).map(k=>{const over=(counts[k]||0)-caps[k];return `<tr class="${over>0?'pj-over-row':''}"><td>${roleCapacityLabels[k]}</td><td class="mono">${fmt(caps[k])}</td><td class="mono">${fmt(counts[k]||0)}</td><td class="mono">${over>0?'زيادة '+fmt(over):fmt(caps[k]-(counts[k]||0))}</td></tr>`;});
    const projectEmployees=employees.filter(e=>sameProjectName(e.project,p.name));
    const today=new Date(); today.setHours(0,0,0,0);
    const alertRows=[];
    projectEmployees.forEach(e=>{
      const problems=[];
      if(e.iddate_expiry){const d=new Date(e.iddate_expiry+'T00:00:00'); if(!Number.isNaN(d.getTime()) && d<=today) problems.push('الإقامة منتهية');}
      const ci=employeeContractInfo(e.id); if(!ci.contract) problems.push('لا يوجد عقد');
      const hasComm=commencements.some(c=>c.empId===e.id && sameProjectName(c.project,p.name) && c.startDate);
      if(!hasComm) problems.push('لا توجد مباشرة عمل');
      if(problems.length) alertRows.push(`<tr><td><b>${escapeHtml(e.fullname||'—')}</b></td><td>${escapeHtml(e.empcode||'—')}</td><td>${escapeHtml(e.jobtitle||'—')}</td><td>${problems.map(x=>`<span class="project-employee-alert">⚠ ${x}</span>`).join(' ')}</td></tr>`);
    });
    const alerts=[...projectOverList(p.name,caps).map(o=>`<div class="pj-over">⚠ تنبيه: عدد ${o.label} زيادة بمقدار ${fmt(o.over)}</div>`), ...((alertRows.length?[]:[]))].join('');
    const employeeAlerts=`<div class="project-alert-panel"><div class="project-alert-head"><h3>شاشة التنبيهات</h3><span class="pill ${alertRows.length?'pill-danger':'pill-gray'}">${alertRows.length?`${alertRows.length} موظف يحتاج مراجعة`:'لا توجد تنبيهات'}</span></div>${alertRows.length?`<div class="table-wrap project-alert-table-wrap"><table class="payroll-table project-alert-table"><thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>الوظيفة</th><th>التنبيهات</th></tr></thead><tbody>${alertRows.join('')}</tbody></table></div>`:`<div class="project-alert-ok">✓ لا توجد تنبيهات على موظفي المشروع بخصوص الإقامة أو العقد أو المباشرة.</div>`}</div>`;
    const tr=sumRows(rev), tc=sumRows(cost);
    const el=document.createElement('div'); el.id='pjViewModal'; el.className='pj-modal';
    el.innerHTML=`<div class="pj-modal-box" role="dialog" aria-modal="true"><div class="pj-modal-head"><h3>${escapeHtml(p.name||'')}</h3><div><button class="btn btn-sm" data-pv-edit>تعديل</button> <button class="btn btn-sm" data-pv-close>إغلاق ✕</button></div></div>
      <div class="pj-modal-body">
        <div class="pj-bd-title">البيانات الأساسية</div>
        <div class="pv-grid">${kv('المنطقة',p.region)}${kv('السجل التجاري',p.cr)}${kv('الرقم الضريبي',p.vatNo)}${kv('العنوان',p.address)}${kv('أرقام التواصل',(p.phones||[]).join(' ، '))}${kv('إيميلات التواصل',(p.emails||[]).join(' ، '))}${kv('اسم ممثل الشركة',p.repName)}${kv('هوية ممثل الشركة',p.repId)}${kv('نسبة الضريبة',vat+'%')}${kv('التأمينات الاجتماعية',p.siEnabled?'مفعّلة':'غير مفعّلة')}${kv('التأمين الطبي',p.medEnabled?'مفعّل':'غير مفعّل')}</div>
        ${socialInsuranceComplianceHtml(p.costItems||{},!!p.siEnabled)}
        ${bdTable('الإيرادات الشهرية',rev,false,true)}
        ${sal.length?`<div class="pj-bd-title">رواتب المشروع</div><div class="table-wrap"><table class="payroll-table pj-bd"><thead><tr><th>الفئة</th><th>العدد</th><th>الأساسي</th><th>السكن</th><th>المواصلات</th><th>بدلات أخرى</th><th>إجمالي الراتب / فرد</th><th>الإجمالي للعدد</th></tr></thead><tbody>${sal.join('')}</tbody></table></div>`:''}
        <div class="pj-bd-title">سعة المشروع</div>${alerts}
        <div class="table-wrap"><table class="payroll-table pj-bd"><thead><tr><th>البند</th><th>السعة</th><th>المضاف فعليًا</th><th>المتبقي</th></tr></thead><tbody>${capRows.join('')||'<tr><td colspan="4" class="empty-note">لا توجد سعة محددة.</td></tr>'}</tbody></table></div>
        ${employeeAlerts}
      </div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click',e=>{ if(e.target===el||e.target.closest('[data-pv-close]')) closeProjectView(); if(e.target.closest('[data-pv-edit]')){closeProjectView();document.querySelector(`[data-project-edit="${p.id}"]`)?.click();} });
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProjectView();});
  function projectOverList(name,caps){   // caps: {key:capacity}
    const counts=name?projectEmployeeCounts(name,null):{}, out=[];
    Object.keys(roleCapacityLabels).forEach(k=>{const cap=Number(caps[k])||0, over=(counts[k]||0)-cap; if(cap>0&&over>0) out.push({k,over,label:roleCapacityLabels[k]});});
    return out;
  }
  function renderProjectCapacity(){
    const box=document.getElementById('projectCapacity'); if(!box)return;
    const name=document.getElementById('projectName')?.value.trim()||'', cv=getDetailData('cost');
    const counts=name?projectEmployeeCounts(name,null):{}, caps={}, rows=[];
    Object.keys(projectKinds).forEach(k=>{ if(!cv[k])return; const cap=cv[k].reduce((a,r)=>a+r.quantity,0); caps[k]=cap;
      const human=roleCapacityLabels[k]!==undefined, used=human?(counts[k]||0):null, over=human?used-cap:0;
      rows.push(`<tr class="${over>0?'pj-over-row':''}"><td>${projectKinds[k]}</td><td class="mono">${fmt(cap)}</td><td class="mono">${human?fmt(used):'—'}</td><td class="mono">${human?fmt(Math.max(cap-used,0)):'—'}</td></tr>`); });
    const alerts=projectOverList(name,caps).map(o=>`<div class="pj-over">⚠ تنبيه: عدد ${o.label} زيادة بمقدار ${fmt(o.over)}</div>`).join('');
    box.innerHTML=alerts+`<div class="table-wrap"><table class="payroll-table pj-bd"><thead><tr><th>البند</th><th>السعة (حسب التكاليف)</th><th>المضاف فعليًا</th><th>المتبقي</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="4" class="empty-note">أضف بنودًا في التكاليف.</td></tr>'}</tbody></table></div>`;
  }

  function projectTotal(p){return Number(p.costTotal)||0;}
  function projectRevenueTotal(p){return Number(p.revenueTotal)||0;}
  function toggleProjectConfig(){ updateProjectTotals(); }
  function resetProjectForm(){
    document.getElementById('projectForm').reset(); document.getElementById('projectId').value='';
    document.querySelectorAll('[data-project-revenue-toggle],[data-project-cost-toggle]').forEach(c=>c.checked=(c.dataset.projectRevenueToggle==='guards'||c.dataset.projectCostToggle==='guards'));
    renderDynamicDetails('revenue',{});renderDynamicDetails('cost',{});
    refreshRegionSelects();
    document.getElementById('projectRegion').value='';setMulti('phone',[]);setMulti('email',[]);
    updateProjectTotals();toggleProjectConfig();
  }
  function resetProjectSection(section){
    if(section==='basic'){
      ['projectName','projectCR','projectVatNo','projectAddress','projectRepId','projectRepName'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('projectVat').value='15'; const siB=document.getElementById('projectSiToggle'); if(siB) siB.checked=false; const medB=document.getElementById('projectMedToggle'); if(medB) medB.checked=false; setMulti('phone',[]);setMulti('email',[]);
      refreshRegionSelects();
      document.getElementById('projectRegion').value='';
    }else if(section==='revenue'){
      document.querySelectorAll('[data-project-revenue-toggle]').forEach(c=>c.checked=c.dataset.projectRevenueToggle==='guards');
      renderDynamicDetails('revenue',{});
    }else if(section==='cost'){
      document.querySelectorAll('[data-project-cost-toggle]').forEach(c=>c.checked=c.dataset.projectCostToggle==='guards');
      renderDynamicDetails('cost',{});
    }
    updateProjectTotals();
  }
  function renderProjects(){
    const q=(document.getElementById('projectSearch')?.value||'').trim().toLowerCase();
    const list=projects.filter(p=>!q||[p.name,p.region].some(v=>String(v||'').toLowerCase().includes(q)));
    document.getElementById('projectCount').textContent=`${list.length} مشروع`;
    const body=document.getElementById('projectsTableBody');
    body.innerHTML=list.map(p=>`<tr><td><b>${escapeHtml(p.name||'—')}</b>${projectOverList(p.name,Object.fromEntries(Object.keys(roleCapacityLabels).map(k=>[k,projectRoleCapacity(p,k)]))).map(o=>`<div class="pj-over">⚠ عدد ${o.label} زيادة بمقدار ${fmt(o.over)}</div>`).join('')}${socialInsuranceComplianceHtml(p.costItems||{},!!p.siEnabled)}</td><td>${escapeHtml(p.region||'—')}</td><td class="mono">${Number(p.guards)||0}</td><td class="mono">${money(Number(p.revenueGuard)||0)}</td><td class="mono">${money(Number(p.costGuard)||0)}</td><td class="mono"><b>${money(p.revenueTotal)}</b></td><td class="mono"><b>${money(p.costTotal)}</b></td><td><div class="row-actions"><button class="btn btn-sm" data-project-view="${p.id}">عرض</button><button class="btn btn-sm" data-project-edit="${p.id}">تعديل</button><button class="btn btn-sm btn-danger" data-project-del="${p.id}">حذف</button></div></td></tr>`).join('')||'<tr><td colspan="8" class="empty-note">لا توجد مشاريع مطابقة.</td></tr>';
    body.querySelectorAll('[data-project-edit]').forEach(b=>b.onclick=()=>{
      const p=projects.find(x=>x.id===b.dataset.projectEdit);if(!p)return;
      document.getElementById('projectId').value=p.id;document.getElementById('projectName').value=p.name||'';document.getElementById('projectRegion').value=p.region||'';
      const sv=(id,v)=>document.getElementById(id).value=v??''; sv('projectCR',p.cr);sv('projectVatNo',p.vatNo);sv('projectAddress',p.address);sv('projectRepId',p.repId);sv('projectRepName',p.repName);sv('projectVat',p.vatRate??15);setMulti('phone',p.phones);setMulti('email',p.emails);
      const rev=p.revenueItems||{}, cost=p.costItems||{};
      document.querySelectorAll('[data-project-revenue-toggle]').forEach(c=>c.checked=c.dataset.projectRevenueToggle==='guards' || Array.isArray(rev[c.dataset.projectRevenueToggle]));
      document.querySelectorAll('[data-project-cost-toggle]').forEach(c=>c.checked=c.dataset.projectCostToggle==='guards' || Array.isArray(cost[c.dataset.projectCostToggle]));
      const siEdit=document.getElementById('projectSiToggle'); if(siEdit) siEdit.checked=!!p.siEnabled; const medEdit=document.getElementById('projectMedToggle'); if(medEdit) medEdit.checked=!!p.medEnabled;
      renderDynamicDetails('revenue',rev);renderDynamicDetails('cost',cost);updateProjectTotals();window.scrollTo({top:0,behavior:'smooth'});
    });
    body.querySelectorAll('[data-project-view]').forEach(b=>b.onclick=()=>{const p=projects.find(x=>x.id===b.dataset.projectView); if(p)showProjectView(p);});
    body.querySelectorAll('[data-project-del]').forEach(b=>b.onclick=()=>{if(confirm('حذف المشروع؟')){projects=projects.filter(x=>x.id!==b.dataset.projectDel);saveProjects();renderProjects();refreshEmployeeProjectSelect();}});
  }
  function refreshRegionSelects(){
    const opts='<option value="">اختر المنطقة</option>'+regions.map(r=>`<option value="${escapeAttr(r.name||r)}">${escapeHtml(r.name||r)}</option>`).join('');
    const e=document.getElementById('projectRegion');if(e){const cur=e.value;e.innerHTML=opts;e.value=cur;}
    const r=document.getElementById('f_region');if(r){const cur=r.value;r.innerHTML=opts;r.value=cur;}
  }
  function refreshEmployeeProjectSelect(regionValue=''){
    const e=document.getElementById('f_project'); if(!e)return;
    const region=String(regionValue ?? document.getElementById('f_region')?.value ?? '').trim();
    const cur=e.value;
    const filtered=region ? projects.filter(p=>String(p.region||'').trim()===region) : projects;
    const curStillValid=filtered.some(p=>String(p.name||'')===String(cur));
    e.innerHTML='<option value="">اختر المشروع</option>'+filtered.map(p=>`<option value="${escapeAttr(p.name)}">${escapeHtml(p.name)}</option>`).join('');
    e.value=curStillValid?cur:'';
  }
    document.getElementById('regionForm').addEventListener('submit',ev=>{ev.preventDefault();const i=document.getElementById('regionForm').dataset.edit;const obj={name:document.getElementById('regionName').value.trim(),notes:document.getElementById('regionNotes').value.trim()};if(!obj.name)return;if(i!==undefined){regions[Number(i)]=obj;delete document.getElementById('regionForm').dataset.edit;}else regions.push(obj);saveRegions();ev.target.reset();renderRegions();refreshRegionSelects();showToast('تم حفظ المنطقة');});
  document.getElementById('addRegionBtn').onclick=()=>{document.getElementById('regionForm').reset();delete document.getElementById('regionForm').dataset.edit();window.scrollTo({top:0,behavior:'smooth'});};
  document.getElementById('addProjectBtn').onclick=()=>{resetProjectForm();window.scrollTo({top:0,behavior:'smooth'});};
  document.getElementById('newProjectEntryBtn').onclick=()=>{resetProjectForm();window.scrollTo({top:0,behavior:'smooth'});};
  document.getElementById('cancelProjectBtn').onclick=resetProjectForm;
  document.querySelectorAll('[data-project-section-reset]').forEach(btn=>btn.addEventListener('click',()=>resetProjectSection(btn.dataset.projectSectionReset)));
  document.getElementById('projectForm').addEventListener('submit',ev=>{
    ev.preventDefault();
    const revenueItems=getDetailData('revenue'), costItems=getDetailData('cost');
    const sumQty=(obj,key)=>Array.isArray(obj[key])?obj[key].reduce((a,r)=>a+(Number(r.quantity)||0),0):0;
    const unitFrom=(obj,key)=>Array.isArray(obj[key])&&obj[key][0]?Number(obj[key][0].unit)||0:0;
    const guards=sumQty(revenueItems,'guards');
    const guardsFemale=sumQty(revenueItems,'guardsFemale');
    const costGuards=sumQty(costItems,'guards')||guards;
    const costGuardsFemale=sumQty(costItems,'guardsFemale')||guardsFemale;
    const supervisorQty=sumQty(costItems,'supervisors')||sumQty(revenueItems,'supervisors');
    const managerQty=sumQty(costItems,'managers')||sumQty(revenueItems,'managers');
    const patrolQty=sumQty(costItems,'patrols')||sumQty(revenueItems,'patrols');
    const deviceQty=sumQty(costItems,'devices')||sumQty(revenueItems,'devices');
    const uniformQty=sumQty(costItems,'uniforms')||sumQty(revenueItems,'uniforms');
    const extraQty=sumQty(costItems,'extras')||sumQty(revenueItems,'extras');
    const guardSalary=unitFrom(costItems,'guards');
    const guardRevenue=unitFrom(revenueItems,'guards');
    const data={
      id:document.getElementById('projectId').value||'p'+Date.now(), name:document.getElementById('projectName').value.trim(), region:document.getElementById('projectRegion').value,
      cr:document.getElementById('projectCR').value.trim(), vatNo:document.getElementById('projectVatNo').value.trim(), address:document.getElementById('projectAddress').value.trim(), phones:getMulti('phone'), emails:getMulti('email'), repId:document.getElementById('projectRepId').value.trim(), repName:document.getElementById('projectRepName').value.trim(), vatRate:vatRate(), medEnabled:!!document.getElementById('projectMedToggle')?.checked,
      guards, guardsFemale, supervisors:supervisorQty, managers:managerQty, patrols:patrolQty, devices:deviceQty, uniforms:uniformQty, cones:extraQty,
      revenueGuard:guardRevenue, costGuard:guardSalary, revenueTotal:guards*guardRevenue, costTotal:costGuards*guardSalary,
      revenueItems, costItems, guardBasic:guardSalary, guardHousing:0, guardTransport:0, guardOther:0,
      supervisorBasic:unitFrom(costItems,'supervisors'), supervisorHousing:0, supervisorTransport:0, supervisorOther:0,
      managerBasic:unitFrom(costItems,'managers'), managerHousing:0, managerTransport:0, managerOther:0,
      projectCostGuards:costGuards, includeBreaks:false, socialInsurance:false, socialInsuranceRate:0, siEnabled:!!document.getElementById('projectSiToggle')?.checked, siGuardRate:SI_GUARD_RATE, siCompanyRate:SI_COMPANY_RATE, siGuardTotal:document.getElementById('projectSiToggle')?.checked?socialInsuranceCalc().guardTotal:0, siCompanyTotal:document.getElementById('projectSiToggle')?.checked?socialInsuranceCalc().companyTotal:0, patrolBilling:''
    };
    const allCostCards=[...document.querySelectorAll('#projectCostDetails .project-detail-card')];
    data.costTotal=allCostCards.reduce((a,c)=>a+(Number(c.querySelector('.pd-qty')?.value)||0)*(Number(c.querySelector('.pd-unit')?.value)||0),0);
    const allRevenueCards=[...document.querySelectorAll('#projectRevenueDetails .project-detail-card')];
    data.revenueTotal=allRevenueCards.reduce((a,c)=>a+(Number(c.querySelector('.pd-qty')?.value)||0)*(Number(c.querySelector('.pd-unit')?.value)||0),0);
    data.costTotal=sumRows(projectBreakdown().cost).ex;
    if(!data.name||!data.region){showToast('يرجى إدخال اسم المشروع واختيار المنطقة');return;}
    const existing=projects.find(x=>x.id===data.id);
    const capacityError=validateProjectCapacities(existing?existing.name:data.name,null,data);
    if(capacityError){showToast(capacityError);}
    const idx=projects.findIndex(x=>x.id===data.id);if(idx>=0)projects[idx]=data;else projects.push(data);
    saveProjects();refreshEmployeeProjectSelect();refreshDepartmentJobSelects();renderProjects();resetProjectForm();showToast(idx>=0?'تم تعديل المشروع':'تم إضافة المشروع');
  });
  function projectEmployeeTotal(projectName){
    return employees.filter(e=>sameProjectName(e.project,projectName)).length;
  }
  function projectCapacityTotal(p){
    return Object.keys(roleCapacityLabels).reduce((sum,k)=>sum+projectRoleCapacity(p,k),0);
  }
  function renderAllProjectsPage(){
    const q=(document.getElementById('allProjectsSearch')?.value||'').trim().toLowerCase();
    const list=projects.filter(p=>!q||[p.name,p.region].some(v=>String(v||'').toLowerCase().includes(q)));
    const body=document.getElementById('allProjectsTableBody');
    const count=document.getElementById('allProjectsCount');
    if(!body)return;
    if(count) count.textContent=`${list.length} مشروع`;
    body.innerHTML=list.map(p=>{
      const cap=projectCapacityTotal(p), emp=projectEmployeeTotal(p.name), over=emp>cap && cap>0;
      return `<tr class="all-project-row" data-all-project-row="${p.id}" title="دبل كليك لعرض المشروع">
        <td class="project-name-cell"><b>${escapeHtml(p.name||'—')}</b>${socialInsuranceComplianceHtml(p.costItems||{},!!p.siEnabled)}</td>
        <td>${escapeHtml(p.region||'—')}</td>
        <td class="mono">${fmt(cap)}</td>
        <td class="mono">${fmt(emp)}${over?`<span class="table-alert-dot" title="عدد الموظفين أكبر من سعة المشروع">⚠</span>`:''}</td>
        <td class="mono money-cell">${money(Number(p.revenueTotal)||0)}</td>
        <td class="mono money-cell">${money(Number(p.costTotal)||0)}</td>
        <td class="mono money-cell">${money((Number(p.revenueTotal)||0)-(Number(p.costTotal)||0))}</td>
        <td><div class="row-actions"><button class="btn btn-sm" data-all-project-view="${p.id}">عرض</button><button class="btn btn-sm" data-all-project-edit="${p.id}">تعديل</button><button class="btn btn-sm btn-danger" data-all-project-del="${p.id}">حذف</button></div></td>
      </tr>`;
    }).join('')||'<tr><td colspan="8" class="empty-note">لا توجد مشاريع مضافة.</td></tr>';
    body.querySelectorAll('[data-all-project-view]').forEach(b=>b.onclick=()=>{const p=projects.find(x=>x.id===b.dataset.allProjectView);if(p)showProjectView(p);});
    body.querySelectorAll('[data-all-project-row]').forEach(row=>row.ondblclick=()=>{const p=projects.find(x=>x.id===row.dataset.allProjectRow);if(p)showProjectView(p);});
    body.querySelectorAll('[data-all-project-edit]').forEach(b=>b.onclick=()=>{const p=projects.find(x=>x.id===b.dataset.allProjectEdit);if(p){switchView('projects');setTimeout(()=>{document.querySelector(`[data-project-edit="${p.id}"]`)?.click();},0);}});
    body.querySelectorAll('[data-all-project-del]').forEach(b=>b.onclick=()=>{if(confirm('حذف المشروع؟')){projects=projects.filter(x=>x.id!==b.dataset.allProjectDel);saveProjects();renderProjects();refreshEmployeeProjectSelect();renderAllProjectsPage();}});
  }
  document.getElementById('allProjectsBtn')?.addEventListener('click',()=>{switchView('allprojects');});
  document.getElementById('backToProjectsBtn')?.addEventListener('click',()=>{switchView('projects');});
  document.getElementById('allProjectsSearch')?.addEventListener('input',renderAllProjectsPage);
  document.getElementById('projectSearch').addEventListener('input',renderProjects);
  document.getElementById('projectSiToggle')?.addEventListener('change',()=>{
    updateProjectTotals();
    if(document.getElementById('projectSiToggle').checked && socialInsuranceComplianceIssues(getDetailData('cost'),true).length) showToast('⚠ يوجد راتب أقل من 4000 ريال ومخالف لحد التأمينات المحدد.');
  });
  document.getElementById('projectMedToggle')?.addEventListener('change',updateProjectTotals);
  ['projectVat','projectName'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateProjectTotals));
  document.querySelectorAll('[data-project-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    const tab=btn.dataset.projectTab;
    document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.toggle('active',b===btn));
    document.querySelectorAll('[data-project-panel]').forEach(p=>p.classList.toggle('active',p.dataset.projectPanel===tab));
    const rev=document.getElementById('projectRevenueDetails'), cost=document.getElementById('projectCostDetails');
    if(rev) rev.style.display=tab==='revenue'?'grid':'none';
    if(cost) cost.style.display=tab==='cost'?'grid':'none';
  }));
  document.querySelectorAll('[data-project-tab]').forEach(btn=>{ if(btn.dataset.projectTab==='basic') btn.style.display='none'; });
  renderDynamicDetails('revenue',{});renderDynamicDetails('cost',{});updateProjectTotals();  // عرض بطاقة الحارس فور فتح التبويب
  document.querySelectorAll('[data-project-revenue-toggle],[data-project-cost-toggle]').forEach(cb=>cb.addEventListener('change',()=>{const rv=getDetailData('revenue'),cv=getDetailData('cost');renderDynamicDetails('revenue',rv);renderDynamicDetails('cost',cv);updateProjectTotals();}));


  /* ===== Universal Excel / PDF / Word exports ===== */
  const exportableViews=['dashboard','regions','projects','allprojects','employees','departments','add','projectpromotions','employeepromotions','attendance','actions','coverage','documents','contracts','allcontracts','commencements','projectaccounts','reports'];
  function currentViewElement(){ return currentView ? document.getElementById('view-'+currentView) : null; }
  function exportFileBase(){
    const titles={dashboard:'الرئيسية',regions:'المناطق',projects:'المشاريع',allprojects:'كل المشاريع',employees:'الموظفين',departments:'الأقسام والوظائف',add:'إضافة موظف',attendance:'الحضور والانصراف',actions:'إجراءات الموظفين',coverage:'التغطيات',documents:'المستندات',contracts:'عقود الموظفين',allcontracts:'كل العقود',commencements:'مباشرات الموظفين',projectaccounts:'حسابات المشاريع',reports:'التقارير'};
    return titles[currentView]||'تصدير';
  }
  function exportCurrentExcel(){
    const el=currentViewElement(); if(!el)return;
    const clone=el.cloneNode(true);
    clone.querySelectorAll('button,input,select,textarea,svg,.no-print,.export-toolbar').forEach(n=>n.remove());
    const html=`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;direction:rtl}table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:6px}th{font-weight:bold}h1,h2,h3{margin:8px 0}</style></head><body>${clone.innerHTML}</body></html>`;
    const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download=exportFileBase()+'.xls'; document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url); showToast('تم تصدير التبويب بصيغة Excel');
  }
  function printCurrentForExport(){
    const isLandscape=['projects','allprojects','allcontracts','coverage'].includes(currentView);
    const id='exportPrintStyle'; document.getElementById(id)?.remove();
    const st=document.createElement('style'); st.id=id;
    st.textContent=`@media print{ @page{size:A4 ${isLandscape?'landscape':'portrait'} !important;margin:${isLandscape?'8mm':'10mm'} !important;} body *{visibility:hidden!important} #view-${currentView},#view-${currentView} *{visibility:visible!important} #view-${currentView}{display:block!important;position:static!important;width:100%!important;max-width:none!important} .no-print,.export-toolbar,.sidebar,.topbar-actions{display:none!important} .table-wrap{overflow:visible!important} }`;
    document.head.appendChild(st);
    const cleanup=()=>{document.getElementById(id)?.remove();window.removeEventListener('afterprint',cleanup)};
    window.addEventListener('afterprint',cleanup);
    window.print();
  }
  function exportCurrentWord(){
    const el=currentViewElement(); if(!el)return;
    const clone=el.cloneNode(true);
    clone.querySelectorAll('button,input,select,textarea,svg,.no-print,.export-toolbar').forEach(n=>n.remove());
    const html=`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:12mm}body{font-family:'JF Flat',Arial,sans-serif;direction:rtl;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:6px;vertical-align:top}h1,h2,h3{margin:8px 0}.card{border:1px solid #ddd;padding:10px;margin:8px 0}</style></head><body>${clone.innerHTML}</body></html>`;
    const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download=exportFileBase()+'.doc'; document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url); showToast('تم تصدير التبويب بصيغة Word');
  }
  function installExportButtons(){
    exportableViews.forEach(view=>{
      const section=document.getElementById('view-'+view); if(!section)return;
      const topbar=section.querySelector('.topbar'); if(!topbar)return;
      const actions=topbar.querySelector('.topbar-actions') || (()=>{const d=document.createElement('div');d.className='topbar-actions';topbar.appendChild(d);return d;})();
      if(actions.querySelector('.export-toolbar'))return;
      const wrap=document.createElement('div'); wrap.className='export-toolbar no-print';
      wrap.innerHTML='<button type="button" class="btn export-excel">EXCEL</button><button type="button" class="btn export-pdf">PDF</button><button type="button" class="btn export-word">WORD</button>';
      wrap.querySelector('.export-excel').addEventListener('click',exportCurrentExcel);
      wrap.querySelector('.export-pdf').addEventListener('click',printCurrentForExport);
      wrap.querySelector('.export-word').addEventListener('click',exportCurrentWord);
      actions.appendChild(wrap);
    });
  }
  installExportButtons();

  /* ===== navigation ===== */
  // Expose navigation and install a resilient early click handler so the
  // "إضافة موظف" screen remains reachable even if a later optional
  // initialization step fails.
  function switchView(view){
    currentView = view;
    try{ pjTabsSync(view); }catch(e){ console.error('tabs',e); }
    document.querySelector('main')?.classList.toggle('wide-data-view', view==='attendance' || view==='reports' || view==='projectaccounts');
    // Printing orientation for wide data screens. Projects, All Contracts and Coverage
    // are intentionally landscape so their full tables/columns fit on the printed page.
    document.body.classList.remove('print-landscape-projects','print-landscape-allprojects','print-landscape-allcontracts','print-landscape-coverage');
    if(view==='projects') document.body.classList.add('print-landscape-projects');
    if(view==='allprojects') document.body.classList.add('print-landscape-allprojects');
    if(view==='allcontracts') document.body.classList.add('print-landscape-allcontracts');
    if(view==='coverage') document.body.classList.add('print-landscape-coverage');
    // @page cannot be scoped to a normal selector in all browsers, so inject the
    // orientation rule only while one of the requested wide tabs is active.
    const printOrientationId='dynamicPrintOrientation';
    document.getElementById(printOrientationId)?.remove();
    const st=document.createElement('style');
    st.id=printOrientationId;
    const isLandscape=['projects','allprojects','allcontracts','coverage'].includes(view);
    st.textContent=`@media print { @page { size: A4 ${isLandscape?'landscape':'portrait'} !important; margin: ${isLandscape?'8mm':'10mm'} !important; } }`;
    document.head.appendChild(st);
    ['dashboard','regions','projects','allprojects','employees','departments','add','attendance','actions','coverage','documents','contracts','allcontracts','commencements','projectaccounts','reports'].forEach(v=>{
      document.getElementById('view-'+v).style.display = (v===view)?'':'none';
    });
    document.querySelectorAll('.navlink[data-view]').forEach(a=>{
      let active = a.dataset.view===view;
      if(view==='reports' && a.dataset.view==='reports') active = (a.dataset.report||'payroll') === (window.currentReport||'payroll');
      a.classList.toggle('active', active);
    });
    document.getElementById('sidebar').classList.remove('open');
    if(view==='dashboard') renderDashboard();
    if(view==='regions'){renderRegions();refreshRegionSelects();}
    if(view==='projects'){renderProjects();refreshRegionSelects();}
    if(view==='allprojects'){renderAllProjectsPage();}
    if(view==='employees') renderEmployeeTable();
    if(view==='departments') renderDepartments();
    if(view==='add'){
      const dept=document.getElementById('f_dept')?.value||'';
      const job=document.getElementById('f_jobtitle')?.value||'';
      refreshDepartmentJobSelects(dept,job);
      fillNationalityAndIssueRegion();
      refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
    }
    if(view==='attendance'){ renderAttendance(); }
    if(view==='actions'){ renderPenalties(); }
    if(view==='coverage') renderCoverage();
    if(view==='documents') renderDocuments();
    if(view==='contracts') renderContracts();
    if(view==='allcontracts') renderAllContracts();
    if(view==='commencements') renderCommencements();
    if(view==='projectaccounts') renderProjectAccount();
    if(view==='reports') renderReports();
    if(view==='reports'){
      const activeReport=document.querySelector('.nav-child[data-view="reports"].active');
      const titleMap={payroll:'تقارير الرواتب',employees:'تقارير الموظفين',projects:'تقارير المشاريع',coverage:'تقارير التغطيات'};
      const title=titleMap[activeReport?.dataset.report||'payroll']||'تقارير الرواتب';
      const h=document.querySelector('#view-reports .pagetitle h1');
      if(h) h.textContent=title;
    }
    window.scrollTo(0,0);
  }
  window.switchView = switchView;

  /* ===== تابات التبويبات (تبويب منفصل لكل شاشة مع الحفاظ على بياناتها) ===== */
  const PJ_TITLES={dashboard:'الرئيسية',regions:'المناطق',projects:'المشاريع',allprojects:'كل المشاريع',employees:'الموظفين',departments:'الأقسام والوظائف',add:'إضافة موظف',projectpromotions:'ترقيات المشاريع',employeepromotions:'ترقيات الموظفين',attendance:'الحضور والانصراف',actions:'إجراءات الموظفين',coverage:'التغطيات',documents:'المستندات',contracts:'عقود الموظفين',allcontracts:'كل العقود',commencements:'مباشرات الموظفين',projectaccounts:'حسابات المشاريع',reports:'التقارير'};
  const PJ_REPORTS={payroll:'تقارير الرواتب',employees:'تقارير الموظفين',projects:'تقارير المشاريع',coverage:'تقارير التغطيات'};
  const PJ_SAVE={add:['form','empForm'],projects:['form','projectForm'],regions:['form','regionForm'],departments:['form','departmentForm'],actions:['form','penaltyForm'],coverage:['form','coverageForm'],contracts:['btn','saveContractBtn'],commencements:['btn','saveCommencementBtn'],projectaccounts:['btn','saveProjectAccountBtn']};
  const pjTabs={open:[],dirty:new Set()};
  function pjTabOpen(v){return pjTabs.open.includes(v);}
  function pjTitle(v){return v==='reports'?(PJ_REPORTS[window.currentReport||'payroll']||PJ_TITLES.reports):(PJ_TITLES[v]||v);}
  function pjTabsSync(view){ if(!pjTabs.open.includes(view)) pjTabs.open.push(view); pjTabsRender(view); }
  function pjTabsRender(active){
    const bar=document.getElementById('pjTabs'); if(!bar)return; active=active||currentView;
    bar.innerHTML=pjTabs.open.map(v=>`<div class="pj-tab${v===active?' active':''}" data-tab="${v}" role="tab" aria-selected="${v===active}"><span class="pj-tab-title">${pjTitle(v)}${pjTabs.dirty.has(v)?' <i class="pj-dot" title="بيانات غير محفوظة">●</i>':''}</span>${PJ_SAVE[v]?`<button type="button" class="pj-tab-btn" data-tab-save="${v}" title="حفظ" aria-label="حفظ">💾</button>`:''}<button type="button" class="pj-tab-btn pj-tab-x" data-tab-close="${v}" title="إغلاق التبويب" aria-label="إغلاق">✕</button></div>`).join('');
    bar.querySelector('.pj-tab.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function pjSave(v){
    const t=PJ_SAVE[v]; if(!t)return;
    if(currentView!==v){ expandParentGroup(v); switchView(v); }
    setTimeout(()=>{ const el=document.getElementById(t[1]); if(!el)return; if(t[0]==='form') el.requestSubmit(); else el.click(); },60);
  }
  function pjResetView(v){
    if(v==='allprojects'){ document.getElementById('allProjectsSearch')?.setAttribute('value',''); }
    else if(v==='add') resetForm();
    else if(v==='projects') document.getElementById('cancelProjectBtn')?.click();
    else document.querySelectorAll('#view-'+v+' form').forEach(f=>f.reset());
  }
  function pjClose(v){
    if(pjTabs.dirty.has(v) && !confirm('هذا التبويب به بيانات لم تُحفظ بعد. هل تريد إغلاقه وتجاهلها؟')) return;
    const i=pjTabs.open.indexOf(v); if(i<0)return;
    pjTabs.open.splice(i,1); pjTabs.dirty.delete(v);
    try{ pjResetView(v); }catch(e){ console.error(e); }
    if(currentView===v){ const next=pjTabs.open[i]||pjTabs.open[i-1]||'dashboard'; expandParentGroup(next); switchView(next); }
    else pjTabsRender();
  }
  document.getElementById('pjTabs')?.addEventListener('click',e=>{
    const sv=e.target.closest('[data-tab-save]'), cl=e.target.closest('[data-tab-close]'), tab=e.target.closest('.pj-tab');
    if(sv){ pjSave(sv.dataset.tabSave); return; }
    if(cl){ pjClose(cl.dataset.tabClose); return; }
    if(tab && tab.dataset.tab!==currentView){ expandParentGroup(tab.dataset.tab); switchView(tab.dataset.tab); }
  });
  document.querySelector('main')?.addEventListener('input',e=>{
    const sec=e.target.closest('section[id^="view-"]'); if(!sec)return; const v=sec.id.slice(5);
    if(!PJ_SAVE[v]||e.target.type==='search')return;
    if(!(e.target.closest('form')||v==='contracts'||v==='projectaccounts'))return;
    if(!pjTabs.dirty.has(v)){ pjTabs.dirty.add(v); pjTabsRender(); }
  });
  const pjClean=e=>{ const sec=e.target.closest?.('section[id^="view-"]'); if(sec && pjTabs.dirty.delete(sec.id.slice(5))) pjTabsRender(); };
  document.addEventListener('submit',pjClean,true);
  ['saveContractBtn','saveProjectAccountBtn'].forEach(id=>document.getElementById(id)?.addEventListener('click',pjClean));
  pjTabsSync(currentView);
  if(!window.__hrNavFallbackInstalled){
    window.__hrNavFallbackInstalled = true;
    document.addEventListener('click', (ev)=>{
      const target = ev.target.closest?.('[data-view]');
      if(!target || target.classList.contains('nav-group-toggle')) return;
      const view = target.dataset.view;
      if(!view) return;
      ev.preventDefault();
      try{
        if(view==='add' && document.getElementById('f_id')?.value==='' && !pjTabOpen('add')) resetForm();
        expandParentGroup(view);
        switchView(view);
      }catch(err){
        console.error('Navigation error:', err);
        // Minimal fallback: always make the requested section visible.
        document.querySelectorAll('main > section[id^="view-"]').forEach(sec=>sec.style.display='none');
        const section=document.getElementById('view-'+view);
        if(section) section.style.display='';
      }
    }, true);
  }
  // ===== Collapsible sidebar groups =====
  document.querySelectorAll('.nav-group-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const group=btn.closest('.nav-group');
      group?.classList.toggle('expanded');
    });
  });
  function expandParentGroup(view){
    const child=document.querySelector(`.nav-child[data-view="${view}"]`);
    const group=child?.closest('.nav-group');
    if(group) group.classList.add('expanded');
  }
  document.querySelectorAll('[data-view]').forEach(el=>{
    el.addEventListener('click', (ev)=>{
      ev.preventDefault();
      if(el.classList.contains('nav-group-toggle')) return;
      const view = el.dataset.view;
      if(view==='reports') window.currentReport = el.dataset.report || 'payroll';
      if(view==='add' && !document.getElementById('f_id').value && !pjTabOpen('add')){
        resetForm();
      }
      expandParentGroup(view);
      switchView(view);
      const scrollTarget=el.dataset.scroll;
      if(scrollTarget){
        setTimeout(()=>document.getElementById(scrollTarget)?.scrollIntoView({behavior:'smooth',block:'start'}),120);
      }
    });
  });
  document.getElementById('menuBtn').addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('open'));
  document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('open')));
  document.getElementById('quickAddEmployee')?.addEventListener('click',(ev)=>{
    ev.preventDefault(); ev.stopPropagation();
    try{ if(!pjTabOpen('add')) resetForm(); }catch(err){ console.error('Add employee reset error:',err); }
    try{ expandParentGroup('add'); switchView('add'); }catch(err){
      console.error('Add employee navigation error:',err);
      document.querySelectorAll('main > section[id^=\"view-\"]').forEach(sec=>sec.style.display='none');
      const section=document.getElementById('view-add'); if(section) section.style.display='';
      currentView='add';
    }
  });
  document.querySelectorAll('[data-quick-view]').forEach(btn=>btn.addEventListener('click',()=>{
    const view=btn.dataset.quickView;
    if(view==='add' && !pjTabOpen('add')) resetForm();
    expandParentGroup(view);
    switchView(view);
    const trigger=btn.dataset.quickClick;
    if(trigger) setTimeout(()=>document.getElementById(trigger)?.click(),80);
  }));
  setInterval(updateDashboardClock,1000);

  /* ===== theme ===== */
  function applyTheme(){
    let t = null;
    try{ t = localStorage.getItem(THEME_KEY); }catch(e){}
    document.documentElement.setAttribute('data-theme', t==='light' ? 'light' : 'dark');
  }
  document.getElementById('themeToggle')?.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur==='dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  });

  /* ===== start a fresh data cycle ===== */
  async function resetOperationalData(){
    const ok = confirm('سيتم حذف بيانات التشغيل المدخلة فقط: الموظفين، المشاريع، العقود، الحضور والانصراف، الإجراءات، التغطيات، ومعلومات الحسابات المرتبطة بها.\n\nستبقى الأقسام والوظائف والمناطق وإعدادات النظام والمذكرات والمستندات كما هي.\n\nهل تريد المتابعة؟');
    if(!ok) return;
    const ok2 = confirm('تأكيد نهائي: هل تريد بالفعل بدء دورة بيانات جديدة؟ لا يمكن التراجع عن حذف البيانات التشغيلية.');
    if(!ok2) return;
    try{
      cloudApplying = true;
      forceOperationalReset = true;
      clearTimeout(cloudSaveTimer);

      // Remove uploaded employee files that belong to the employee records being cleared.
      const oldEmployees = Array.isArray(employees) ? employees.slice() : [];
      for(const emp of oldEmployees){
        const files = emp?.files && typeof emp.files==='object' ? emp.files : {};
        for(const entry of Object.values(files)){
          if(entry?.path && window.FB?.deleteEmployeeFile){
            try{ await window.FB.deleteEmployeeFile(entry.path); }catch(err){ console.warn('Could not delete employee file:',err); }
          }
        }
      }

      employees=[];
      attendance={};
      penalties=[];
      coverage=[];
      projects=[];
      contracts=[];
      commencements=[];
      projectAccounts=[];

      // Keep these system/setup data intact: settings, regions, departments/jobs.
      persistLocal();
      const freshState=currentState();
      if(window.FB?.saveState) await window.FB.saveState(freshState);
      applyState(freshState);
      persistLocal();

      renderRegions?.();
      renderProjects?.();
      renderDepartments?.();
      renderEmployeeTable?.();
      renderAttendanceAndPenalties?.();
      renderEmployeeFiles?.();
      switchView(currentView);
      showToast('تم بدء دورة بيانات جديدة مع الاحتفاظ بإعدادات النظام.');
    }catch(err){
      console.error('Operational data reset failed:',err);
      showToast('تعذر إكمال تصفير البيانات. تحقق من الاتصال ثم حاول مرة أخرى.');
    }finally{
      forceOperationalReset = false;
      cloudApplying = false;
    }
  }
  document.getElementById('resetDataBtn')?.addEventListener('click', resetOperationalData);
  document.getElementById('floatingLogoutBtn')?.addEventListener('click', async ()=>{
    if(!window.firebaseSignOut) return;
    if(confirm('هل تريد تسجيل الخروج من البرنامج؟')){
      try{ await window.firebaseSignOut(); }catch(err){ console.error('Logout failed:',err); showToast('تعذر تسجيل الخروج.'); }
    }
  });

  /* ===== dashboard ===== */
  function updateDashboardClock(){
    const now=new Date();
    const h=now.getHours();
    const m=String(now.getMinutes()).padStart(2,'0');
    const hour12=String((h%12)||12).padStart(2,'0');
    const ampm=h>=12?'PM':'AM';
    const clock=document.getElementById('dashClock');
    if(clock) clock.textContent=`${hour12}:${m} ${ampm}`;
    const date=document.getElementById('dashDate');
    if(date) date.textContent=now.toLocaleDateString('ar-SA-u-ca-gregory',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  }
  function renderDashboard(){
    updateDashboardClock();
    document.getElementById('statTotal').textContent = employees.length;
    const active = employees.filter(e=>employeeContractStatus(e)==='ساري').length;
    document.getElementById('statActive').textContent = active;
    const contractEmployeeIds=new Set(contracts.map(c=>c.empId).filter(Boolean));
    const noContracts=employees.filter(e=>!contractEmployeeIds.has(e.id)).length;
    document.getElementById('statNoContracts').textContent=noContracts;
    const payroll = employees.reduce((s,e)=>s+netSalary(e),0);
    document.getElementById('statPayroll').textContent = fmt(payroll);

    const expiringItems = [];
    employees.forEach(e=>{
      const ci=employeeContractInfo(e.id); const dc = daysUntil(ci.contract?.end || e.contractend);
      if(dc!==null && dc<=30) expiringItems.push({who:e.fullname, what:'انتهاء العقد', days:dc});
      const di = daysUntil(e.iddate_expiry);
      if(di!==null && di<=30) expiringItems.push({who:e.fullname, what:'انتهاء الهوية/الإقامة', days:di});
    });
    expiringItems.sort((a,b)=>a.days-b.days);
    document.getElementById('statExpiring').textContent = expiringItems.length;

    const expEl = document.getElementById('expiringList');
    if(expiringItems.length===0){
      expEl.innerHTML = '<p class="empty-note">لا توجد وثائق أو عقود تنتهي خلال 30 يوماً.</p>';
    }else{
      expEl.innerHTML = expiringItems.slice(0,8).map(it=>{
        const pillClass = it.days<0 ? 'pill-red' : it.days<=7 ? 'pill-red' : 'pill-gold';
        const label = it.days<0 ? `منتهي منذ ${Math.abs(it.days)} يوم` : `خلال ${it.days} يوم`;
        return `<div class="expiring-item"><div><div class="who">${escapeHtml(it.who)}</div><div class="what">${it.what}</div></div><span class="pill ${pillClass}">${label}</span></div>`;
      }).join('');
    }

    const depCounts = {};
    employees.forEach(e=>{ const d = e.dept||'غير محدد'; depCounts[d]=(depCounts[d]||0)+1; });
    const maxC = Math.max(1, ...Object.values(depCounts));
    const depEl = document.getElementById('depList');
    const entries = Object.entries(depCounts);
    if(entries.length===0){
      depEl.innerHTML = '<p class="empty-note">لا يوجد موظفون بعد.</p>';
    }else{
      depEl.innerHTML = entries.map(([d,c])=>`
        <div class="dep-row">
          <div class="name">${escapeHtml(d)}</div>
          <div class="bar"><i style="width:${(c/maxC*100).toFixed(0)}%"></i></div>
          <div class="count">${c}</div>
        </div>`).join('');
    }
  }

  /* ===== departments / jobs ===== */
  function departmentMap(){
    const map = {};
    departments.forEach(d=>{ map[d.name]={jobs:{}}; (d.jobs||[]).forEach(j=>map[d.name].jobs[j]=0); });
    employees.forEach(e=>{
      const dept=String(e.dept||'').trim(), job=String(e.jobtitle||'').trim(); if(!dept)return;
      if(!map[dept]) map[dept]={jobs:{}};
      if(job) map[dept].jobs[job]=(map[dept].jobs[job]||0)+1;
    });
    return map;
  }
  function renderDepartments(){
    const map=departmentMap();
    const q=(document.getElementById('deptSearch')?.value||'').trim().toLowerCase();
    const rows=[];
    Object.keys(map).sort((a,b)=>a.localeCompare(b,'ar')).forEach(dept=>{
      const jobs=Object.entries(map[dept].jobs).sort((a,b)=>a[0].localeCompare(b[0],'ar'));
      const matchesDept=!q || dept.toLowerCase().includes(q);
      const matchedJobs=jobs.filter(([job])=>matchesDept || job.toLowerCase().includes(q));
      if(!matchedJobs.length && !matchesDept)return;
      const list=matchedJobs.length?matchedJobs:[['—',0]];
      list.forEach(([job,count],idx)=>rows.push(`<tr>${idx===0?`<td rowspan="${list.length}"><strong>${escapeHtml(dept)}</strong><div class="row-actions dept-row-actions"><button class="btn btn-sm" data-dept-edit="${escapeAttr(dept)}">تعديل القسم</button><button class="btn btn-sm btn-danger" data-dept-del="${escapeAttr(dept)}">حذف القسم</button></div></td>`:''}<td>${escapeHtml(job)}</td><td>${count}</td><td><div class="row-actions">${job!=='—'?`<button class="btn btn-sm" data-job-edit="${escapeAttr(dept)}" data-job="${escapeAttr(job)}">تعديل</button><button class="btn btn-sm btn-danger" data-job-del="${escapeAttr(dept)}" data-job="${escapeAttr(job)}">حذف</button>`:''}</div></td></tr>`));
    });
    const body=document.getElementById('departmentsTableBody'); if(body)body.innerHTML=rows.join('');
    const badge=document.getElementById('deptSummaryCount'); if(badge)badge.textContent=`${departments.length} قسم`;
    const empty=document.getElementById('departmentsEmptyNote'); if(empty)empty.style.display=rows.length?'none':'';
    body?.querySelectorAll('[data-job-del]').forEach(b=>b.onclick=()=>{
      const d=departments.find(x=>normalizeDepartmentName(x.name)===normalizeDepartmentName(b.dataset.jobDel)); if(!d)return;
      if(confirm(`حذف الوظيفة "${b.dataset.job}" من قسم "${d.name}"؟`)){
        d.jobs=(d.jobs||[]).filter(j=>normalizeJobName(j)!==normalizeJobName(b.dataset.job));
        saveDepartments(); renderDepartments(); refreshDepartmentJobSelects(); refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
      }
    });
    body?.querySelectorAll('[data-job-edit]').forEach(b=>b.onclick=()=>{
      const d=departments.find(x=>normalizeDepartmentName(x.name)===normalizeDepartmentName(b.dataset.jobEdit)); if(!d)return;
      const form=document.getElementById('departmentForm');
      form.reset();
      form.dataset.editMode='job';
      document.getElementById('departmentEditorMode').value='job';
      document.getElementById('departmentEditor').style.display='';
      document.getElementById('departmentEditorTitle').textContent='تعديل وظيفة';
      document.getElementById('departmentId').value=d.id||'';
      document.getElementById('departmentOldJob').value=b.dataset.job||'';
      document.getElementById('departmentName').value=d.name||'';
      document.getElementById('departmentJob').value=b.dataset.job||'';
      document.getElementById('departmentNameField').style.display='';
      document.getElementById('jobDepartmentField').style.display='none';
      document.getElementById('departmentJobField').style.display='';
    });
    body?.querySelectorAll('[data-dept-edit]').forEach(b=>b.onclick=()=>{
      const d=departments.find(x=>normalizeDepartmentName(x.name)===normalizeDepartmentName(b.dataset.deptEdit)); if(!d)return;
      const form=document.getElementById('departmentForm');
      form.reset();
      form.dataset.editMode='department';
      document.getElementById('departmentEditorMode').value='department';
      document.getElementById('departmentEditor').style.display='';
      document.getElementById('departmentEditorTitle').textContent='تعديل القسم';
      document.getElementById('departmentId').value=d.id||'';
      document.getElementById('departmentOldJob').value='';
      document.getElementById('departmentName').value=d.name||'';
      document.getElementById('departmentJob').value='';
      document.getElementById('departmentNameField').style.display='';
      document.getElementById('jobDepartmentField').style.display='none';
      document.getElementById('departmentJobField').style.display='';
    });
    body?.querySelectorAll('[data-dept-del]').forEach(b=>b.onclick=()=>{
      const i=departments.findIndex(x=>normalizeDepartmentName(x.name)===normalizeDepartmentName(b.dataset.deptDel)); if(i<0)return;
      const d=departments[i];
      if(confirm(`حذف القسم "${d.name}" وجميع وظائفه؟`)){
        departments.splice(i,1);
        saveDepartments(); renderDepartments(); refreshDepartmentJobSelects(); refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
      }
    });
  }

  function prepareDepartmentEditor(mode='department', deptName='', jobName=''){
    const form=document.getElementById('departmentForm');
    const editor=document.getElementById('departmentEditor');
    if(!form||!editor)return;
    form.reset();
    form.dataset.editMode=mode;
    document.getElementById('departmentEditorMode').value=mode;
    document.getElementById('departmentId').value='';
    document.getElementById('departmentOldJob').value=jobName||'';
    const nameField=document.getElementById('departmentNameField');
    const deptField=document.getElementById('jobDepartmentField');
    const jobField=document.getElementById('departmentJobField');
    const deptSelect=document.getElementById('jobDepartmentSelect');
    if(mode==='job'){
      document.getElementById('departmentEditorTitle').textContent='إضافة وظيفة جديدة';
      nameField.style.display='none';
      deptField.style.display='';
      jobField.style.display='';
      const depts=uniqueDepts();
      deptSelect.innerHTML='<option value="">اختر القسم</option>'+depts.map(d=>`<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('');
      deptSelect.value=deptName||'';
      document.getElementById('departmentJob').value=jobName||'';
    }else{
      document.getElementById('departmentEditorTitle').textContent='إضافة قسم جديد';
      nameField.style.display='';
      deptField.style.display='none';
      jobField.style.display='';
      document.getElementById('departmentName').value=deptName||'';
      document.getElementById('departmentJob').value=jobName||'';
    }
    editor.style.display='';
  }

  document.getElementById('deptSearch')?.addEventListener('input',renderDepartments);
  document.getElementById('addDepartmentBtn')?.addEventListener('click',()=>prepareDepartmentEditor('department'));
  document.getElementById('addJobBtn')?.addEventListener('click',()=>{
    if(!uniqueDepts().length){showToast('أضف قسمًا أولًا ثم أضف الوظيفة');return;}
    prepareDepartmentEditor('job');
  });
  document.getElementById('addDepartmentFromEmployeeBtn')?.addEventListener('click',()=>{
    document.getElementById('departmentForm')?.setAttribute('data-return-to','add');
    switchView('departments');
    setTimeout(()=>document.getElementById('addDepartmentBtn')?.click(),50);
  });
  document.getElementById('cancelDepartmentBtn')?.addEventListener('click',()=>{
    const form=document.getElementById('departmentForm');
    form?.removeAttribute('data-edit-mode');
    document.getElementById('departmentEditor').style.display='none';
  });
  document.getElementById('departmentForm')?.addEventListener('submit',ev=>{
    ev.preventDefault();
    const form=document.getElementById('departmentForm');
    const mode=form.dataset.editMode || document.getElementById('departmentEditorMode').value || 'department';
    const id=document.getElementById('departmentId').value;
    const oldJob=document.getElementById('departmentOldJob').value.trim();
    const name=document.getElementById('departmentName').value.trim();
    const job=document.getElementById('departmentJob').value.trim();
    const selectedDept=document.getElementById('jobDepartmentSelect')?.value.trim()||'';

    if(mode==='job'){
      if(!selectedDept){showToast('اختر القسم أولًا');return;}
      if(!job){showToast('اكتب اسم الوظيفة');return;}
      const d=departments.find(x=>normalizeDepartmentName(x.name)===normalizeDepartmentName(selectedDept));
      if(!d){showToast('القسم المحدد غير موجود');return;}
      d.jobs=d.jobs||[];
      const normalizedOld=normalizeJobName(oldJob);
      if(normalizedOld)d.jobs=d.jobs.filter(j=>normalizeJobName(j)!==normalizedOld);
      if(d.jobs.some(j=>normalizeJobName(j)===normalizeJobName(job))){showToast('هذه الوظيفة موجودة بالفعل في القسم');return;}
      d.jobs.push(job);
      saveDepartments(); renderDepartments(); refreshDepartmentJobSelects(); refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
      form.reset(); form.removeAttribute('data-edit-mode'); document.getElementById('departmentEditor').style.display='none';
      showToast(oldJob?'تم تعديل الوظيفة':'تمت إضافة الوظيفة');
      return;
    }

    if(!name){showToast('اكتب اسم القسم');return;}
    let d=departments.find(x=>x.id===id)||departments.find(x=>normalizeDepartmentName(x.name)===normalizeDepartmentName(name));
    const oldName=d?.name||'';
    if(!d){d={id:'d'+Date.now(),name,jobs:[]};departments.push(d);}
    else{
      if(departments.some(x=>x!==d && normalizeDepartmentName(x.name)===normalizeDepartmentName(name))){showToast('اسم القسم موجود بالفعل');return;}
      d.name=name; d.jobs=d.jobs||[];
    }
    if(job && !d.jobs.some(j=>normalizeJobName(j)===normalizeJobName(job)))d.jobs.push(job);
    saveDepartments(); renderDepartments(); refreshDepartmentJobSelects(); refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
    const returnToAdd=form.getAttribute('data-return-to');
    form.removeAttribute('data-return-to'); form.removeAttribute('data-edit-mode');
    form.reset(); document.getElementById('departmentEditor').style.display='none';
    if(returnToAdd==='add'){
      switchView('add');
      refreshDepartmentJobSelects(name,'');
      document.getElementById('f_dept').value=name;
      refreshDepartmentJobSelects(name,'');
    }
    showToast(oldName?'تم تعديل القسم':'تم حفظ القسم والوظيفة');
  });

  function normalizeDepartmentName(v){ return String(v||'').replace(/\s+/g,' ').trim(); }
  function normalizeJobName(v){ return String(v||'').replace(/\s+/g,' ').trim(); }
  function departmentsJobsSource(){
    // نفس المصدر الذي يُعرض فعليًا في تبويب «الأقسام والوظائف».
    // departmentMap يجمع وظائف سجلات الأقسام + الوظائف الموجودة في الموظفين،
    // لذلك لن تختفي وظيفة مثل «حارس أمن» من قائمة الموظف إذا كانت ظاهرة في التبويب.
    return departmentMap();
  }
  function uniqueDepts(){
    const map=departmentsJobsSource();
    return Object.keys(map).map(normalizeDepartmentName).filter(Boolean)
      .filter((d,i,a)=>a.indexOf(d)===i)
      .sort((a,b)=>a.localeCompare(b,'ar'));
  }
  function jobsForDepartment(deptName){
    const target=normalizeDepartmentName(deptName);
    if(!target) return [];
    const map=departmentsJobsSource();
    const sourceDept=Object.keys(map).find(d=>normalizeDepartmentName(d)===target);
    if(!sourceDept) return [];
    return Object.keys(map[sourceDept]?.jobs||{})
      .map(normalizeJobName).filter(Boolean)
      .filter((j,i,a)=>a.indexOf(j)===i)
      .sort((a,b)=>a.localeCompare(b,'ar'));
  }
  function refreshDepartmentJobSelects(selectedDept='', selectedJob=''){
    const deptSel=document.getElementById('f_dept'), jobSel=document.getElementById('f_jobtitle');
    if(!deptSel||!jobSel) return;
    const wantedDept=normalizeDepartmentName(selectedDept || deptSel.value);
    const wantedJob=normalizeJobName(selectedJob || jobSel.value);
    const depts=uniqueDepts();
    deptSel.innerHTML='<option value="">اختر القسم / الإدارة</option>'+depts.map(d=>`<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('');
    deptSel.value=depts.find(d=>normalizeDepartmentName(d)===wantedDept)||'';
    const jobs=jobsForDepartment(deptSel.value);
    jobSel.innerHTML='<option value="">اختر الوظيفة</option>'+jobs.map(j=>`<option value="${escapeAttr(j)}">${escapeHtml(j)}</option>`).join('');
    jobSel.value=jobs.find(j=>normalizeJobName(j)===wantedJob)||'';
  }
  function refreshDeptFilterOptions(){ const sel=document.getElementById('filterDept'); if(!sel)return; const cur=sel.value; sel.innerHTML='<option value="">كل الأقسام</option>'+uniqueDepts().map(d=>`<option>${escapeHtml(d)}</option>`).join(''); sel.value=cur; }

  /* ===== employees table ===== */
  function renderEmployeeTable(){
    refreshDeptFilterOptions();
    const q = (document.getElementById('searchInput').value||'').trim().toLowerCase();
    const fd = document.getElementById('filterDept').value;
    const fs = document.getElementById('filterStatus').value;
    let list = employees.filter(e=>{
      if(fd && e.dept!==fd) return false;
      if(fs && employeeContractStatus(e)!==fs) return false;
      if(q){
        const hay = [e.fullname,e.idnum,e.empcode,e.jobtitle].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
    document.getElementById('empCount').textContent = `${employees.length} موظف${fd||fs||q ? ' — ' + list.length + ' مطابق' : ''}`;
    const body = document.getElementById('empTableBody');
    document.getElementById('empEmptyNote').style.display = list.length ? 'none' : '';
    body.innerHTML = list.map(e=>{
      const contractStatus=employeeContractStatus(e); const statusClass = 'status-' + contractStatus.replace(/\s+/g,'_');
      return `<tr data-id="${e.id}">
        <td><div class="emp-name-cell"><div class="avatar">${escapeHtml(initials(e.fullname))}</div><div class="emp-name"><b>${escapeHtml(e.fullname||'—')}</b><span>${escapeHtml(e.idnum||'')}</span></div></div></td>
        <td>${escapeHtml(e.dept||'—')}</td>
        <td>${escapeHtml(e.jobtitle||'—')}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(contractStatus)}</span></td>
        <td class="mono">${fmt(e.basicsalary)}</td>
        <td><div class="row-actions">
          <button class="btn icon-btn btn-ghost" data-act="view" title="عرض">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn icon-btn btn-ghost" data-act="edit" title="تعديل">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          ${contractStatus==='بدون عقد'?`<button class="btn btn-sm btn-primary add-contract-employee" data-act="add-contract" title="إضافة عقد">إضافة عقد</button>`:''}
        </div></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('tr').forEach(tr=>{
      tr.addEventListener('click', (ev)=>{
        const id = tr.dataset.id;
        const act = ev.target.closest('[data-act]')?.dataset.act;
        if(act==='edit'){ loadIntoForm(id); switchView('add'); }
        else if(act==='add-contract'){ switchView('contracts'); setTimeout(()=>{ const sel=document.getElementById('contract_emp'); if(sel){sel.value=id; sel.dispatchEvent(new Event('change'));} },80); }
        else{ openProfile(id); }
      });
    });
  }
  ['searchInput','filterDept','filterStatus'].forEach(id=>{
    document.getElementById(id).addEventListener('input', renderEmployeeTable);
    document.getElementById(id).addEventListener('change', renderEmployeeTable);
  });

  /* ===== profile drawer ===== */
  function openProfile(id){
    const e = employees.find(x=>x.id===id);
    if(!e) return;
    currentProfileId = id;
    const net = netSalary(e);
    document.getElementById('profileBody').innerHTML = `
      <div class="profile-head">
        <div class="profile-avatar">${escapeHtml(initials(e.fullname))}</div>
        <div><h2>${escapeHtml(e.fullname||'—')}</h2><p>${escapeHtml(e.jobtitle||'—')} · ${escapeHtml(e.dept||'—')}</p></div>
      </div>
      <div class="info-block">
        <h4>البيانات الشخصية</h4>
        <div class="info-grid">
          ${infoItem('رقم الهوية / الإقامة', e.idnum, true)}
          ${infoItem('الجنسية', e.nationality)}
          ${infoItem('تاريخ الميلاد', e.dob)}
          ${infoItem('الجنس', e.gender)}
          ${infoItem('تاريخ إصدار الهوية', e.iddate_issue)}
          ${infoItem('تاريخ انتهاء الهوية', e.iddate_expiry)}
          ${infoItem('مكان الإصدار', e.idplace)}
          ${infoItem('رقم الهاتف', e.phone, true)}
          ${infoItem('البريد الإلكتروني', e.email, true)}
          ${infoItem('العنوان', e.address)}
          ${infoItem('جهة الطوارئ', e.emname ? (e.emname + (e.emphone? ' — '+e.emphone : '')) : '')}
        </div>
      </div>
      <div class="info-block">
        <h4>البيانات الوظيفية</h4>
        <div class="info-grid">
          ${infoItem('الرقم الوظيفي', e.empcode, true)}
          ${infoItem('تاريخ المباشرة', e.startdate)}
          ${infoItem('حالة العقد', employeeContractStatus(e))}
          ${infoItem('نوع العقد', employeeContractInfo(e.id).contract?.type || '')}
          ${infoItem('مدة العقد', employeeContractInfo(e.id).contract?.duration ? employeeContractInfo(e.id).contract.duration+' شهر' : '')}
          ${infoItem('تاريخ انتهاء العقد', employeeContractInfo(e.id).contract?.end || '')}
        </div>
      </div>
      <div class="info-block">
        <h4>الرواتب والماليات</h4>
        <div class="info-grid">
          ${infoItem('الراتب الأساسي', fmt(e.basicsalary))}
          ${infoItem('بدل السكن', fmt(e.housing))}
          ${infoItem('بدل المواصلات', fmt(e.transport))}
          ${infoItem('بدلات أخرى', fmt(e.otherallow))}
          ${infoItem('التأمينات الاجتماعية', fmt(e.gosi))}
          ${infoItem('استقطاعات أخرى', fmt(e.otherded))}
          ${infoItem('اسم البنك', e.bankname)}
          ${infoItem('رقم الآيبان', e.iban, true)}
        </div>
        <div class="salary-total"><span class="k">صافي الراتب الشهري</span><span class="v">${fmt(net)} ﷼</span></div>
      </div>
    `;
    document.getElementById('profileOverlay').classList.add('open');
  }
  function infoItem(label, value, mono){
    return `<div class="info-item"><div class="k">${escapeHtml(label)}</div><div class="v${mono?' mono':''}">${value ? escapeHtml(String(value)) : '—'}</div></div>`;
  }
  document.getElementById('profileCloseBtn').addEventListener('click', ()=>document.getElementById('profileOverlay').classList.remove('open'));
  document.getElementById('profileOverlay').addEventListener('click', (e)=>{ if(e.target.id==='profileOverlay') e.currentTarget.classList.remove('open'); });
  document.getElementById('profileEditBtn').addEventListener('click', ()=>{
    document.getElementById('profileOverlay').classList.remove('open');
    loadIntoForm(currentProfileId);
    switchView('add');
  });
  document.getElementById('profileDeleteBtn').addEventListener('click', ()=>{
    pendingDeleteId = currentProfileId;
    document.getElementById('confirmOverlay').classList.add('open');
  });

  /* ===== delete confirm ===== */
  document.getElementById('confirmDeleteNo').addEventListener('click', ()=>{ document.getElementById('confirmOverlay').classList.remove('open'); pendingDeleteId=null; });
  document.getElementById('confirmOverlay').addEventListener('click', (e)=>{ if(e.target.id==='confirmOverlay'){ e.currentTarget.classList.remove('open'); pendingDeleteId=null; } });
  document.getElementById('confirmDeleteYes').addEventListener('click', ()=>{
    if(pendingDeleteId){
      employees = employees.filter(e=>e.id!==pendingDeleteId);
      saveEmployees();
      showToast('تم حذف بيانات الموظف');
    }
    document.getElementById('confirmOverlay').classList.remove('open');
    document.getElementById('profileOverlay').classList.remove('open');
    pendingDeleteId = null;
    if(currentView==='employees') renderEmployeeTable();
    if(currentView==='dashboard') renderDashboard();
    if(currentView==='reports') renderReports();
  });

  /* ===== form ===== */
  const SAUDI_REGIONS = ['مكة المكرمة','المدينة المنورة','الرياض','القصيم','المنطقة الشرقية','عسير','تبوك','حائل','الحدود الشمالية','جازان','نجران','الباحة','الجوف'];
  const REGION_CODES = {
    'مكة المكرمة':'MAK','جدة':'JED','الطائف':'TAI','الرياض':'RIY','المدينة المنورة':'MED','القصيم':'QAS','المنطقة الشرقية':'EAS','الدمام':'DAM','الخبر':'KHO','الظهران':'DHA','الهفوف':'HOF','الأحساء':'AHS','القطيف':'QAT','عسير':'ASI','أبها':'ABH','خميس مشيط':'KHA','تبوك':'TAB','حائل':'HAI','الحدود الشمالية':'NOR','عرعر':'ARA','جازان':'JAZ','نجران':'NAJ','الباحة':'BAH','الجوف':'JOU','سكاكا':'SAK','بريدة':'BUR','عنيزة':'UNA','الرس':'RAS','ينبع':'YAN','رابغ':'RAB','القنفذة':'QUN'
  };
  const NATIONALITIES = [
    'سعودي','إماراتي','بحريني','كويتي','عُماني','قطري','مصري','أردني','فلسطيني','سوري','لبناني','عراقي','يمني','سوداني','ليبي','تونسي','جزائري','مغربي','موريتاني','صومالي','جيبوتي','قمري','تشادي','إريتري','إثيوبي','جنوب سوداني','نيجيري','غانا','سنغالي','غيني','غيني بيساوي','سيراليوني','ليبيري','غامبي','مالي','نيجري','بوركيني','توغولي','بِنيني','ساحل العاج','كاميروني','أوغندي','كينِي','تنزاني','رواندي','بوروندي','زيمبابوي','زامبي','موزمبيقي','ناميبي','بوتسواني','جنوب أفريقي','مالاوي','مدغشقري','موريشي','نيبالي','هندي','باكستاني','بنغلاديشي','أفغاني','إيراني','تركي','أذربيجاني','أوزبكي','كازاخستاني','طاجيكي','تركماني','قرغيزستاني','روسي','أوكراني','بيلاروسي','جورجي','أرميني','ألباني','بوسني','كرواتي','صربي','سلوفيني','سلوفاكي','تشيكي','بولندي','روماني','بلغاري','مولدوفي','مجري','نمساوي','ألماني','سويسري','فرنسي','بلجيكي','هولندي','لوكسمبورغي','بريطاني','أيرلندي','إسباني','برتغالي','إيطالي','مالطي','يوناني','قبرصي','دنماركي','سويدي','نرويجي','فنلندي','آيسلندي','إستوني','لاتفي','ليتواني','كندي','أمريكي','مكسيكي','كوبي','جامايكي','هايتي','دومينيكاني','كوستاريكي','بنمي','كولومبي','فنزويلي','إكوادوري','بيروفي','بوليفي','تشيلي','أرجنتيني','برازيلي','أوروغوياني','باراغواياني','أسترالي','نيوزيلندي','صيني','ياباني','كوري جنوبي','كوري شمالي','منغولي','تايلاندي','فيتنامي','فلبيني','إندونيسي','ماليزي','سنغافوري','بروناي','ميانماري','كمبودي','لاوسي','بنغالي','سريلانكي','بوتاني','مالديفي','نيكاراغوي','هندوراسي','سلفادوري','غواتيمالي','بورمي','تايواني','منغولي','إسرائيلي','فاتيكان','فلسطيني','باهاماسي','باربادوسي','ترينيدادي وتوباغوني','دومينيكي','غرينادي','سانت لوسي','سانت فنسنت والغرينادين','أنتيغوي وبربودي','سانت كيتس ونيفيس','بليزي','سورينامي','غياني','غوياني','باهامي','ساموي','تونغي','فيجي','فانواتوي','بابوا غينيا الجديدة','ميكرونيزي','جزر مارشال','بالاوي','ناوروي','كيريباتي','توفالوي','أندوري','موناكي','ليختنشتايني','سان مارينو','مدينة الفاتيكان','كوسوفي','مونتينيغري','مقدوني شمالي','بريطاني أنغيلي','برمودي','جزر كايمان','أروبي','كوراساوي','جزر فيرجن أمريكي','جزر فيرجن بريطاني','بورتوريكي','غوامي','كاليدوني جديد','بولينيزي فرنسي','أخرى'
  ];
  const SAUDI_BANKS = {
    '05':{code:'INMA',name:'مصرف الإنماء'},
    '10':{code:'NCBK',name:'البنك الأهلي السعودي'},
    '15':{code:'ALBI',name:'بنك البلاد'},
    '20':{code:'RIBL',name:'بنك الرياض'},
    '30':{code:'ARNB',name:'البنك العربي الوطني'},
    '40':{code:'SAMB',name:'مجموعة سامبا المالية'},
    '45':{code:'SABB',name:'البنك السعودي البريطاني'},
    '55':{code:'BSFR',name:'البنك السعودي الفرنسي'},
    '60':{code:'BJAZ',name:'بنك الجزيرة'},
    '65':{code:'SIBC',name:'البنك السعودي للاستثمار'},
    '80':{code:'RJHI',name:'مصرف الراجحي'},
    '90':{code:'GULF',name:'بنك الخليج الدولي'},
    '95':{code:'EBIL',name:'بنك الإمارات الدولي'}
  };

  const formFields = ['firstname','fathername','grandname','familyname','fullname','idnum','nationality','dob','gender','iddate_issue','iddate_expiry','idplace',
    'phone','email','address','emname','emphone','empcode','jobtitle','dept','startdate','region','project','basicsalary','housingPct','housing','transportPct','transport','otherallowPct','otherallow','otherded','bankname','iban','accountno','bankcode','bankAccountType','delegate_name','delegate_memo','lastwage','idphoto'];

  function fillNationalityAndIssueRegion(){
    const n=document.getElementById('f_nationality');
    if(n){ const cur=n.value; n.innerHTML='<option value="">اختر الجنسية</option>'+NATIONALITIES.filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join(''); n.value=cur; }
    const r=document.getElementById('f_idplace');
    if(r){ const cur=r.value; r.innerHTML='<option value="">اختر المنطقة</option>'+SAUDI_REGIONS.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join(''); r.value=cur; }
  }
  function normalizeDigits(v){ return String(v||'').replace(/[^0-9]/g,''); }
  function composeFullName(){
    const parts=['firstname','fathername','grandname','familyname'].map(k=>document.getElementById('f_'+k)?.value.trim()).filter(Boolean);
    const el=document.getElementById('f_fullname'); if(el) el.value=parts.join(' ');
  }
  function employeeContractInfo(empId){
    const list=contracts.filter(c=>c && c.empId===empId);
    if(!list.length) return {status:'بدون عقد', contract:null};
    const contract=[...list].sort((a,b)=>String(b.createdAt||b.id||'').localeCompare(String(a.createdAt||a.id||'')))[0];
    return {status:'ساري', contract};
  }
  function employeeContractStatus(emp){ return employeeContractInfo(emp?.id).status; }
  function syncEmployeeContractStatus(empId){
    const el=document.getElementById('f_contractstatus_display');
    if(el) el.value=employeeContractStatus({id:empId});
  }
  function allowanceAmount(base,pct){ return Math.round((Number(base)||0)*(Number(pct)||0)/100*100)/100; }
  function updateLastWage(){ const b=Number(document.getElementById('f_basicsalary')?.value)||0, h=Number(document.getElementById('f_housing')?.value)||0, t=Number(document.getElementById('f_transport')?.value)||0, o=Number(document.getElementById('f_otherallow')?.value)||0; const el=document.getElementById('f_lastwage'); if(el) el.value=(b+h+t+o).toFixed(2); }
  function inferAllowancePct(amount,base){ return Number(base)>0 ? Math.round((Number(amount)||0)/Number(base)*10000)/100 : 0; }
  function syncAllowance(field,pctField){
    const base=Number(document.getElementById('f_basicsalary')?.value)||0;
    const pctEl=document.getElementById(pctField), amountEl=document.getElementById(field);
    if(!pctEl||!amountEl) return;
    amountEl.value=allowanceAmount(base,pctEl.value).toFixed(2);
  }
  function syncAllAllowances(){
    syncAllowance('f_housing','f_housing_pct');
    syncAllowance('f_transport','f_transport_pct');
    syncAllowance('f_otherallow','f_otherallow_pct');
    updateLastWage();
  }
  function splitOldPhone(phone){ const d=normalizeDigits(phone); return d.length>=9 ? d.slice(-9) : d; }
  function regionCode(region){ return REGION_CODES[String(region||'').trim()] || String(region||'').trim().replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase() || 'REG'; }
  function nextEmployeeCode(region, currentId=''){
    const code=regionCode(region), now=new Date(), yy=String(now.getFullYear()).slice(-2), mm=String(now.getMonth()+1).padStart(2,'0'), prefix=`${code}-${yy}-${mm}-`;
    if(currentId){ const old=employees.find(e=>e.id===currentId); if(old?.empcode && String(old.empcode).startsWith(prefix)) return old.empcode; }
    let max=0; employees.forEach(e=>{ const m=String(e.empcode||'').match(new RegExp('^'+prefix.replace(/[-]/g,'\\-')+'(\\d{4})$')); if(m) max=Math.max(max,Number(m[1])); });
    return prefix+String(max+1).padStart(4,'0');
  }
  // Contract numbers are independent from employee numbers, while following the same region/year/month/sequence format.
  function nextContractCode(region, excludeId=''){
    const code=regionCode(region), now=new Date(), yy=String(now.getFullYear()).slice(-2), mm=String(now.getMonth()+1).padStart(2,'0');
    const prefix=`${code}-${yy}-${mm}-`;
    let max=0;
    contracts.forEach(c=>{
      if(excludeId && c.id===excludeId) return;
      const m=String(c.contractCode||'').match(new RegExp('^'+prefix.replace(/[-]/g,'\\-')+'(\\d{4})$'));
      if(m) max=Math.max(max,Number(m[1]));
    });
    return prefix+String(max+1).padStart(4,'0');
  }
  function updateEmployeeCode(force=false){
    const el=document.getElementById('f_empcode'), region=document.getElementById('f_region')?.value, id=document.getElementById('f_id')?.value;
    if(!el) return;
    // كود الموظف يُنشأ تلقائياً عند الإضافة فقط، ولا يتغير أثناء تعديل موظف موجود.
    if(id){ const existing=employees.find(e=>e.id===id); if(existing?.empcode){ el.value=existing.empcode; return; } }
    if(region && (force || !el.value)) el.value=nextEmployeeCode(region,'');
  }
  function syncStartDateAction(){
    const date=document.getElementById('f_startdate'), btn=document.getElementById('addStartDateBtn');
    if(!date||!btn) return;
    btn.style.display=date.value?'none':'inline-flex';
  }
  function validateSaudiIBAN(value){
    const iban=String(value||'').replace(/\s+/g,'').toUpperCase();
    if(!/^SA[0-9]{22}$/.test(iban)) return {ok:false,message:'رقم الايبان يجب أن يبدأ بـ SA ويتكون من 24 خانة بالضبط.'};
    const rearranged=iban.slice(4)+iban.slice(0,4);
    const numeric=rearranged.replace(/[A-Z]/g,ch=>String(ch.charCodeAt(0)-55));
    let rem=0; for(const ch of numeric) rem=(rem*10+Number(ch))%97;
    if(rem!==1) return {ok:false,message:'رقم الايبان غير صحيح أو لا يجتاز التحقق.'};
    const bankCode=iban.slice(4,6), account=iban.slice(6);
    return {ok:true,bankCode,bank:SAUDI_BANKS[bankCode]||'بنك مرخص داخل المملكة — الرمز '+bankCode,account};
  }
  function updateBankFromIBAN(){
    const iban=document.getElementById('f_iban')?.value||'', bank=document.getElementById('f_bankname'), account=document.getElementById('f_accountno'), code=document.getElementById('f_bankcode');
    const clean=iban.replace(/\s+/g,'').toUpperCase();
    if(clean.length>=6){ const bankCode=clean.slice(4,6); const bankInfo=SAUDI_BANKS[bankCode]; if(bank) bank.value=bankInfo?.name||''; if(code) code.value=bankInfo?.code||''; } else { if(bank) bank.value=''; if(code) code.value=''; }
    if(account) account.value=/^SA[0-9]{6,}$/.test(clean) ? clean.slice(6,24) : '';
  }
  function markField(id, message=''){
    const el=document.getElementById(id)||document.getElementById('f_'+id); if(!el)return; const field=el.closest('.field'); if(!field)return; field.classList.toggle('field-invalid',!!message); let err=field.querySelector('.field-error'); if(message){ if(!err){err=document.createElement('div');err.className='field-error';field.appendChild(err);} err.textContent=message; } else if(err) err.remove();
  }
  function clearValidation(){ document.querySelectorAll('.field-invalid').forEach(x=>x.classList.remove('field-invalid')); document.querySelectorAll('.field-error').forEach(x=>x.remove()); }
  function showFormError(errors, focusId){
    clearValidation(); Object.entries(errors).forEach(([id,msg])=>markField(id,msg)); if(focusId){(document.getElementById(focusId)||document.getElementById('f_'+focusId))?.focus();} const first=Object.keys(errors)[0]; const tab=first && ['firstname','fathername','grandname','familyname','fullname','idnum','nationality','dob','gender','iddate_issue','iddate_expiry','idplace','phone9','email','address','emname','emphone'].includes(first)?'personal':(first&&['iban','bankname','accountno','basicsalary','housing','transport','otherallow','gosi','otherded'].includes(first)?'pay':'job'); if(tab) document.querySelector(`.tab[data-tab="${tab}"]`)?.click(); showToast(Object.values(errors)[0]); }

  // توحيد التحقق من الخانات الإلزامية وإظهار رسالة واضحة بدل الاعتماد على تنبيه المتصفح فقط.
  document.addEventListener('invalid', ev=>{
    const el=ev.target;
    if(!(el instanceof HTMLElement) || !el.matches(':required')) return;
    const label=el.closest('.field')?.querySelector('label')?.textContent?.replace('*','').trim() || 'هذه الخانة';
    markField(el.id, `يرجى إدخال ${label}`);
    showToast(`الخانة الإلزامية: ${label}`);
  }, true);
  document.addEventListener('input', ev=>{ if(ev.target?.matches?.(':required')) markField(ev.target.id,''); }, true);
  document.addEventListener('change', ev=>{ if(ev.target?.matches?.(':required')) markField(ev.target.id,''); }, true);

  fillNationalityAndIssueRegion();
  refreshRegionSelects();
  refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
  refreshDepartmentJobSelects();
  document.getElementById('f_dept')?.addEventListener('change', ()=>refreshDepartmentJobSelects(document.getElementById('f_dept').value,''));
  ['f_basicsalary','f_housing_pct','f_transport_pct','f_otherallow_pct'].forEach(id=>document.getElementById(id)?.addEventListener('input',syncAllAllowances));
  function syncAllowancePercentagesFromData(){
    const base=Number(document.getElementById('f_basicsalary')?.value)||0;
    [['f_housing_pct','f_housing'],['f_transport_pct','f_transport'],['f_otherallow_pct','f_otherallow']].forEach(([pct,amt])=>{
      const p=document.getElementById(pct), a=document.getElementById(amt);
      if(p && !p.value && a) p.value=inferAllowancePct(a.value,base);
    });
    syncAllAllowances();
  }
  document.getElementById('f_project').addEventListener('change', ()=>{ const p=projects.find(x=>x.name===document.getElementById('f_project').value); if(p && document.getElementById('f_region')) { document.getElementById('f_region').value=p.region||''; refreshEmployeeProjectSelect(p.region||''); document.getElementById('f_project').value=p.name||''; updateEmployeeCode(true); } });
  document.getElementById('f_region')?.addEventListener('change',()=>{ refreshEmployeeProjectSelect(document.getElementById('f_region').value); updateEmployeeCode(true); });

  /* ===== تعبئة الراتب تلقائياً من راتب المشروع حسب فئة الوظيفة ===== */
  const AUTO_HOUSING_PCT=25, AUTO_TRANSPORT_PCT=38.5, AUTO_OTHER_PCT=0;   // نسب التوزيع على الراتب الأساسي
  function projectRoleSalary(project,key){
    if(!project||!key) return 0;
    const costRows=Array.isArray(project.costItems?.[key])?project.costItems[key]:[];
    const revenueRows=Array.isArray(project.revenueItems?.[key])?project.revenueItems[key]:[];
    // استخدم التكاليف أولاً، وإن لم يوجد سعر استخدم سعر الإيراد كاحتياط حتى تصل بيانات المشروع للموظف.
    const rows=costRows.length?costRows:revenueRows;
    const row=rows.find(x=>Number(x?.unit)>0)||rows[0];
    const legacy={guards:project.costGuard??project.guardBasic, supervisors:project.supervisorBasic, managers:project.managerBasic}[key];
    return Number(row?.unit)||Number(legacy)||0;
  }
  // يحسب الأساسي بحيث (أساسي + سكن + مواصلات + أخرى) = راتب المشروع بالضبط بعد تقريب الهللات
  function solveBasicForTotal(total,hp,tp,op){
    const target=Math.round(total*100), c0=Math.round(total/(1+(hp+tp+op)/100)*100);
    let best=null;
    for(let d=-5;d<=5;d++){
      const b=(c0+d)/100;
      const sum=Math.round((b+allowanceAmount(b,hp)+allowanceAmount(b,tp)+allowanceAmount(b,op))*100);
      const diff=Math.abs(sum-target);
      if(!best||diff<best.diff||(diff===best.diff&&Math.abs(d)<Math.abs(best.d))) best={b,diff,d};
    }
    return best.b;
  }
  function applyProjectSalaryToEmployee(){
    const pName=document.getElementById('f_project')?.value||'';
    const job=document.getElementById('f_jobtitle')?.value||'';
    if(!pName||!job) return;
    const key=roleCapacityKey(job); if(!key) return;
    const project=projects.find(x=>String(x.name||'')===String(pName)); if(!project) return;
    const hint=document.getElementById('payAutoHint');
    const total=projectRoleSalary(project,key);
    if(!(total>0)){ if(hint) hint.hidden=true; showToast(`لا يوجد راتب محدد لفئة «${job}» في مشروع ${pName}`); return; }
    const editing=!!document.getElementById('f_id')?.value;
    const currentTotal=Number(document.getElementById('f_lastwage')?.value)||0;
    if(editing && currentTotal>0 && Math.abs(currentTotal-total)>=0.01 && !confirm(`تحديث راتب الموظف إلى راتب فئة «${job}» في المشروع (${money(total)}) بدل الراتب الحالي (${money(currentTotal)})؟`)) return;
    document.getElementById('f_housing_pct').value=AUTO_HOUSING_PCT;
    document.getElementById('f_transport_pct').value=AUTO_TRANSPORT_PCT;
    document.getElementById('f_otherallow_pct').value=AUTO_OTHER_PCT;
    const b0=solveBasicForTotal(total,AUTO_HOUSING_PCT,AUTO_TRANSPORT_PCT,AUTO_OTHER_PCT);
    const hAmt=allowanceAmount(b0,AUTO_HOUSING_PCT), tAmt=allowanceAmount(b0,AUTO_TRANSPORT_PCT), oAmt=allowanceAmount(b0,AUTO_OTHER_PCT);
    const residual=Math.round(total*100)-Math.round((b0+hAmt+tAmt+oAmt)*100);      // فرق هللات نادر بسبب التقريب يُضاف على الأساسي
    document.getElementById('f_basicsalary').value=(b0+residual/100).toFixed(2);
    syncAllAllowances();
    document.getElementById('f_housing').value=hAmt.toFixed(2);
    document.getElementById('f_transport').value=tAmt.toFixed(2);
    document.getElementById('f_otherallow').value=oAmt.toFixed(2);
    updateLastWage();
    if(hint){ hint.textContent=`تم توزيع الراتب تلقائياً من مشروع «${pName}» لفئة «${job}» — إجمالي الراتب ${money(total)}.`; hint.hidden=false; }
    showToast('تم تعبئة الرواتب والماليات من راتب المشروع');
  }
  document.getElementById('f_project')?.addEventListener('change',applyProjectSalaryToEmployee);
  document.getElementById('f_jobtitle')?.addEventListener('change',applyProjectSalaryToEmployee);
  ['f_basicsalary','f_housing_pct','f_transport_pct','f_otherallow_pct'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{ const h=document.getElementById('payAutoHint'); if(h) h.hidden=true; }));
  ['firstname','fathername','grandname','familyname'].forEach(id=>document.getElementById('f_'+id)?.addEventListener('input',composeFullName));
  document.getElementById('f_idnum')?.addEventListener('input',e=>{e.target.value=normalizeDigits(e.target.value).slice(0,10);});
  document.getElementById('f_phone9')?.addEventListener('input',e=>{e.target.value=normalizeDigits(e.target.value).slice(0,9);});
  document.getElementById('f_iban')?.addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(0,24);updateBankFromIBAN();});
  document.getElementById('f_basicsalary')?.addEventListener('input',()=>{syncAllAllowances();updateLastWage();});
  ['f_housing_pct','f_transport_pct','f_otherallow_pct'].forEach(id=>document.getElementById(id)?.addEventListener('input',syncAllAllowances));
  function syncBankAccountType(){
    const delegated=document.querySelector('input[name=bankAccountType]:checked')?.value==='تفويض بنكي';
    document.querySelectorAll('#view-add .delegate-only').forEach(el=>{ el.hidden=!delegated; el.classList.toggle('delegate-visible',delegated); });
    const nav=document.getElementById('delegationNotesBtn'); if(nav) nav.hidden=false;
    if(!delegated){ const n=document.getElementById('f_delegate_name'); if(n)n.value=''; }
  }
  document.querySelectorAll('input[name=bankAccountType]').forEach(r=>r.addEventListener('change',syncBankAccountType));
  syncBankAccountType();
  document.getElementById('delegateMemoBtn')?.addEventListener('click',()=>document.getElementById('f_delegate_memo')?.click());
  document.getElementById('f_delegate_memo')?.addEventListener('change',e=>{ const f=e.target.files?.[0]; if(!f)return; if(f.size>5*1024*1024){showToast('حجم مذكرة التفويض يجب ألا يتجاوز 5 ميجابايت.');return;} const r=new FileReader(); r.onload=()=>{e.target.dataset.value=r.result; const n=document.getElementById('delegateMemoName'); if(n)n.textContent=f.name;}; r.readAsDataURL(f); });
  document.getElementById('delegationNotesBtn')?.addEventListener('click',()=>showToast('سيتم ربط هذا الزر بتبويب مذكرات التفويض عند إضافته.'));
  document.getElementById('idPhotoBtn')?.addEventListener('click',()=>document.getElementById('f_idphoto')?.click());
  document.getElementById('f_idphoto')?.addEventListener('change',e=>{
    const file=e.target.files?.[0]; if(!file) return;
    if(!file.type.startsWith('image/')){ showToast('يرجى اختيار صورة هوية فقط.'); return; }
    if(file.size>3*1024*1024){ showToast('حجم صورة الهوية يجب ألا يتجاوز 3 ميجابايت.'); return; }
    const reader=new FileReader(); reader.onload=()=>{
      const hidden=document.getElementById('f_idphoto'); hidden.dataset.value=reader.result;
      const n=document.getElementById('idPhotoName'); if(n) n.textContent=file.name;
    }; reader.readAsDataURL(file);
  });
  document.getElementById('addStartDateBtn')?.addEventListener('click',()=>showToast('سيتم ربط إضافة تاريخ المباشرة بتبويب «تاريخ المباشرة» عند إنشائه.'));
  document.getElementById('f_startdate')?.addEventListener('change',syncStartDateAction);

  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tabpanel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.tabpanel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });
  document.getElementById('employeeFilesRefreshBtn')?.addEventListener('click',renderEmployeeFiles);

  function currentFormEmployeeId(){ return document.getElementById('f_id')?.value || ''; }
  function employeeFileMap(e){ return (e && e.files && typeof e.files==='object') ? e.files : {}; }
  function fileEntryFor(e,key){ return employeeFileMap(e)[key] || null; }
  function renderEmployeeFiles(){
    const list=document.getElementById('employeeFilesList');
    if(!list) return;
    const id=currentFormEmployeeId();
    const e=employees.find(x=>x.id===id);
    const saved=employeeFileMap(e);
    list.innerHTML=EMPLOYEE_FILE_TYPES.map(item=>{
      const pending=pendingEmployeeFiles[item.key];
      const entry=pending || saved[item.key];
      const has=!!entry;
      const name=entry?.name || '';
      return `<div class="employee-file-row" data-file-key="${item.key}">
        <div class="employee-file-title"><span class="employee-file-dot ${has?'has-file':''}"></span><div><strong>${escapeHtml(item.label)}</strong><small>${has?escapeHtml(name):'لم يتم تحميل ملف بعد'}</small></div></div>
        <div class="employee-file-actions">
          <input type="file" class="employee-file-input" data-file-key="${item.key}" accept=".pdf,.jpg,.jpeg,.png" hidden>
          <button type="button" class="btn btn-sm employee-upload-btn" data-file-key="${item.key}">تحميل من الجهاز</button>
          <button type="button" class="btn btn-sm employee-download-btn" data-file-key="${item.key}">تنزيل الملف PDF</button>
          <button type="button" class="btn btn-sm btn-danger employee-remove-file-btn" data-file-key="${item.key}">إزالة الملف</button>
        </div>
      </div>`;
    }).join('') + `<div class="employee-file-row employee-files-all-row"><div class="employee-file-title"><span class="employee-file-dot ${(pendingEmployeeFiles.__all || EMPLOYEE_FILE_TYPES.some(x=>pendingEmployeeFiles[x.key]||saved[x.key]))?'has-file':''}"></span><div><strong>تحميل الكل</strong><small>الملف الكامل للموظف مرة واحدة</small></div></div><div class="employee-file-actions"><input type="file" class="employee-file-all-input" id="employeeFileAllInput" accept="*/*" hidden><button type="button" class="btn btn-sm employee-file-all-upload-btn" id="employeeUploadAllBtn">تحميل من الجهاز</button><button type="button" class="btn btn-sm employee-file-all-download-btn" id="employeeDownloadAllBtn">تنزيل الملف PDF</button><button type="button" class="btn btn-sm btn-danger employee-file-all-remove-btn" id="employeeRemoveAllBtn">إزالة الملف</button></div></div>`;

    list.querySelectorAll('.employee-upload-btn').forEach(btn=>btn.addEventListener('click',()=>list.querySelector(`.employee-file-input[data-file-key="${btn.dataset.fileKey}"]`)?.click()));
    list.querySelectorAll('.employee-file-input').forEach(input=>input.addEventListener('change',()=>{
      const file=input.files?.[0]; if(!file) return;
      if(!/^(application\/pdf|image\/(jpeg|png))$/i.test(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name)){ showToast('يرجى اختيار ملف PDF أو صورة JPG/PNG.'); input.value=''; return; }
      if(file.size>15*1024*1024){ showToast('حجم الملف يجب ألا يتجاوز 15 ميجابايت.'); input.value=''; return; }
      pendingEmployeeFiles[input.dataset.fileKey]=file;
      renderEmployeeFiles();
      showToast(`تم اختيار ملف «${file.name}» وسيتم حفظه مع الموظف.`);
    }));
    list.querySelectorAll('.employee-download-btn').forEach(btn=>btn.addEventListener('click',()=>downloadEmployeeFile(btn.dataset.fileKey)));
    list.querySelectorAll('.employee-remove-file-btn').forEach(btn=>btn.addEventListener('click',()=>removeEmployeeFile(btn.dataset.fileKey)));
    document.getElementById('employeeDownloadAllBtn')?.addEventListener('click',downloadAllEmployeeFiles);
    document.getElementById('employeeUploadAllBtn')?.addEventListener('click',()=>document.getElementById('employeeFileAllInput')?.click());
    document.getElementById('employeeFileAllInput')?.addEventListener('change',handleUploadAllEmployeeFiles);
    document.getElementById('employeeRemoveAllBtn')?.addEventListener('click',removeAllEmployeeFiles);
  }
  async function downloadEmployeeFile(key){
    const id=currentFormEmployeeId(); const e=employees.find(x=>x.id===id); if(!e){showToast('اختر موظفاً أولاً.');return;}
    const pending=pendingEmployeeFiles[key];
    const entry=pending || fileEntryFor(e,key);
    if(!entry){showToast('لا يوجد ملف محفوظ لهذا المستند بعد.');return;}
    if(pending){
      await downloadBlobAsPdf(pending,pending.name);
      return;
    }
    if(entry.type==='application/pdf' || /\.pdf$/i.test(entry.name||'')){
      const a=document.createElement('a'); a.href=entry.url; a.target='_blank'; a.rel='noopener'; a.download=entry.name||'employee-file.pdf'; document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    try{
      const res=await fetch(entry.url); const blob=await res.blob(); await downloadBlobAsPdf(blob,entry.name||'employee-file');
    }catch(err){ window.open(entry.url,'_blank','noopener'); }
  }
  async function downloadBlobAsPdf(blob,name){
    if(blob.type==='application/pdf' || /\.pdf$/i.test(name||'')){
      const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name||'employee-file.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); return;
    }
    if(!window.jspdf?.jsPDF){ showToast('تعذر إنشاء PDF. أعد تحميل الصفحة وحاول مرة أخرى.'); return; }
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
    const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=dataUrl;});
    const pdf=new window.jspdf.jsPDF({orientation:img.width>=img.height?'landscape':'portrait',unit:'pt',format:'a4'});
    const margin=24, maxW=pdf.internal.pageSize.getWidth()-margin*2, maxH=pdf.internal.pageSize.getHeight()-margin*2;
    const scale=Math.min(maxW/img.width,maxH/img.height); const w=img.width*scale,h=img.height*scale;
    pdf.addImage(dataUrl, /\.png$/i.test(name||'') ? 'PNG' : 'JPEG', (pdf.internal.pageSize.getWidth()-w)/2, (pdf.internal.pageSize.getHeight()-h)/2, w,h);
    pdf.save((name||'employee-file').replace(/\.[^.]+$/,'')+'.pdf');
  }
  async function downloadAllEmployeeFiles(){
    const id=currentFormEmployeeId(); const e=employees.find(x=>x.id===id); if(!e)return;
    if(pendingEmployeeFiles.__all){
      const file=pendingEmployeeFiles.__all; const url=URL.createObjectURL(file); const a=document.createElement('a'); a.href=url; a.download=file.name || `ملف-الموظف-${id||'employee'}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); return;
    }
    const savedAll=e.files?.__all;
    if(savedAll?.url){
      try{ const res=await fetch(savedAll.url); const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=savedAll.name || `ملف-الموظف-${id||'employee'}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); return; }catch(err){ console.error(err); }
    }
    const entries=EMPLOYEE_FILE_TYPES.map(x=>({key:x.key,entry:pendingEmployeeFiles[x.key]||fileEntryFor(e,x.key)})).filter(x=>x.entry);
    if(!entries.length){showToast('لا توجد ملفات لتحميلها.');return;}
    if(!window.JSZip){showToast('تعذر تجهيز الملف الكامل. أعد تحميل الصفحة وحاول مرة أخرى.');return;}
    const zip=new window.JSZip();
    for(const x of entries){
      try{
        let blob=x.entry instanceof File ? x.entry : null;
        if(!blob){ const res=await fetch(x.entry.url); blob=await res.blob(); }
        zip.file(x.entry.name || `${x.key}.pdf`,blob);
      }catch(err){ console.error('employee bundle fetch failed',x.key,err); }
    }
    const out=await zip.generateAsync({type:'blob'});
    const url=URL.createObjectURL(out); const a=document.createElement('a'); a.href=url; a.download=`ملف-الموظف-${id||'employee'}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function handleUploadAllEmployeeFiles(ev){
    const file=ev.target.files?.[0]; ev.target.value=''; if(!file)return;
    if(file.size>100*1024*1024){showToast('حجم الملف الكامل يجب ألا يتجاوز 100 ميجابايت.');return;}
    // يقبل سطر تحميل الكل أي صيغة ملف. ملفات ZIP يتم فكها وتوزيعها على مستندات الموظف،
    // وأي صيغة أخرى تُحفظ كملف كامل مستقل كما هي بدون تغيير الامتداد أو المحتوى.
    if(!/\.zip$/i.test(file.name)){
      pendingEmployeeFiles.__all = file;
      renderEmployeeFiles();
      showToast('تم اختيار الملف الكامل وسيتم حفظه كما هو.');
      return;
    }
    if(!window.JSZip){showToast('تعذر قراءة ملف ZIP. أعد تحميل الصفحة وحاول مرة أخرى.');return;}
    try{
      const zip=await window.JSZip.loadAsync(file);
      const byBase=new Map(EMPLOYEE_FILE_TYPES.map(x=>[x.key.toLowerCase(),x]));
      const nameMap=new Map(EMPLOYEE_FILE_TYPES.map(x=>[x.label.toLowerCase(),x]));
      let count=0;
      for(const [path,entry] of Object.entries(zip.files)){
        if(entry.dir)continue;
        const base=path.split('/').pop().replace(/\.[^.]+$/,'').trim().toLowerCase();
        const item=byBase.get(base)||nameMap.get(base);
        if(!item)continue;
        const blob=await entry.async('blob');
        const ext=(path.match(/\.[^.]+$/)||['.pdf'])[0].toLowerCase();
        const mime=ext==='.pdf'?'application/pdf':(ext==='.png'?'image/png':'image/jpeg');
        pendingEmployeeFiles[item.key]=new File([blob],path.split('/').pop(),{type:mime});
        count++;
      }
      if(!count){showToast('لم يتم العثور داخل الملف الكامل على أسماء ملفات مطابقة لملفات الموظف.');return;}
      renderEmployeeFiles(); showToast(`تم اختيار ${count} ملف/ملفات وسيتم حفظها مع الموظف.`);
    }catch(err){console.error(err);showToast('تعذر قراءة الملف الكامل.');}
  }
  async function removeAllEmployeeFiles(){
    const id=currentFormEmployeeId(); const e=employees.find(x=>x.id===id); if(!e)return;
    const keys=EMPLOYEE_FILE_TYPES.filter(x=>pendingEmployeeFiles[x.key]||fileEntryFor(e,x.key)).map(x=>x.key);
    const hasAll=!!(pendingEmployeeFiles.__all || e.files?.__all);
    if(!keys.length && !hasAll)return;
    if(!confirm('هل تريد إزالة جميع ملفات الموظف نهائياً؟'))return;
    try{
      if(pendingEmployeeFiles.__all){ delete pendingEmployeeFiles.__all; }
      else if(e.files?.__all){
        const entry=e.files.__all;
        if(entry.path && window.FB?.deleteEmployeeFile) await window.FB.deleteEmployeeFile(entry.path);
        if(e.files) delete e.files.__all;
      }
      for(const key of keys){
        if(pendingEmployeeFiles[key]){delete pendingEmployeeFiles[key];continue;}
        const entry=fileEntryFor(e,key);
        if(entry?.path && window.FB?.deleteEmployeeFile) await window.FB.deleteEmployeeFile(entry.path);
        if(e.files) delete e.files[key];
      }
      saveEmployees(); renderEmployeeFiles(); showToast('تمت إزالة جميع ملفات الموظف.');
    }catch(err){console.error(err);showToast('تعذر إزالة ملف أو أكثر.');}
  }
  async function removeEmployeeFile(key){
    const id=currentFormEmployeeId(); const e=employees.find(x=>x.id===id); if(!e){showToast('اختر موظفاً أولاً.');return;}
    if(pendingEmployeeFiles[key]){ delete pendingEmployeeFiles[key]; renderEmployeeFiles(); showToast('تم إلغاء الملف المختار.'); return; }
    const entry=fileEntryFor(e,key); if(!entry){showToast('لا يوجد ملف محفوظ لهذا المستند بعد.');return;}
    if(!confirm('هل تريد إزالة هذا الملف نهائياً؟')) return;
    try{
      if(entry.path && window.FB?.deleteEmployeeFile) await window.FB.deleteEmployeeFile(entry.path);
      e.files={...employeeFileMap(e)}; delete e.files[key];
      saveEmployees(); renderEmployeeFiles(); showToast('تمت إزالة الملف.');
    }catch(err){ console.error(err); showToast('تعذر إزالة الملف.'); }
  }
  async function savePendingEmployeeFiles(employeeId, data){
    const keys=Object.keys(pendingEmployeeFiles); if(!keys.length)return data;
    data.files={...employeeFileMap(data)};
    for(const key of keys){
      const file=pendingEmployeeFiles[key];
      if(!file)continue;
      if(!window.FB?.uploadEmployeeFile) throw new Error('FILE_STORAGE_NOT_READY');
      data.files[key]=await window.FB.uploadEmployeeFile(employeeId,key,file);
    }
    pendingEmployeeFiles={};
    return data;
  }

  function resetForm(){
    pendingEmployeeFiles={};
    document.getElementById('f_id').value = '';
    formFields.forEach(f=>{ const el = document.getElementById('f_'+f); if(el) el.value = ''; });
    const statusEl=document.getElementById('f_contractstatus_display'); if(statusEl) statusEl.value='بدون عقد';
    const housingPct=document.getElementById('f_housing_pct'), transportPct=document.getElementById('f_transport_pct'), otherPct=document.getElementById('f_otherallow_pct');
    if(housingPct) housingPct.value='25'; if(transportPct) transportPct.value='38.5'; if(otherPct) otherPct.value='0'; const payHint=document.getElementById('payAutoHint'); if(payHint) payHint.hidden=true;
    const delMemo=document.getElementById('f_delegate_memo'); if(delMemo){delMemo.value=''; delete delMemo.dataset.value;} const delName=document.getElementById('f_delegate_name'); if(delName) delName.value=''; const delMemoName=document.getElementById('delegateMemoName'); if(delMemoName) delMemoName.textContent=''; syncBankAccountType(); const photoEl=document.getElementById('f_idphoto'); if(photoEl){ photoEl.value=''; delete photoEl.dataset.value; } const photoName=document.getElementById('idPhotoName'); if(photoName) photoName.textContent=''; const personalRadio=document.querySelector('input[name=bankAccountType][value="حساب شخصي"]'); if(personalRadio) personalRadio.checked=true;
    document.getElementById('formTitle').textContent = 'إضافة موظف جديد';
    syncStartDateAction();
    fillNationalityAndIssueRegion(); refreshDepartmentJobSelects(); refreshEmployeeProjectSelect(''); composeFullName(); updateBankFromIBAN(); syncAllowancePercentagesFromData(); clearValidation();
    document.querySelectorAll('.tab')[0].click(); renderEmployeeFiles();
  }
  function loadIntoForm(id){
    const e = employees.find(x=>x.id===id);
    if(!e) return;
    document.getElementById('f_id').value = e.id;
    { const ph=document.getElementById('payAutoHint'); if(ph) ph.hidden=true; }
    formFields.forEach(f=>{ const el = document.getElementById('f_'+f); if(el) el.value = e[f]!=null ? e[f] : ''; });
    const oldNames=String(e.fullname||'').trim().split(/\s+/);
    ['firstname','fathername','grandname','familyname'].forEach((k,i)=>{const el=document.getElementById('f_'+k); if(el && !el.value) el.value=oldNames[i]||'';});
    const ph=document.getElementById('f_phone9'); if(ph) ph.value=splitOldPhone(e.phone);
    document.getElementById('f_empcode').value=e.empcode||nextEmployeeCode(e.region||'',e.id);
    const photoEl=document.getElementById('f_idphoto'); if(photoEl){ photoEl.value=''; if(e.idphoto) photoEl.dataset.value=e.idphoto; else delete photoEl.dataset.value; } const photoName=document.getElementById('idPhotoName'); if(photoName) photoName.textContent=e.idphoto?'صورة هوية محفوظة':''; const bankRadio=document.querySelector(`input[name=bankAccountType][value=\"${e.bankAccountType||'حساب شخصي'}\"]`); if(bankRadio) bankRadio.checked=true; syncBankAccountType(); updateLastWage();
    syncEmployeeContractStatus(e.id);
    syncAllowancePercentagesFromData();
    document.getElementById('formTitle').textContent = 'تعديل بيانات: ' + (e.fullname||'');
    refreshDepartmentJobSelects(e.dept||'', e.jobtitle||''); fillNationalityAndIssueRegion(); refreshEmployeeProjectSelect(e.region||''); const projectEl=document.getElementById('f_project'); if(projectEl) projectEl.value=e.project||''; composeFullName(); updateBankFromIBAN();
    syncStartDateAction();
    pendingEmployeeFiles={};
    document.querySelectorAll('.tab')[0].click(); clearValidation(); renderEmployeeFiles();
  }
  function cancelEmployeeForm(){
    const editor=document.getElementById('departmentEditor');
    if(editor && editor.style.display!=='none'){
      editor.style.display='none';
      document.getElementById('departmentForm')?.removeAttribute('data-return-to');
    }
    try{ clearValidation(); }catch(e){}
    try{ resetForm(); }catch(e){}
    // Always leave the Add Employee screen and return to the complete employee list.
    try{ switchView('employees'); return; }catch(e){
      console.error('Employee cancel navigation error:',e);
    }
    document.querySelectorAll('main > section[id^="view-"]').forEach(sec=>sec.style.display='none');
    const employeesView=document.getElementById('view-employees');
    if(employeesView) employeesView.style.display='';
    try{ renderEmployeeTable(); }catch(e){}
    try{ currentView='employees'; }catch(e){}
  }
  // Use both direct and delegated handlers so Cancel still works if another
  // initialization step failed before the direct binding was reached.
  // تأكيد تشغيل زر الحفظ حتى لو حدث تعارض مع أي handler آخر على النموذج.
  // نمنع الإرسال الافتراضي ونطلق submit واحداً بشكل صريح.
  document.querySelector('#empForm button[type=submit]')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    const form=document.getElementById('empForm');
    if(form){
      if(typeof form.requestSubmit==='function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    }
  });

  document.getElementById('cancelFormBtn')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancelEmployeeForm();
  });
  document.addEventListener('click',(ev)=>{
    const btn=ev.target?.closest?.('#cancelFormBtn');
    if(!btn) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancelEmployeeForm();
  },true);
  // ESC cancels whenever the Add Employee screen is actually visible.
  document.addEventListener('keydown', (ev)=>{
    if(ev.key!=='Escape') return;
    const addView=document.getElementById('view-add');
    if(!addView || addView.style.display==='none') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancelEmployeeForm();
  }, true);

  function normalizeCapacityText(value){
    return String(value||'')
      .replace(/[ًٌٍَُِّْـ]/g,'')
      .replace(/[أإآ]/g,'ا')
      .replace(/ى/g,'ي')
      .replace(/ة/g,'ه')
      .replace(/ؤ/g,'و').replace(/ئ/g,'ي')
      .replace(/\s+/g,' ').trim().toLowerCase();
  }
  function roleCapacityKey(jobtitle){
    const t=normalizeCapacityText(jobtitle);
    // كل وظيفة لها سعة مستقلة داخل كل مشروع. نتحقق من الحارسة أولاً حتى لا تدخل ضمن الحراس.
    if(/حارسه\s+امن|حارسه\s+حراسه|female\s+guard|security\s+guard(?:ess)?/.test(t)) return 'guardsFemale';
    if(/حارس\s+امن|حارس\s+حراسه|(^|\s)guard(\s|$)/.test(t)) return 'guards';
    if(/مشرف|supervisor/.test(t)) return 'supervisors';
    if(/مدير\s+مشروع|مدير\s+امن|مدراء\s+المشاريع|project\s+manager/.test(t)) return 'managers';
    if(/دوري|دوريات|patrol/.test(t)) return 'patrols';
    return null;
  }
  function sameProjectName(a,b){
    return normalizeCapacityText(a)===normalizeCapacityText(b);
  }
  function projectEmployeeCounts(projectName, excludeId){
    const counts={guards:0,guardsFemale:0,supervisors:0,managers:0,patrols:0};
    employees.forEach(e=>{
      if(excludeId && e.id===excludeId) return;
      if(!sameProjectName(e.project,projectName)) return;
      const k=roleCapacityKey(e.jobtitle);
      if(k) counts[k]++;
    });
    return counts;
  }
  function validateProjectCapacities(projectName, excludeId, caps){
    if(!projectName) return null;
    const counts=projectEmployeeCounts(projectName, excludeId);
    for(const k of Object.keys(roleCapacityLabels)){
      const limit=Number(caps[k])||0;
      if(counts[k]>limit) return `تنبيه: عدد ${roleCapacityLabels[k]} الحالي (${counts[k]}) أكبر من الحد المحدد (${limit}).`;
    }
    return null;
  }
  function capacityFromRows(rows){
    if(!Array.isArray(rows)) return 0;
    return rows.reduce((sum,row)=>sum+(Number(row?.quantity ?? row?.count ?? 0)||0),0);
  }
  function projectRoleCapacity(project, key){
    if(!project) return 0;
    // القيمة المباشرة هي الأساس، لكن إذا كانت غير موجودة/صفر نبحث أيضاً في تفاصيل الإيرادات والتكاليف.
    const direct=Number(project[key]);
    if(Number.isFinite(direct) && direct>0) return direct;
    const aliases={
      guards:['guards','securityGuards','guardCount'],
      guardsFemale:['guardsFemale','femaleGuards','guardesses','femaleGuard','femaleGuardCount'],
      supervisors:['supervisors','supervisorCount'],
      managers:['managers','securityManagers','managerCount'],
      patrols:['patrols','patrolCount']
    };
    for(const alias of (aliases[key]||[])){
      const n=Number(project[alias]);
      if(Number.isFinite(n) && n>0) return n;
    }
    const costRows=project.costItems?.[key];
    const revRows=project.revenueItems?.[key];
    const fromCost=capacityFromRows(costRows);
    const fromRevenue=capacityFromRows(revRows);
    return Math.max(fromCost,fromRevenue);
  }
  function validateEmployeeCapacity(data, employeeId){
    const k=roleCapacityKey(data.jobtitle);
    if(!k || !data.project) return null;
    const project=projects.find(p=>sameProjectName(p.name,data.project));
    if(!project) return null;
    const counts=projectEmployeeCounts(data.project, employeeId);
    const limit=projectRoleCapacity(project,k);
    // إذا لم يتم تعريف سعة الوظيفة في المشروع، لا نطلب تأكيداً.
    if(limit<=0) return null;
    if(counts[k]>=limit) return {project:project.name, role:roleCapacityLabels[k], limit, current:counts[k]};
    return null;
  }

  function validateEmployeeSocialInsurance(data){
    if(!data.project) return null;
    const project=projects.find(p=>sameProjectName(p.name,data.project));
    if(!project || !project.siEnabled) return null;
    const gross=Number(data.lastwage)||0;
    if(gross < SI_MIN_SALARY) return {project:project.name,gross,min:SI_MIN_SALARY};
    return null;
  }

  function confirmProjectEmployeeWarnings(warnings){
    if(!warnings.length) return Promise.resolve(true);
    const overlay=document.getElementById('projectEmployeeWarningOverlay');
    const text=document.getElementById('projectEmployeeWarningText');
    const yes=document.getElementById('projectEmployeeWarningYes');
    const no=document.getElementById('projectEmployeeWarningNo');
    if(!overlay||!text||!yes||!no) return Promise.resolve(confirm(warnings.map(w=>w.text).join('\n\n')+'\n\nهل تريد المتابعة؟'));
    text.innerHTML=warnings.map(w=>`<div class="project-warning-item"><span class="warn-title">${escapeHtml(w.title)}</span>${w.html}</div>`).join('');
    overlay.classList.add('open');
    return new Promise(resolve=>{
      const close=(answer)=>{
        overlay.classList.remove('open');
        yes.onclick=no.onclick=null;
        resolve(answer);
      };
      yes.onclick=()=>close(true);
      no.onclick=()=>close(false);
    });
  }

  document.getElementById('empForm').addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    try{
      clearValidation(); composeFullName();
    const id = document.getElementById('f_id').value || ('e'+Date.now());
    const data = {id};
    formFields.forEach(f=>{ const el = document.getElementById('f_'+f); data[f] = el ? el.value : ''; });
    const phone9=normalizeDigits(document.getElementById('f_phone9')?.value||'');
    data.phone='+966'+phone9;
    data.fullname=['firstname','fathername','grandname','familyname'].map(k=>data[k]).filter(Boolean).join(' ');
    data.housingPct=Number(document.getElementById('f_housing_pct')?.value)||0;
    data.transportPct=Number(document.getElementById('f_transport_pct')?.value)||0;
    data.otherallowPct=Number(document.getElementById('f_otherallow_pct')?.value)||0;
    data.housing=allowanceAmount(data.basicsalary,data.housingPct);
    data.transport=allowanceAmount(data.basicsalary,data.transportPct);
    data.otherallow=allowanceAmount(data.basicsalary,data.otherallowPct);
    data.idphoto=document.getElementById('f_idphoto')?.dataset.value || data.idphoto || '';
    data.bankAccountType=document.querySelector('input[name=bankAccountType]:checked')?.value || data.bankAccountType || 'حساب شخصي';
    data.delegate_name=document.getElementById('f_delegate_name')?.value||'';
    const dm=document.getElementById('f_delegate_memo'); data.delegate_memo=dm?.dataset.value||data.delegate_memo||''; data.delegate_memo_name=dm?.files?.[0]?.name || data.delegate_memo_name || '';
    data.lastwage=Number(data.basicsalary||0)+Number(data.housing||0)+Number(data.transport||0)+Number(data.otherallow||0);
    delete data.contracttype; delete data.contractstatus; delete data.contractduration; delete data.contractend; delete data.gosi;
    const errors={};
    if(!data.firstname) errors.firstname='الاسم مطلوب.';
    if(!data.fathername) errors.fathername='اسم الأب مطلوب.';
    if(!data.grandname) errors.grandname='اسم الجد مطلوب.';
    if(!data.familyname) errors.familyname='اسم العائلة مطلوب.';
    if(!/^\d{10}$/.test(normalizeDigits(data.idnum))) errors.idnum='رقم الهوية يجب أن يكون 10 أرقام فقط.';
    if(!data.nationality) errors.nationality='اختر الجنسية.';
    if(!data.idplace) errors.idplace='اختر منطقة إصدار الهوية.';
    if(!/^\d{9}$/.test(phone9)) errors.phone9='رقم الجوال يجب أن يكون 9 أرقام بعد +966.';
    if(!data.dept) errors.dept='اختر القسم / الإدارة.';
    if(!data.jobtitle) errors.jobtitle='اختر المسمى الوظيفي.';
    const availableJobs=jobsForDepartment(data.dept);
    if(data.jobtitle && !availableJobs.includes(normalizeJobName(data.jobtitle))) errors.jobtitle='المسمى الوظيفي يجب أن يكون من الوظائف المسجلة داخل القسم المختار.';
    const ibanCheck=validateSaudiIBAN(data.iban);
    if(!ibanCheck.ok) errors.iban=ibanCheck.message;
    else { data.bankname=ibanCheck.bank; data.accountno=ibanCheck.account; data.bankcode=ibanCheck.bankCode; }
    if(!data.region) errors.region='اختر المنطقة / المدينة.';
    if(Object.keys(errors).length){ showFormError(errors,Object.keys(errors)[0]); return; }
    data.idnum=normalizeDigits(data.idnum); data.iban=data.iban.replace(/\s+/g,'').toUpperCase();
    if(id && employees.find(x=>x.id===id)?.empcode) data.empcode=employees.find(x=>x.id===id).empcode; else data.empcode=nextEmployeeCode(data.region,'');
    const capacityWarning=validateEmployeeCapacity(data,id);
    const siWarning=validateEmployeeSocialInsurance(data);
    const warnings=[];
    if(capacityWarning){
      warnings.push({
        title:'تجاوز سعة المشروع',
        html:`العدد المضاف سوف يكون أكبر من سعة المشروع <b>(${fmt(capacityWarning.limit)})</b> لفئة <b>${escapeHtml(capacityWarning.role)}</b> في مشروع <b>${escapeHtml(capacityWarning.project)}</b>. هل تريد المتابعة؟`
      });
    }
    if(siWarning){
      warnings.push({
        title:'مخالفة قوانين التأمينات الاجتماعية',
        html:`الموظف المضاف الآن راتبه الإجمالي <b>${money(siWarning.gross)}</b> مخالف لقوانين التأمينات الاجتماعية لأن راتبه الإجمالي أقل من <b>(${money(siWarning.min)})</b>. هل تريد المتابعة؟`
      });
    }
    if(warnings.length){
      const proceed=await confirmProjectEmployeeWarnings(warnings);
      if(!proceed){ showToast('لم يتم حفظ الموظف.'); return; }
    }
    const idx = employees.findIndex(x=>x.id===id);
    if(idx>=0) data.files={...employeeFileMap(employees[idx]), ...employeeFileMap(data)};
    try{
      if(Object.keys(pendingEmployeeFiles).length) await savePendingEmployeeFiles(id,data);
    }catch(err){
      console.error('Employee file upload failed:',err);
      showToast('تم حفظ بيانات الموظف، لكن تعذر رفع ملف أو أكثر. يمكنك رفعها من تبويب «ملفات الموظف» لاحقاً.');
    }
    if(idx>=0) employees[idx] = data; else employees.push(data);
    // احفظ محلياً فوراً، ثم انتظر حفظ Firestore قبل إغلاق النموذج حتى لا يعيد
    // الـ realtime snapshot القديم البيانات مرة أخرى.
    persistLocal();
    if(window.FB?.saveState){
      await window.FB.saveState(currentState());
    }
    try{ renderProjectCapacity(); renderProjects(); }catch(e){}
    showToast('تم حفظ بيانات الموظف بنجاح');
    resetForm();
    switchView('employees');
    }catch(err){
      console.error('Employee save failed:',err);
      showToast('تعذر حفظ بيانات الموظف. راجع الحقول المطلوبة أو حاول مرة أخرى.');
    }
  });

  /* ===== payroll statement ===== */
  function payrollStatementFor(e){
    const ym=document.getElementById('payrollMonth')?.value || currentMonthStr();
    const rec=(attendance[ym]&&attendance[ym][e.id])||{};
    const sum=attSummaryFor(ym,e.id);
    const basic=Number(e.basicsalary)||0;
    const day=basic/30;
    const allowances=Number(e.otherallow)||0;
    const overtime=(sum['اضافي']||0)*day*1.5;
    const gross=basic+allowances+overtime;
    const absence=(sum['غ']||0)*day*3.5;
    const penalty=(sum['ج']||0)*day;
    const withdrawal=(sum['انسحاب']||0)*day*5;
    const other=0;
    const project=projects.find(p=>String(p.name||'')===String(e.project||''));
    const insuranceBase=basic+(Number(e.housing)||0);
    const gosi=(project?.socialInsurance ? insuranceBase*(Number(project.socialInsuranceRate)||0)/100 : (Number(e.gosi)||0));
    const deduction=(sum['غ']||0)*day + gosi+(Number(e.otherded)||0)+absence+penalty+withdrawal+other;
    const net=gross-deduction;
    return {ym,day,allowances,overtime,gross,deduction,absence,penalty,withdrawal,other,net,gosi,insuranceBase};
  }
  function renderReports(){
    const projectMode=window.currentReport==='projects';
    const payrollCard=document.querySelector('#view-reports .full-page-data-card');
    const projectPanel=document.getElementById('projectReportsPanel');
    if(payrollCard) payrollCard.style.display=projectMode?'none':'';
    if(projectPanel) projectPanel.style.display=projectMode?'':'none';
    if(projectMode){
      renderProjects();
      renderProjectCapacity();
      return;
    }
    const body = document.getElementById('reportTableBody');
    if(!body)return;
    const q = (document.getElementById('payrollSearch')?.value || '').trim().toLowerCase();
    const list = employees.filter(e=>!q || [e.fullname,e.empcode,e.region,e.project,e.jobtitle].some(v=>String(v||'').toLowerCase().includes(q)));
    document.getElementById('payrollCount').textContent = `${list.length} موظف`;
    body.innerHTML = list.map((e,i)=>{
      const p=payrollStatementFor(e);
      return `<tr data-pay-row="${e.id}">
        <td class="mono">${i+1}</td><td><b>${escapeHtml(e.fullname||'—')}</b></td><td>${escapeHtml(e.project||e.region||'—')}</td><td>${escapeHtml(e.jobtitle||'—')}</td>
        <td class="mono">${fmt(p.day)}</td><td class="mono">${fmt(e.basicsalary)}</td><td class="mono">${fmt(p.allowances)}</td><td class="mono">${fmt(p.overtime)}</td><td class="mono">${fmt(p.gross)}</td>
        <td class="mono" title="التأمينات الاجتماعية من الأساسي + السكن">${fmt(p.gosi)}</td><td class="mono">${fmt(p.absence)}</td><td class="mono">${fmt(p.penalty)}</td><td class="mono">0</td><td class="mono">0</td><td class="mono">${fmt(p.withdrawal)}</td><td class="mono">${fmt(p.other)}</td><td class="mono">${fmt(p.deduction)}</td>
        <td class="mono" style="font-weight:700;color:var(--teal)">${fmt(p.net)}</td><td>${escapeHtml(e.bankname||'—')}</td><td>${escapeHtml(employeeContractStatus(e))}</td><td><button class="btn btn-sm payroll-edit-btn" data-emp="${e.id}">تعديل</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="21" class="empty-note">لا يوجد موظفون مطابقون.</td></tr>';
    body.querySelectorAll('.payroll-edit-btn').forEach(btn=>btn.addEventListener('click',()=>loadIntoForm(btn.dataset.emp)));
  }
  const payrollMonth=document.getElementById('payrollMonth'); if(payrollMonth){ payrollMonth.value=currentMonthStr(); payrollMonth.addEventListener('change', renderReports); }
  document.getElementById('payrollSearch').addEventListener('input', renderReports);
  document.getElementById('printReportBtn').addEventListener('click', ()=>window.print());

  /* ===== export / import ===== */
  document.getElementById('exportBtn')?.addEventListener('click', ()=>{
    const headers = ['الرقم الوظيفي','الاسم الكامل','رقم الهوية','القسم','المسمى الوظيفي','حالة العقد','الراتب الأساسي','بدل السكن','بدل المواصلات','بدلات أخرى','الخصومات','صافي الراتب','رقم الآيبان','البنك','الهاتف','البريد الإلكتروني'];
    const rows = employees.map(e=>[e.empcode,e.fullname,e.idnum,e.dept,e.jobtitle,employeeContractStatus(e),e.basicsalary,e.housing,e.transport,e.otherallow,(Number(e.otherded)||0),netSalary(e),e.iban,e.bankname,e.phone,e.email]);
    let csv = '\uFEFF' + headers.join(',') + '\n' + rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'employees_export.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تصدير الملف بصيغة CSV');
  });
  document.getElementById('importBtnNav')?.addEventListener('click', ()=>document.getElementById('importFile')?.click());
  document.getElementById('importFile')?.addEventListener('change', (ev)=>{
    const file = ev.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if(Array.isArray(data)){
          employees = data;
          saveEmployees();
          showToast('تم استيراد البيانات بنجاح');
          switchView('employees');
        }else{ showToast('صيغة الملف غير صحيحة'); }
      }catch(e){ showToast('تعذّر قراءة الملف'); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  });

  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s){ return escapeHtml(s); }

  /* ===== attendance ===== */
  function daysInMonth(ym){
    const [y,m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function currentMonthStr(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function attSummaryFor(ym, empId){
    const rec = (attendance[ym] && attendance[ym][empId]) || {};
    const counts = {'ح':0,'غ':0,'ط':0,'ج':0,'راحة':0,'اضافي':0,'انسحاب':0,'عيد':0};
    Object.values(rec).forEach(code=>{ if(counts.hasOwnProperty(code)) counts[code]++; });
    return counts;
  }
  function refreshAttendanceFilters(){
    const region=document.getElementById('attRegionFilter'), project=document.getElementById('attProjectFilter');
    if(!region || !project) return;
    const rv=region.value, pv=project.value;
    const regionsList=Array.from(new Set(employees.map(e=>e.region).filter(Boolean))).sort();
    const projectsList=Array.from(new Set(employees.map(e=>e.project).filter(Boolean))).sort();
    region.innerHTML='<option value="">كل المناطق</option>'+regionsList.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
    project.innerHTML='<option value="">كل المشاريع</option>'+projectsList.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
    region.value=rv; project.value=pv;
  }

  function renderAttendance(){
    const monthInput = document.getElementById('attMonth');
    if(!monthInput.value) monthInput.value = currentMonthStr();
    const ym = monthInput.value;
    const nDays = daysInMonth(ym);
    refreshAttendanceFilters();
    const nameQ=(document.getElementById('attNameSearch')?.value||'').trim().toLowerCase();
    const codeQ=(document.getElementById('attCodeSearch')?.value||'').trim().toLowerCase();
    const regionQ=document.getElementById('attRegionFilter')?.value||'';
    const projectQ=document.getElementById('attProjectFilter')?.value||'';
    const head = document.getElementById('attHeadRow');
    let headHtml = '<th class="name-col">الموظف</th><th>الكود</th><th>المنطقة</th><th>المشروع</th><th>دوام</th><th>غياب</th><th>تغطية</th><th>جزاء</th><th>راحات</th><th>اضافي</th><th>انسحاب</th>';
    for(let d=1; d<=nDays; d++) headHtml += `<th>${d}</th>`;
    headHtml += '<th>الإجراء</th>';
    head.innerHTML = headHtml;

    const list = employees.filter(e=>{
      return (!nameQ || String(e.fullname||'').toLowerCase().includes(nameQ)) &&
             (!codeQ || String(e.empcode||'').toLowerCase().includes(codeQ)) &&
             (!regionQ || String(e.region||'')===regionQ) &&
             (!projectQ || String(e.project||'')===projectQ);
    });
    const body = document.getElementById('attBody');
    if(list.length===0){ body.innerHTML = '<tr><td colspan="50" class="empty-note">لا توجد نتائج مطابقة.</td></tr>'; return; }
    body.innerHTML = list.map(e=>{
      const sum = attSummaryFor(ym, e.id);
      const rec = (attendance[ym] && attendance[ym][e.id]) || {};
      let cells = `<td class="name-col">${escapeHtml(e.fullname)}</td>
        <td class="mono">${escapeHtml(e.empcode||'—')}</td>
        <td>${escapeHtml(e.region||'—')}</td>
        <td>${escapeHtml(e.project||'—')}</td>
        <td class="sum-col" data-sum="ح" data-emp="${e.id}">${sum['ح']}</td>
        <td class="sum-col" data-sum="غ" data-emp="${e.id}">${sum['غ']}</td>
        <td class="sum-col" data-sum="ط" data-emp="${e.id}">${sum['ط']}</td>
        <td class="sum-col" data-sum="ج" data-emp="${e.id}">${sum['ج']}</td>
        <td class="sum-col" data-sum="راحة" data-emp="${e.id}">${sum['راحة']}</td>
        <td class="sum-col" data-sum="اضافي" data-emp="${e.id}">${sum['اضافي']}</td>
        <td class="sum-col" data-sum="انسحاب" data-emp="${e.id}">${sum['انسحاب']}</td>`;
      for(let d=1; d<=nDays; d++){
        const code = rec[d] || '';
        const opts = ATT_CODES.map(c=>`<option value="${c}" ${c===code?'selected':''}>${c||'—'}</option>`).join('');
        cells += `<td><select class="att-select code-${code}" data-emp="${e.id}" data-day="${d}" disabled>${opts}</select></td>`;
      }
      cells += `<td><div class="att-actions"><button class="btn btn-sm att-edit-btn" data-emp="${e.id}">تعديل</button><button class="btn btn-sm btn-primary att-save-btn" data-emp="${e.id}" style="display:none">حفظ</button></div></td>`;
      return `<tr data-att-row="${e.id}">${cells}</tr>`;
    }).join('');

    body.querySelectorAll('.att-edit-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const row = body.querySelector(`tr[data-att-row="${btn.dataset.emp}"]`);
        if(!row) return;
        row.querySelectorAll('.att-select').forEach(sel=>sel.disabled=false);
        btn.style.display='none';
        const saveBtn=row.querySelector('.att-save-btn');
        if(saveBtn) saveBtn.style.display='inline-flex';
      });
    });
    body.querySelectorAll('.att-save-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const row = body.querySelector(`tr[data-att-row="${btn.dataset.emp}"]`);
        if(!row) return;
        const empId = btn.dataset.emp;
        attendance[ym] = attendance[ym] || {};
        attendance[ym][empId] = attendance[ym][empId] || {};
        row.querySelectorAll('.att-select').forEach(sel=>{
          const day=sel.dataset.day, code=sel.value;
          if(code) attendance[ym][empId][day]=code; else delete attendance[ym][empId][day];
        });
        saveAttendance();
        row.querySelectorAll('.att-select').forEach(sel=>sel.disabled=true);
        btn.style.display='none';
        const editBtn=row.querySelector('.att-edit-btn');
        if(editBtn) editBtn.style.display='inline-flex';
        row.querySelectorAll('.sum-col').forEach(cell=>{ const k=cell.dataset.sum; cell.textContent=attSummaryFor(ym,empId)[k]||0; });
        showToast('تم حفظ الحضور للموظف');
      });
    });
  }
  document.getElementById('attMonth').addEventListener('change', renderAttendance);
  document.getElementById('attNameSearch').addEventListener('input', renderAttendance);
  document.getElementById('attCodeSearch').addEventListener('input', renderAttendance);
  document.getElementById('attRegionFilter').addEventListener('change', renderAttendance);
  document.getElementById('attProjectFilter').addEventListener('change', renderAttendance);
  document.getElementById('attExportBtn').addEventListener('click', ()=>{
    const ym = document.getElementById('attMonth').value || currentMonthStr();
    const nDays = daysInMonth(ym);
    const headers = ['الموظف','الكود','المنطقة','المشروع','دوام','غياب','تغطية','جزاء','راحات','اضافي','انسحاب', ...Array.from({length:nDays},(_,i)=>String(i+1))];
    const rows = employees.map(e=>{
      const s = attSummaryFor(ym, e.id); const rec=(attendance[ym]&&attendance[ym][e.id])||{};
      return [e.fullname,e.empcode,e.region,e.project,s['ح'],s['غ'],s['ط'],s['ج'],s['راحة'],s['اضافي'],s['انسحاب'],...Array.from({length:nDays},(_,i)=>rec[i+1]||'')];
    });
    downloadCsv(`attendance_${ym}.csv`, headers, rows);
  });

  /* ===== penalties ===== */
  function refreshEmpSelect(selectEl, placeholder){
    selectEl.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') +
      employees.map(e=>`<option value="${e.id}">${escapeHtml(e.fullname)}</option>`).join('');
  }
  document.querySelectorAll('.reason-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.getElementById('p_type').value = chip.dataset.type;
      document.getElementById('p_days').value = chip.dataset.days;
    });
  });
  function renderPenalties(){
    refreshEmpSelect(document.getElementById('p_emp'), null);
    const body = document.getElementById('penaltyTableBody');
    const sorted = [...penalties].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    body.innerHTML = sorted.map(p=>{
      const emp = employees.find(e=>e.id===p.empId);
      return `<tr>
        <td>${escapeHtml(emp ? emp.fullname : 'موظف محذوف')}</td>
        <td class="mono">${escapeHtml(p.date||'')}</td>
        <td>${escapeHtml(p.type||'')}</td>
        <td class="mono">${escapeHtml(String(p.days??''))}</td>
        <td>${escapeHtml(p.notes||'')}</td>
        <td><button class="btn icon-btn btn-ghost btn-danger" data-del="${p.id}" title="حذف">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-note">لا توجد جزاءات مسجلة.</td></tr>';
    body.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(confirm('هل تريد حذف هذا الجزاء؟')){
          penalties = penalties.filter(p=>p.id!==btn.dataset.del);
          savePenalties(); renderPenalties();
        }
      });
    });
  }
  document.getElementById('penaltyForm').addEventListener('submit', (ev)=>{
    ev.preventDefault();
    penalties.push({
      id:'p'+Date.now(),
      empId: document.getElementById('p_emp').value,
      date: document.getElementById('p_date').value,
      type: document.getElementById('p_type').value,
      days: document.getElementById('p_days').value,
      notes: document.getElementById('p_notes').value
    });
    savePenalties();
    ev.target.reset();
    renderPenalties();
    showToast('تم تسجيل الجزاء');
  });
  function renderAttendanceAndPenalties(){ renderAttendance(); renderPenalties(); }

  /* ===== coverage ===== */
  const SA_BANKS = {
    '01':'البنك المركزي السعودي','05':'مصرف الإنماء','10':'البنك الأهلي السعودي','15':'بنك البلاد','20':'بنك الرياض','30':'البنك العربي الوطني','36':'بنك D360','40':'مجموعة سامبا المالية (رمز سابق)','45':'البنك السعودي الأول (SAB)','50':'البنك السعودي الأول (رمز سابق)','55':'البنك السعودي الفرنسي','60':'بنك الجزيرة','65':'البنك السعودي للاستثمار','71':'بنك البحرين الوطني','72':'بنك قطر الوطني','75':'بنك الكويت الوطني','76':'بنك مسقط','78':'بنك إس تي سي','79':'المصرف الأهلي العراقي','80':'مصرف الراجحي','81':'دويتشه بنك','82':'بنك باكستان','83':'بنك الدولة الهندي','84':'بنك زراعات التركي','85':'بي إن بي باريبا','86':'جي بي مورغان تشيس','87':'البنك الصناعي والتجاري الصيني','88':'بنك ميتسوبيشي UFJ','89':'كريدي سويس','90':'بنك الخليج الدولي','91':'ستاندرد تشارترد','92':'بنك صحار الدولي','93':'بنك فيجن','95':'بنك الإمارات دبي الوطني'
  };
  const DEFAULT_COV_SHIFTS=['الأولى','الثانية','الثالثة'];
  function coverageShifts(){
    const a=Array.isArray(settings?.coverageShifts)?settings.coverageShifts:[];
    return [...new Set([...DEFAULT_COV_SHIFTS,...a.map(x=>String(x||'').trim()).filter(Boolean)])];
  }
  function saveCoverageSettings(){ persistCloud(); }
  function renderCoverageGuardOptions(selected=''){
    const el=document.getElementById('c_guard'); if(!el)return;
    const manual=(coverage||[]).filter(c=>c.guardType==='manual'&&c.guardName).map(c=>({id:c.guardId||('manual:'+c.guardName),name:c.guardName}));
    const map=new Map();
    employees.forEach(e=>{ if(e?.id && e?.fullname) map.set(e.id,e.fullname); });
    manual.forEach(x=>{ if(!map.has(x.id)) map.set(x.id,x.name); });
    el.innerHTML='<option value="">اختر الحارس</option>'+[...map.entries()].map(([id,name])=>`<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`).join('');
    if(selected!==undefined)el.value=selected;
  }
  function renderCoverageAbsentOptions(selected=''){
    const el=document.getElementById('c_absent'); if(!el)return;
    el.innerHTML='<option value="">اختر الحارس الغائب</option>'+employees.filter(e=>e?.id&&e?.fullname).map(e=>`<option value="${escapeAttr(e.id)}">${escapeHtml(e.fullname)}</option>`).join('');
    el.value=selected||'';
  }
  function renderCoverageShiftOptions(selected=''){
    const el=document.getElementById('c_shift'); if(!el)return;
    el.innerHTML=coverageShifts().map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('');
    el.value=selected&&coverageShifts().includes(selected)?selected:(coverageShifts()[0]||'');
  }
  function renderCoverageLocationOptions(selected=''){
    const el=document.getElementById('c_location'); if(!el)return;
    const names=[...new Set(projects.map(p=>String(p?.name||'').trim()).filter(Boolean))];
    el.innerHTML='<option value="">اختر الموقع / المشروع</option>'+names.map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('');
    el.value=names.includes(selected)?selected:'';
  }
  function projectGuardSalary(projectName){
    const p=projects.find(x=>String(x?.name||'')===String(projectName||''));
    if(!p)return 0;
    const rows=Array.isArray(p.costItems?.guards)?p.costItems.guards:[];
    const row=rows.find(x=>Number(x?.unit)>0)||rows[0];
    return Number(row?.unit ?? p.costGuard ?? p.guardBasic ?? 0)||0;
  }
  function updateCoverageAmount(force=false){
    const amountEl=document.getElementById('c_amount'), loc=document.getElementById('c_location'), hint=document.getElementById('covAmountHint');
    if(!amountEl||!loc)return;
    if(amountEl.dataset.manual==='1'&&!force)return;
    const salary=projectGuardSalary(loc.value), daily=salary/30;
    amountEl.value=salary?daily.toFixed(2):'';
    if(hint)hint.textContent=salary?`راتب الحارس في المشروع: ${fmt(salary)} ريال ÷ 30 = ${daily.toFixed(2)} ريال لليوم.`:'اختر المشروع ليتم احتساب اليومية من راتب الحارس في المشروع ÷ 30.';
  }
  function updateCoverageBank(){
    const el=document.getElementById('c_iban'); if(!el)return;
    let v=String(el.value||'').toUpperCase().replace(/\s+/g,'');
    if(v && !v.startsWith('SA')) v='SA'+v.replace(/[^0-9]/g,'');
    v=v.slice(0,24); el.value=v;
    const bankCode=v.length>=6?v.slice(4,6):'';
    document.getElementById('c_bank').value=SA_BANKS[bankCode]||'';
    document.getElementById('c_account').value=v.length===24?v.slice(-18):'';
  }
  function resetCoverageForm(){
    const f=document.getElementById('coverageForm'); if(!f)return;
    f.reset(); document.getElementById('c_id').value='';
    document.getElementById('c_amount').dataset.manual='';
    document.getElementById('c_delegate_holder').style.display='none';
    document.getElementById('c_holder').value='';
    renderCoverageGuardOptions(''); renderCoverageAbsentOptions(''); renderCoverageShiftOptions(''); renderCoverageLocationOptions('');
    document.getElementById('c_date').value=new Date().toISOString().slice(0,10);
    updateCoverageAmount(true); updateCoverageBank();
  }
  function openCoverageManualGuard(){
    const name=prompt('اكتب اسم الحارس رباعي الاسم'); if(!name)return;
    const parts=name.trim().split(/\s+/).filter(Boolean);
    if(parts.length<4){showToast('يجب إدخال الاسم رباعي');return;}
    const id='manual:'+Date.now();
    const el=document.getElementById('c_guard');
    renderCoverageGuardOptions('');
    const opt=document.createElement('option'); opt.value=id; opt.textContent=name.trim(); el.appendChild(opt); el.value=id;
    el.dataset.manualName=name.trim();
    document.getElementById('c_holder').value=name.trim();
  }
  function addCoverageShift(){
    const name=prompt('اكتب اسم الوردية الجديدة'); if(!name)return;
    const value=name.trim(); if(!value)return;
    settings.coverageShifts=coverageShifts().concat(value).filter((x,i,a)=>a.indexOf(x)===i);
    saveCoverageSettings(); renderCoverageShiftOptions(value); showToast('تمت إضافة الوردية');
  }
  function renderCoverage(){
    renderCoverageGuardOptions(document.getElementById('c_guard')?.value||'');
    renderCoverageAbsentOptions(document.getElementById('c_absent')?.value||'');
    renderCoverageShiftOptions(document.getElementById('c_shift')?.value||'');
    renderCoverageLocationOptions(document.getElementById('c_location')?.value||'');
    const fs=document.getElementById('covFilterStatus').value;
    let list=[...coverage].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    if(fs)list=list.filter(c=>c.status===fs);
    const body=document.getElementById('covTableBody');
    body.innerHTML=list.map(c=>`<tr><td>${escapeHtml(c.guardName||'')}</td><td>${escapeHtml(c.shift||'')}</td><td>${escapeHtml(c.location||'')}</td><td class="mono">${escapeHtml(c.date||'')}</td><td>${escapeHtml(c.absentName||c.absent||'')}</td><td>${escapeHtml(c.status||'')}</td><td class="mono">${fmt(c.amount)}</td><td>${escapeHtml(c.holder||'')}</td><td>${escapeHtml(c.bank||'')}</td><td class="mono">${escapeHtml(c.accountno||'')}</td><td><button class="btn btn-sm" data-cov-edit="${c.id}">تعديل</button> <button class="btn icon-btn btn-ghost btn-danger" data-del="${c.id}" title="حذف">✕</button></td></tr>`).join('')||'<tr><td colspan="11" class="empty-note">لا توجد تغطيات مسجلة.</td></tr>';
    document.getElementById('covTotal').textContent=fmt(list.reduce((sum,c)=>sum+(Number(c.amount)||0),0));
    body.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=()=>{if(confirm('هل تريد حذف سجل التغطية هذا؟')){coverage=coverage.filter(c=>c.id!==btn.dataset.del);saveCoverage();renderCoverage();}});
    body.querySelectorAll('[data-cov-edit]').forEach(btn=>btn.onclick=()=>loadCoverageForEdit(btn.dataset.covEdit));
  }
  function loadCoverageForEdit(id){
    const c=coverage.find(x=>x.id===id); if(!c)return;
    document.getElementById('c_id').value=c.id;
    renderCoverageGuardOptions(c.guardId||'');
    if(c.guardType==='manual')document.getElementById('c_guard').dataset.manualName=c.guardName||'';
    renderCoverageShiftOptions(c.shift||''); renderCoverageLocationOptions(c.location||''); renderCoverageAbsentOptions(c.absentId||'');
    document.getElementById('c_date').value=c.date||''; document.getElementById('c_status').value=c.status||'غياب';
    document.getElementById('c_amount').value=c.amount??''; document.getElementById('c_amount').dataset.manual=c.amountManual?'1':'';
    document.getElementById('c_holder').value=c.guardName||''; document.getElementById('c_delegate').checked=!!c.delegated;
    document.getElementById('c_delegate_holder').value=c.delegateHolder||''; document.getElementById('c_delegate_holder').style.display=c.delegated?'block':'none';
    document.getElementById('c_iban').value=c.iban||''; updateCoverageBank(); document.getElementById('c_notes').value=c.notes||'';
    updateCoverageAmount(false); window.scrollTo({top:0,behavior:'smooth'}); showToast('تم فتح التغطية للتعديل');
  }
  document.getElementById('covFilterStatus').addEventListener('change',renderCoverage);
  document.getElementById('c_location').addEventListener('change',()=>{document.getElementById('c_amount').dataset.manual='';updateCoverageAmount(true);});
  document.getElementById('c_amount').addEventListener('input',()=>document.getElementById('c_amount').dataset.manual='1');
  document.getElementById('c_iban').addEventListener('input',updateCoverageBank);
  document.getElementById('c_delegate').addEventListener('change',function(){const show=this.checked;document.getElementById('c_delegate_holder').style.display=show?'block':'none';if(show)document.getElementById('c_delegate_holder').focus();});
  document.getElementById('c_guard').addEventListener('change',function(){const id=this.value;const e=employees.find(x=>x.id===id);document.getElementById('c_holder').value=e?.fullname||this.dataset.manualName||'';});
  document.getElementById('covAddGuardBtn').addEventListener('click',openCoverageManualGuard);
  document.getElementById('covAddShiftBtn').addEventListener('click',addCoverageShift);
  document.getElementById('covOtherAmountBtn').addEventListener('click',()=>{document.getElementById('c_amount').dataset.manual='1';document.getElementById('c_amount').value='';document.getElementById('c_amount').focus();showToast('اكتب المبلغ الذي تريده');});
  document.getElementById('covResetBtn').addEventListener('click',resetCoverageForm);
  document.getElementById('covNewBtn').addEventListener('click',resetCoverageForm);
  document.getElementById('covSaveNewBtn').addEventListener('click',()=>{document.getElementById('coverageForm').dataset.saveNew='1';document.getElementById('coverageForm').requestSubmit();});
  document.getElementById('coverageForm').addEventListener('submit',(ev)=>{
    ev.preventDefault();
    const guardEl=document.getElementById('c_guard'), guardId=guardEl.value, employee=employees.find(e=>e.id===guardId), manualName=guardEl.dataset.manualName||'';
    if(!employee&&!manualName){showToast('اختر الحارس أو استخدم زر إضافة حارس');return;}
    const absentId=document.getElementById('c_absent').value, absent=employees.find(e=>e.id===absentId);
    if(!absent){showToast('الحارس الغائب يجب أن يكون مضافًا مسبقًا في الموظفين');return;}
    const location=document.getElementById('c_location').value, salary=projectGuardSalary(location);
    const amount=Number(document.getElementById('c_amount').value)||0;
    if(!amount){showToast('يرجى إدخال المستحق أو اختيار المشروع لاحتسابه تلقائيًا');return;}
    const delegated=document.getElementById('c_delegate').checked, delegateHolder=document.getElementById('c_delegate_holder').value.trim();
    if(delegated&&!delegateHolder){showToast('اكتب اسم صاحب الحساب عند تفعيل التفويض');return;}
    const data={id:document.getElementById('c_id').value||'c'+Date.now(),guardId:employee?.id||guardId,guardName:employee?.fullname||manualName,guardType:employee?'employee':'manual',shift:document.getElementById('c_shift').value,location,date:document.getElementById('c_date').value,absentId,absentName:absent.fullname,status:document.getElementById('c_status').value,amount,amountManual:document.getElementById('c_amount').dataset.manual==='1',projectGuardSalary:salary,holder:delegated?delegateHolder:(employee?.fullname||manualName),delegated,delegateHolder,iban:document.getElementById('c_iban').value.toUpperCase(),bank:document.getElementById('c_bank').value,accountno:document.getElementById('c_account').value,notes:document.getElementById('c_notes').value};
    const idx=coverage.findIndex(x=>x.id===data.id); if(idx>=0)coverage[idx]=data; else coverage.push(data);
    saveCoverage(); renderCoverage(); const makeNew=document.getElementById('coverageForm').dataset.saveNew==='1'; delete document.getElementById('coverageForm').dataset.saveNew; showToast(idx>=0?'تم تحديث التغطية':'تم حفظ التغطية'); if(makeNew)resetCoverageForm();
  });
  document.getElementById('covExportBtn').addEventListener('click',()=>{
    const headers=['اسم الحارس القائم بالتغطية','الوردية','الموقع','التاريخ','الحارس الغائب','الحالة','المستحق','اسم صاحب الحساب','الآيبان','البنك','رقم الحساب','ملاحظات'];
    const rows=coverage.map(c=>[c.guardName,c.shift,c.location,c.date,c.absentName,c.status,c.amount,c.holder,c.iban,c.bank,c.accountno,c.notes]); downloadCsv('coverage_export.csv',headers,rows);
  });
  resetCoverageForm();

  function downloadCsv(filename, headers, rows){
    let csv = '\uFEFF' + headers.join(',') + '\n' + rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ===== project accounts / tender costing ===== */
  const paCountIds=['pa_guards','pa_supervisors','pa_patrols','pa_devices','pa_uniforms','pa_security_managers','pa_cones'];
  const paRoleDefs=[
    {key:'guards',label:'حراس الأمن',countId:'pa_guards'},
    {key:'supervisors',label:'المشرفون',countId:'pa_supervisors'},
    {key:'securityManagers',label:'مدراء الأمن',countId:'pa_security_managers'}
  ];
  function paVal(id){
    const raw=document.getElementById(id)?.value;
    if(raw===undefined || raw===null || raw==='') return 0;
    const normalized=String(raw).replace(/[٬,]/g,'').replace('٫','.').trim();
    return Number(normalized)||0;
  }
  function paMoney(n){return (Number(n)||0).toLocaleString('ar-SA',{maximumFractionDigits:2})+' ريال';}
  function syncProjectDuration(source){
    const daysEl=document.getElementById('pa_days'), monthsEl=document.getElementById('pa_months');
    if(!daysEl||!monthsEl) return;
    if(source==='days') monthsEl.value=(Math.max(0,Number(daysEl.value)||0)/30).toFixed(2).replace(/\.00$/,'');
    else daysEl.value=(Math.max(0,Number(monthsEl.value)||0)*30).toFixed(0);
    calculateProjectAccount();
  }
  function calcEOS(monthlyWage, years){
    if(years < 1) return 0;
    const first=Math.min(years,5)*0.5*monthlyWage;
    const later=Math.max(years-5,0)*monthlyWage;
    return first+later;
  }
  function paRoleCount(key){
    const d=paRoleDefs.find(x=>x.key===key); return d ? Math.max(0,Math.floor(paVal(d.countId))) : 0;
  }
  function paRoleField(role,key,def=0){
    const id=`pa_${role}_${key}`; let el=document.getElementById(id);
    if(!el){ el=document.createElement('input'); el.type='hidden'; el.id=id; el.value=def; document.body.appendChild(el); }
    return el;
  }
  function paRoleNum(role,key,def=0){ const el=document.getElementById(`pa_${role}_${key}`); return el ? (Number(el.value)||0) : def; }
  function renderProjectRolePanels(resetValues){
    const active=paRoleDefs.filter(r=>paRoleCount(r.key)>0);
    const ids=['pa_salary_roles','pa_gosi_roles','pa_leave_roles','pa_rest_roles','pa_medical_roles','pa_eos_roles'];
    const keptValues={};
    if(!resetValues) ids.forEach(cid=>document.querySelectorAll('#'+cid+' input').forEach(i=>{ if(i.id && !i.readOnly) keptValues[i.id]=i.value; }));
    ids.forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
    const roleSummary=document.getElementById('pa_role_summary');
    if(roleSummary){
      roleSummary.innerHTML=active.length?active.map(r=>`<span class="pill pill-blue">${r.label}: ${paRoleCount(r.key)}</span>`).join(' '):'<span class="pill pill-gray">لم تتم إضافة أفراد بعد</span>';
    }
    const salary=document.getElementById('pa_salary_roles');
    active.forEach(r=>{
      const basic=paRoleNum(r.key,'basic',r.key==='guards'?3000:0), hp=paRoleNum(r.key,'housing_pct',0), tp=paRoleNum(r.key,'transport_pct',0), op=paRoleNum(r.key,'other',0);
      const box=document.createElement('div'); box.className='pa-role-block'; box.innerHTML=`
        <div class="pa-role-title"><b>${r.label}</b><span>${paRoleCount(r.key)} فرد</span></div>
        <div class="field-grid">
          <div class="field"><label>الراتب الأساسي / شهر</label><input type="number" id="pa_${r.key}_basic" min="0" step="0.01" value="${basic}"></div>
          <div class="field"><label>بدل السكن %</label><input type="number" id="pa_${r.key}_housing_pct" min="0" step="0.01" value="${hp}"></div>
          <div class="field"><label>بدل المواصلات %</label><input type="number" id="pa_${r.key}_transport_pct" min="0" step="0.01" value="${tp}"></div>
          <div class="field"><label>البدلات الأخرى (مبلغ ريال / شهر)</label><input type="number" id="pa_${r.key}_other" min="0" step="0.01" placeholder="0" value="${op}"></div>
          <div class="field"><label>بدل السكن المحسوب / شهر</label><input id="pa_${r.key}_housing" readonly></div>
          <div class="field"><label>بدل المواصلات المحسوب / شهر</label><input id="pa_${r.key}_transport" readonly></div>
          <div class="field"><label>الأجر الأخير / شهر</label><input id="pa_${r.key}_finalwage" readonly></div>
        </div>
        <div class="pa-results three-results"><div><span>الفرد / شهر</span><b id="pa_${r.key}_salary_emp_month">0 ريال</b></div><div><span>جميع ${r.label} / شهر</span><b id="pa_${r.key}_salary_all_month">0 ريال</b></div><div><span>جميع ${r.label} / مدة المشروع</span><b id="pa_${r.key}_salary_total">0 ريال</b></div></div>`;
      salary.appendChild(box);
    });
    const renderRoleMetric=(containerId,kind)=>{
      const container=document.getElementById(containerId); if(!container)return;
      active.forEach(r=>{
        let html='';
        if(kind==='gosi') html=`<div class="pa-role-title"><b>${r.label}</b><span>${paRoleCount(r.key)} فرد</span></div><div class="pa-role-metric"><span>راتب خاضع للتأمينات / شهر</span><b id="pa_${r.key}_gosi_base_view">0 ريال</b><span>حصة الموظف / شهر</span><b id="pa_${r.key}_gosi_emp_view">0 ريال</b><span>حصة الشركة / شهر</span><b id="pa_${r.key}_gosi_company_view">0 ريال</b><span>إجمالي الشركة / مدة المشروع</span><b id="pa_${r.key}_gosi_total_view">0 ريال</b></div>`;
        if(kind==='leave') html=`<div class="pa-role-title"><b>${r.label}</b><span>${paRoleCount(r.key)} فرد</span></div><div class="pa-role-metric"><span>الأجر المستخدم للحساب</span><b id="pa_${r.key}_leave_wage_view">0 ريال</b><span>مخصص الفرد / مدة المشروع</span><b id="pa_${r.key}_leave_emp_view">0 ريال</b><span>إجمالي الفئة</span><b id="pa_${r.key}_leave_total_view">0 ريال</b></div>`;
        if(kind==='rest') html=`<div class="pa-role-title"><b>${r.label}</b><span>${paRoleCount(r.key)} فرد</span></div><div class="field-grid"><div class="field"><label>بديل الراحات / فرد / شهر</label><input type="number" id="pa_${r.key}_rest" min="0" step="0.01" value="0"></div><div class="field"><label>إجمالي الفئة / شهر</label><input id="pa_${r.key}_rest_total_month" readonly></div><div class="field"><label>إجمالي الفئة / مدة المشروع</label><input id="pa_${r.key}_rest_total" readonly></div></div>`;
        if(kind==='medical') html=`<div class="pa-role-title"><b>${r.label}</b><span>${paRoleCount(r.key)} فرد</span></div><div class="field-grid"><div class="field"><label>التأمين الطبي / فرد / سنة</label><input type="number" id="pa_${r.key}_medical" min="0" step="0.01" value="0"></div><div class="field"><label>إجمالي الفئة / شهر</label><input id="pa_${r.key}_medical_total_month" readonly></div><div class="field"><label>إجمالي الفئة / مدة المشروع</label><input id="pa_${r.key}_medical_total" readonly></div></div>`;
        if(kind==='eos') html=`<div class="pa-role-title"><b>${r.label}</b><span>${paRoleCount(r.key)} فرد</span></div><div class="pa-role-metric"><span>مدة الخدمة المحتسبة</span><b id="pa_${r.key}_eos_years_view">0</b><span>مخصص الفرد</span><b id="pa_${r.key}_eos_emp_view">0 ريال</b><span>إجمالي الفئة</span><b id="pa_${r.key}_eos_total_view">0 ريال</b></div>`;
        container.insertAdjacentHTML('beforeend',`<div class="pa-role-block">${html}</div>`);
      });
    };
    renderRoleMetric('pa_gosi_roles','gosi'); renderRoleMetric('pa_leave_roles','leave'); renderRoleMetric('pa_rest_roles','rest'); renderRoleMetric('pa_medical_roles','medical'); renderRoleMetric('pa_eos_roles','eos');
    Object.keys(keptValues).forEach(id=>{const el=document.getElementById(id); if(el && !el.readOnly) el.value=keptValues[id];});
    document.getElementById('pa_uniforms_view')?.setAttribute('value',String(paVal('pa_uniforms')));
    document.getElementById('pa_devices_view')?.setAttribute('value',String(paVal('pa_devices')));
    document.getElementById('pa_cones_view')?.setAttribute('value',String(paVal('pa_cones')));
    document.getElementById('pa_uniforms_view') && (document.getElementById('pa_uniforms_view').value=paVal('pa_uniforms'));
    document.getElementById('pa_devices_view') && (document.getElementById('pa_devices_view').value=paVal('pa_devices'));
    document.getElementById('pa_cones_view') && (document.getElementById('pa_cones_view').value=paVal('pa_cones'));
    calculateProjectAccount();
  }
  function roleData(key){
    const count=paRoleCount(key), basic=paRoleNum(key,'basic',0), housingPct=paRoleNum(key,'housing_pct',0), transportPct=paRoleNum(key,'transport_pct',0);
    const housing=basic*housingPct/100, transport=basic*transportPct/100, other=Math.max(0,paRoleNum(key,'other',0)), wage=basic+housing+transport+other;
    return {count,basic,housingPct,transportPct,housing,transport,other,wage};
  }
  function calculateProjectAccount(){
    const months=Math.max(0,paVal('pa_months')), days=Math.max(0,paVal('pa_days') || months*30), active=paRoleDefs.filter(r=>paRoleCount(r.key)>0);
    const totalHead=active.reduce((sum,r)=>sum+paRoleCount(r.key),0);
    const safeMonths=Math.max(months,1/30);
    const roles=active.map(r=>({def:r,data:roleData(r.key)}));
    const salaryTotal=roles.reduce((sum,x)=>sum+x.data.wage*x.data.count*months,0), salaryAllMonth=roles.reduce((sum,x)=>sum+x.data.wage*x.data.count,0);
    const gosiEnabled=!!document.getElementById('pa_gosi_enabled')?.checked, empGosiPct=paVal('pa_gosi_employee_pct'), companyGosiPct=paVal('pa_gosi_company_pct');
    let gosiTotal=0, employeeGosiTotal=0;
    roles.forEach(x=>{const base=x.data.basic+x.data.housing, emp=gosiEnabled?base*empGosiPct/100:0, comp=gosiEnabled?base*companyGosiPct/100:0, total=comp*x.data.count*months;gosiTotal+=total;employeeGosiTotal+=emp*x.data.count*months;const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=Number(v||0);};const text=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=paMoney(v);};set(`pa_${x.def.key}_housing`,x.data.housing);set(`pa_${x.def.key}_transport`,x.data.transport);set(`pa_${x.def.key}_finalwage`,x.data.wage);text(`pa_${x.def.key}_salary_emp_month`,x.data.wage);text(`pa_${x.def.key}_salary_all_month`,x.data.wage*x.data.count);text(`pa_${x.def.key}_salary_total`,x.data.wage*x.data.count*months);text(`pa_${x.def.key}_gosi_base_view`,base);text(`pa_${x.def.key}_gosi_emp_view`,emp);text(`pa_${x.def.key}_gosi_company_view`,comp);text(`pa_${x.def.key}_gosi_total_view`,total);});
    const leaveEnabled=!!document.getElementById('pa_leave_enabled')?.checked, leaveDays=paVal('pa_leave_days')||21, eligibleAnnual=months>=12, accruedLeave=eligibleAnnual?(months/12)*leaveDays:0;
    let leaveTotal=0;
    roles.forEach(x=>{const emp=leaveEnabled&&eligibleAnnual?x.data.wage/30*accruedLeave:0,total=emp*x.data.count;leaveTotal+=total;const text=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=paMoney(v);};text(`pa_${x.def.key}_leave_wage_view`,x.data.wage);text(`pa_${x.def.key}_leave_emp_view`,emp);text(`pa_${x.def.key}_leave_total_view`,total);});
    let restTotal=0, medicalTotal=0, eosTotal=0, years=months/12;
    roles.forEach(x=>{const restEmp=paRoleNum(x.def.key,'rest',0),restMonth=restEmp*x.data.count,restContract=restMonth*months;restTotal+=restContract;const rm=document.getElementById(`pa_${x.def.key}_rest_total_month`),rc=document.getElementById(`pa_${x.def.key}_rest_total`);if(rm)rm.value=restMonth.toFixed(2);if(rc)rc.value=restContract.toFixed(2);
      const medAnnual=paRoleNum(x.def.key,'medical',0),medMonth=medAnnual/12*x.data.count,medContract=medMonth*months;medicalTotal+=medContract;const mm=document.getElementById(`pa_${x.def.key}_medical_total_month`),mc=document.getElementById(`pa_${x.def.key}_medical_total`);if(mm)mm.value=medMonth.toFixed(2);if(mc)mc.value=medContract.toFixed(2);
      const eosEnabled=!!document.getElementById('pa_eos_enabled')?.checked,eosEmp=eosEnabled&&eligibleAnnual?calcEOS(x.data.wage,years):0,eosRoleTotal=eosEmp*x.data.count;eosTotal+=eosRoleTotal;const text=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=typeof v==='number'&&id.includes('years')?v.toFixed(2):paMoney(v);};text(`pa_${x.def.key}_eos_years_view`,years);text(`pa_${x.def.key}_eos_emp_view`,eosEmp);text(`pa_${x.def.key}_eos_total_view`,eosRoleTotal);
    });
    const securityTypes=[...document.querySelectorAll('#pa_security_types [data-type-row]')].map(row=>({name:row.querySelector('.pa-security-name')?.value?.trim()||'',price:Number(row.querySelector('.pa-security-price')?.value)||0,guards:Math.max(0,Number(row.querySelector('.pa-security-guards')?.value)||0),supervisors:Math.max(0,Number(row.querySelector('.pa-security-supervisors')?.value)||0),managers:Math.max(0,Number(row.querySelector('.pa-security-managers')?.value)||0)}));
    const securityUnitsTotal=securityTypes.reduce((sum,x)=>sum+x.guards*paRoleCount('guards')+x.supervisors*paRoleCount('supervisors')+x.managers*paRoleCount('securityManagers'),0),securityTotal=securityTypes.reduce((sum,x)=>sum+x.price*(x.guards*paRoleCount('guards')+x.supervisors*paRoleCount('supervisors')+x.managers*paRoleCount('securityManagers')),0);
    const commsTypes=[...document.querySelectorAll('#pa_comms_types [data-type-row]')].map(row=>({name:row.querySelector('.pa-comms-name')?.value?.trim()||'',price:Number(row.querySelector('.pa-comms-price')?.value)||0,guards:Math.max(0,Number(row.querySelector('.pa-comms-guards')?.value)||0),supervisors:Math.max(0,Number(row.querySelector('.pa-comms-supervisors')?.value)||0),managers:Math.max(0,Number(row.querySelector('.pa-comms-managers')?.value)||0)}));
    const commsUnitsTotal=commsTypes.reduce((sum,x)=>sum+x.guards*paRoleCount('guards')+x.supervisors*paRoleCount('supervisors')+x.managers*paRoleCount('securityManagers'),0),commsTotal=commsTypes.reduce((sum,x)=>sum+x.price*(x.guards*paRoleCount('guards')+x.supervisors*paRoleCount('supervisors')+x.managers*paRoleCount('securityManagers')),0);
    const patrolsCount=paVal('pa_patrols'),patrolPrice=paVal('pa_patrol_price'),patrolTotal=patrolsCount*patrolPrice*months;
    const conesCount=paVal('pa_cones'),conesPrice=paVal('pa_cones_price'),conesTotal=conesCount*conesPrice;
    const salaryReceivedTotal=salaryTotal-employeeGosiTotal;
    const cost=salaryReceivedTotal+gosiTotal+restTotal+medicalTotal+securityTotal+commsTotal+leaveTotal+eosTotal+patrolTotal+conesTotal;
    const profit=paVal('pa_profit'),offer=cost+profit;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=Number(v||0);};const text=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=paMoney(v);};
    set('pa_days',days);set('pa_months',months);set('pa_headcount',totalHead);set('pa_salary_total',salaryTotal);set('pa_gosi_total',gosiTotal);set('pa_leave_accrued',accruedLeave);set('pa_leave_total',leaveTotal);set('pa_rest',restTotal/safeMonths);set('pa_rest_total',restTotal);set('pa_medical',totalHead?medicalTotal/safeMonths/totalHead:0);set('pa_medical_total',medicalTotal);set('pa_security_total',securityTotal);set('pa_comms_total',commsTotal);set('pa_eos_years',years);set('pa_eos_total',eosTotal);set('pa_patrols_view',patrolsCount);set('pa_patrols_total',patrolTotal);set('pa_cones_total',conesTotal);set('pa_uniforms_view',paVal('pa_uniforms'));set('pa_devices_view',paVal('pa_devices'));set('pa_cones_view',conesCount);
    text('pa_salary_all_month',salaryAllMonth);text('pa_salary_total_view',salaryTotal);text('pa_total_personnel',totalHead);text('pa_gosi_all_month',gosiTotal/safeMonths);text('pa_gosi_total_view',gosiTotal);text('pa_gosi_employee_total_view',employeeGosiTotal);text('pa_leave_all_month',leaveTotal/safeMonths);text('pa_leave_total_view',leaveTotal);text('pa_rest_all_month',restTotal/safeMonths);text('pa_rest_total_view',restTotal);text('pa_rest_personnel',totalHead);text('pa_medical_all_month',medicalTotal/safeMonths);text('pa_medical_total_view',medicalTotal);text('pa_medical_personnel',totalHead);text('pa_security_all_month',securityTotal/safeMonths);text('pa_security_total_view',securityTotal);text('pa_security_units_total_view',securityUnitsTotal);text('pa_comms_all_month',commsTotal/safeMonths);text('pa_comms_total_view',commsTotal);text('pa_comms_units_total_view',commsUnitsTotal);text('pa_eos_all_month',eosTotal/safeMonths);text('pa_eos_total_view',eosTotal);text('pa_patrols_all_month',patrolTotal/safeMonths);text('pa_patrols_total_view',patrolTotal);text('pa_patrols_count_view',patrolsCount);text('pa_cones_all_month',conesTotal/safeMonths);text('pa_cones_total_view',conesTotal);text('pa_cones_count_view',conesCount);
    document.getElementById('pa_cost_total').textContent=paMoney(cost);document.getElementById('pa_profit_total').textContent=paMoney(profit);document.getElementById('pa_offer_total').textContent=paMoney(offer);
    const guardsCount=paRoleCount('guards');
    const itemsSum=cost+employeeGosiTotal;
    const perGuard=v=>guardsCount?paMoney(v/guardsCount):'—';
    const sharePct=v=>itemsSum>0?((v/itemsSum*100).toLocaleString('ar-SA',{maximumFractionDigits:2})+'%'):'—';
    const trow=(label,countTxt,monthly,contract,cls)=>`<div class="tender-row${cls?' '+cls:''}"><span>${label}</span><b>${countTxt}</b><b>${paMoney(monthly)}</b><b>${paMoney(contract)}</b><b>${perGuard(monthly)}</b><b>${perGuard(contract)}</b><b>${sharePct(contract)}</b></div>`;
    const roleRows=roles.map(x=>trow(x.def.label,x.data.count,x.data.wage*x.data.count,x.data.wage*x.data.count*months)).join('');
    document.getElementById('pa_tender_table').innerHTML=`<div class="tender-row tender-head"><span>الفئة / البند</span><span>العدد</span><span>التكلفة / شهر</span><span>التكلفة / مدة المشروع</span><span>تكلفة الحارس الواحد / شهر</span><span>تكلفة الحارس الواحد / مدة العقد</span><span>نسبة البند من التكلفة</span></div>${roleRows}${trow('التأمينات وحصة الشركة','—',gosiTotal/safeMonths,gosiTotal)}${trow('الإجازات','—',leaveTotal/safeMonths,leaveTotal)}${trow('بديل الراحات','—',restTotal/safeMonths,restTotal)}${trow('التأمين الطبي','—',medicalTotal/safeMonths,medicalTotal)}${trow('البدل',securityUnitsTotal,securityTotal/safeMonths,securityTotal)}${trow('أجهزة الاتصالات',commsUnitsTotal,commsTotal/safeMonths,commsTotal)}${trow('الدوريات والسيارات',patrolsCount,patrolTotal/safeMonths,patrolTotal)}${trow('الأقماع والملحقات',conesCount,conesTotal/safeMonths,conesTotal)}${trow('نهاية الخدمة','—',eosTotal/safeMonths,eosTotal)}<div class="tender-row total"><span>إجمالي التكلفة</span><b>—</b><b>${paMoney(cost/safeMonths)}</b><b>${paMoney(cost)}</b><b>${perGuard(cost/safeMonths)}</b><b>${perGuard(cost)}</b><b>${itemsSum>0?(100).toLocaleString('ar-SA')+'%':'—'}</b></div>`;
    text('pa_final_emp_month',totalHead?cost/safeMonths/totalHead:0);text('pa_final_all_month',cost/safeMonths);text('pa_final_contract',cost);
    document.getElementById('pa_breakdown').innerHTML=`<div>رواتب: <b>${paMoney(salaryTotal)}</b></div><div>تأمينات الشركة: <b>${paMoney(gosiTotal)}</b></div><div>إجازات: <b>${paMoney(leaveTotal)}</b></div><div>بديل الراحات: <b>${paMoney(restTotal)}</b></div><div>تأمين طبي: <b>${paMoney(medicalTotal)}</b></div><div>بدل وأمن: <b>${paMoney(securityTotal)}</b></div><div>اتصالات: <b>${paMoney(commsTotal)}</b></div><div>دوريات وسيارات: <b>${paMoney(patrolTotal)}</b></div><div>أقماع وملحقات: <b>${paMoney(conesTotal)}</b></div><div>نهاية الخدمة: <b>${paMoney(eosTotal)}</b></div>`;
    return {days,months,head:totalHead,roles,salaryTotal,gosiTotal,employeeGosiTotal,leaveTotal,restTotal,medicalTotal,securityTypes,securityUnitsTotal,securityTotal,commsTypes,commsUnitsTotal,commsTotal,patrolsCount,patrolPrice,patrolTotal,conesCount,conesPrice,conesTotal,years,eosTotal,cost,profit,offer,salaryAllMonth};
  }
  function saveProjectAccountRecord(){
    const calc=calculateProjectAccount(); const name=document.getElementById('pa_name').value.trim();
    if(!name){showToast('اكتب اسم المشروع أولاً');return;}
    const record={id:'pa'+Date.now(),name,...calc,createdAt:new Date().toISOString()}; projectAccounts.push(record);saveProjectAccounts();showToast('تم حفظ حساب المشروع');
  }
  function resetProjectAccount(){
    ['pa_name'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('pa_days').value=30;document.getElementById('pa_months').value=1;document.getElementById('pa_profit').value=500;
    paCountIds.forEach(id=>{const e=document.getElementById(id);if(e)e.value=0;});
    ['pa_gosi_employee_pct','pa_gosi_company_pct','pa_cones_price','pa_patrol_price'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=0;});
    document.getElementById('pa_leave_days').value='21';['pa_gosi_enabled','pa_leave_enabled','pa_eos_enabled'].forEach(id=>{const e=document.getElementById(id);if(e)e.checked=false;});
    renderProjectRolePanels(true);calculateProjectAccount();
  }
  function renderProjectAccount(){renderProjectRolePanels();}
  paCountIds.forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{renderProjectRolePanels();}));
  ['pa_days','pa_months'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>syncProjectDuration(id==='pa_days'?'days':'months')));
  ['pa_name','pa_profit','pa_gosi_employee_pct','pa_gosi_company_pct','pa_leave_days','pa_cones_price','pa_patrol_price','pa_gosi_enabled','pa_leave_enabled','pa_eos_enabled'].forEach(id=>document.getElementById(id)?.addEventListener('input',calculateProjectAccount));
  ['pa_gosi_enabled','pa_leave_enabled','pa_eos_enabled','pa_leave_days'].forEach(id=>document.getElementById(id)?.addEventListener('change',calculateProjectAccount));
  document.getElementById('view-projectaccounts')?.addEventListener('input',ev=>{if(ev.target.matches('input,select')) calculateProjectAccount();});
  function bindProjectTypeInputs(){
    document.querySelectorAll('#pa_security_types input, #pa_comms_types input').forEach(el=>{if(!el.dataset.paBound){el.addEventListener('input',calculateProjectAccount);el.dataset.paBound='1';}});
    document.querySelectorAll('.remove-type').forEach(btn=>{if(!btn.dataset.paBound){btn.addEventListener('click',()=>{const row=btn.closest('[data-type-row]');if(row?.parentElement?.querySelectorAll('[data-type-row]').length>1)row.remove();else row.querySelectorAll('input').forEach((i,idx)=>{i.value=idx===0?'':idx===1?'0':'0'});calculateProjectAccount();bindProjectTypeInputs();});btn.dataset.paBound='1';}});
  }
  function addProjectType(containerId,kind){
    const box=document.getElementById(containerId);if(!box)return;const row=document.createElement('div');row.className='type-row pa-uniform-row';row.setAttribute('data-type-row','');const isSec=kind==='security';
    row.innerHTML=`<div class="field"><label>${isSec?'نوع البدل':'نوع الجهاز'}</label><input type="text" class="${isSec?'pa-security-name':'pa-comms-name'}" value="${isSec?'شتوي':'STC'}"></div><div class="field"><label>${isSec?'السعر / بدلة':'السعر / جهاز'}</label><input type="number" class="${isSec?'pa-security-price':'pa-comms-price'}" min="0" value="0" step="0.01"></div><div class="field"><label>حراس / فرد</label><input type="number" class="${isSec?'pa-security-guards':'pa-comms-guards'}" min="0" value="0" step="1"></div><div class="field"><label>مشرفون / فرد</label><input type="number" class="${isSec?'pa-security-supervisors':'pa-comms-supervisors'}" min="0" value="0" step="1"></div><div class="field"><label>مدراء أمن / فرد</label><input type="number" class="${isSec?'pa-security-managers':'pa-comms-managers'}" min="0" value="0" step="1"></div><button type="button" class="small-btn danger remove-type" title="حذف">×</button>`;
    box.appendChild(row);bindProjectTypeInputs();calculateProjectAccount();
  }
  document.getElementById('addSecurityTypeBtn')?.addEventListener('click',()=>addProjectType('pa_security_types','security'));
  document.getElementById('addCommsTypeBtn')?.addEventListener('click',()=>addProjectType('pa_comms_types','comms'));
  bindProjectTypeInputs();
  document.getElementById('resetProjectAccountBtn')?.addEventListener('click',resetProjectAccount);
  document.getElementById('printProjectAccountBtn')?.addEventListener('click',()=>window.print());
  document.getElementById('saveProjectAccountBtn')?.addEventListener('click',saveProjectAccountRecord);
  renderProjectRolePanels();

  /* ===== employee contracts ===== */
  function contractFor(empId, contractId){
    if(contractId) return contracts.find(c=>c.id===contractId && c.empId===empId)||{};
    return contracts.find(c=>c.empId===empId)||{};
  }
  function contractDurationParts(start,end){
    if(!start || !end) return null;
    const s=new Date(start+'T00:00:00'), e=new Date(end+'T00:00:00');
    if(isNaN(s)||isNaN(e)||e<s) return null;
    let y=e.getFullYear()-s.getFullYear(), m=e.getMonth()-s.getMonth(), d=e.getDate()-s.getDate();
    if(d<0){ m--; const prev=new Date(e.getFullYear(),e.getMonth(),0); d+=prev.getDate(); }
    if(m<0){ y--; m+=12; }
    // Company contract rule: 30 days are treated as one full month.
    if(d>=30){ m++; d=0; }
    // If the calendar difference is one day short of a full month (e.g. 11 months + 30 days),
    // normalize it to the next whole month as required for contract duration.
    if(d===29){
      const monthStart=new Date(s.getFullYear()+y,s.getMonth()+m,s.getDate());
      if(!isNaN(monthStart) && e.getTime()-monthStart.getTime() >= 29*86400000){ m++; d=0; }
    }
    if(m>=12){ y+=Math.floor(m/12); m%=12; }
    return {y,m,d};
  }
  function contractDurationText(start,end){
    const parts=contractDurationParts(start,end);
    if(!parts) return '';
    const {y,m,d}=parts;
    const out=[];
    if(y) out.push(y===1?'سنة':y===2?'سنتان':`${y} سنوات`);
    if(m) out.push(m===1?'شهر':m===2?'شهران':`${m} أشهر`);
    if(d) out.push(d===1?'يوم':`${d} أيام`);
    return out.join(' و ') || 'يوم واحد';
  }
  function contractDurationMonths(start,end){
    const parts=contractDurationParts(start,end);
    if(!parts) return '';
    return parts.y*12+parts.m+(parts.d>=30?1:0);
  }
  function contractDataFromEmployee(e, contractId, useSaved=true){
    const c=(useSaved ? contractFor(e.id, contractId) : {});
    const start=c.start??e.startdate??'', end=c.end??e.contractend??'';
    const autoDuration=contractDurationText(start,end);
    const contractCode=c.contractCode || nextContractCode(e.region||'');
    return {empId:e.id,contractCode,duration:c.duration??e.contractduration??12,durationText:autoDuration||c.durationText||'',start,end,location:c.location??e.project??e.region??'',hours:c.hours??8,weekHours:c.weekHours??48,probation:c.probation??6,notice:c.notice??30,noticeComp:c.noticeComp??300,resignNotice:c.resignNotice??15,notes:c.notes??'',overtime:c.overtime??'يتم الاتفاق على قيمة العمل الإضافي كتابياً',salary:c.salary??(Number(e.basicsalary)||0),housing:c.housing??(Number(e.housing)||0),transport:c.transport??(Number(e.transport)||0),other:c.other??(Number(e.otherallow)||0),customHtml:c.customHtml||''};
  }
  const contractSource = {
    intro:`انه في يوم {{DAY_NAME}} بتاريخ {{START_HIJRI}} هـ الموافق: {{START_M}} م قد تم الاتفاق بين كل من :\nأ- شركة فخر الجزيرة للحراسات الأمنية سجل تجاري رقم (4031263286)، مكة، المملكة العربية السعودية ويمثلها في هذا العقد زهير سفر القثامي بصفته المدير العام جوال رقم (0537030099) والمشار اليها في هذا العقد الطرف الأول.\n\nب- السيد / {{FULLNAME}} رقم الهوية {{IDNUM}} / - عنوانه / {{ADDRESS}}\nرقم الجوال / {{PHONE}} والمشار اليه في الطرف الثاني.`,
    art1:`المادة الأولى : موضوع العقد:-\nيوافق الطرف الثاني على العمل لدى الطرف الأول وتحت إدارته وأشرافه أو إدارة من ينوب عنه في وفق شروط هذا العقد في وظيفة ( {{JOB}} ) أو أي وظيفة أخرى يتم تكليفه بها، ما لم تختلف اختلافًا جوهريًا عن مهامه الأصلية حسب حاجة العمل إذا رأى الطرف الأول تكليفه بأدائها ووافق الطرف الثاني على ذلك.`,
    art2:`المادة الثانية : مدة العقد -:\nمدة هذا العقد ( {{DURATION}} ) تبدأ اعتبارًا من تاريخ مباشرة العمل الموافق {{START_M}} م، وتنتهي بتاريخ {{END_DATE}} م، أو وفق ما يتفق عليه الطرفان، وتحتسب مدة العقد بالتقويم الميلادي.`,
    art3:`المادة الثالثة : مكان العمل:-\nاتفق الطرفان على حق الطرف الأول في تكليف الطرف الثاني بالعمل في المكان الذي يراه الطرف الأول مناسبًا ضمن حدود مقر أداء الطرف الأول لأعماله وللطرف الأول الحق بنقل الطرف الثاني من مقر عمل لآخر وفقًا لما تقتضيه مصلحة العمل طالما أن هذا النقل لا يترتب ضررًا جسيمًا على الطرف الثاني.`,
    art4:`المادة الرابعة : ساعات العمل-:\nعدد ساعات العمل اليومية هي {{HOURS}} ساعات فقط، وإجمالي ساعات العمل الأسبوعية {{WEEK_HOURS}} ساعة.`,
    art5:`المادة الخامسة : العمل الاضافي :-\nيستحق الطرف الثاني اجر اضافي وذلك عندما يسند اليه اعمال اضافية او يطلب منه ساعات عمل اضافية ويتم الاتفاق بين الطرفين على قيمة ذلك الاجر الاضافي كتابيًا ولا يحق للطرف الثاني الامتناع او رفض العمل الاضافي دون أي اعتراض على ذلك ويتم التعامل معه بناء على الالئحة الداخلية للشركة.\nيتم الاتفاق على قيمة العمل الإضافي كتابيًا`,
    art6:`المادة السادسة : فترة التجربة-:\nيعتبر الطرف الثاني تحت التجربة طوال مدة {{PROBATION}} أشهر الأولى لهذا العقد والتي تبدأ من تاريخ مباشرته الفعلية للعمل لدى الطرف الأول، فإذا ثبت عدم صلاحية الطرف الثاني خلال هذه الفترة فيحق للطرف الأول إنهاء خدمته دون إنذار أو مكافئة أو تعويض حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (53).`,
    art7:`المادة السابعة : الأجر:-\nيدفع الطرف الأول للطرف الثاني مقابل عمله حسب كشف الحضور والانصراف المعتمد من قبل الطرف الأول.\nراتب شهري أساسي قدره ( {{SALARY}} ريال ) المبلغ كتابة ( {{SALARY_WORDS}} ).\nبدل سكن قدره ( {{HOUSING}} ريال ) المبلغ كتابة ( {{HOUSING_WORDS}} ).\nبدلات أخرى قدره ( {{OTHER}} ريال ) المبلغ كتابة ( {{OTHER_WORDS}} ).\nاجمالي الراتب ( {{TOTAL}} ريال ) المبلغ كتابة ( {{TOTAL_WORDS}} ) حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (90).`,
    art8:`المادة الثامنة :انهاء العقد:-\n1- يحق لأي طرف من الطرفين انهاء هذا العقد بإرادته المنفردة بشرط اخطار الطرف الآخر كتابيًا قبل التاريخ المحدد للإنهاء بثلاثين يومًا، وفي حالة عدم التزام أي من الطرفين بالمدة المشار اليها يدفع الطرف المخل للطرف الآخر تعويضًا معادلًا بقيمة ({{NOTICE_COMP}}) ريال عن كل يوم لمدة الاخطار أو المتبقي منها حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (74).\n2- ينتهي هذا العقد بانتهاء مدته أو بانتهاء المشروع أو عند طلب العميل من الطرف الأول استبعاد الطرف الثاني من المشروع، ويحق للطرف الأول أيضًا إنهاءه فورًا وبدون إشعار مسبق أو مكافأة أو تعويض في أي من الحالات الواردة حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (80).\n3- يلتزم الطرف الأول بتعويض الطرف الثاني بأجر شهرين فقط عن هذا العقد في حال قيام الطرف الأول بإنهاء هذا العقد لأي سبب غير مشروع حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (77).\n4- يلتزم الطرف الثاني في حال طلب الاستقالة أن يتم إشعار الطرف الأول في مدة أقصاها ({{RESIGN_NOTICE}}) يوم حتى يتم التعامل معه في إجراءات الاستقالة النظامية وفي حال عدم الالتزام والغياب قبل انتهى المدة يدفع الطرف الثاني تعويضًا للطرف الأول (300) ريال عن كل يوم غياب.`,
    art9:`المادة التاسعة : التزامات الطرف الثاني-:\n-1 أن يباشر مهام وظيفته في المقر الذي يحدده الطرف الأول بما يعادل {{HOURS}} ساعات يوميًا وفي الأسبوع {{WEEK_HOURS}} ساعة وأن يتم منحه إجازة من كل أسبوع حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (98).\n-2 أن يلتزم بعدم العمل لدى أي جهة كانت خلال فترة عمله لدى الطرف الأول سواءً بأجر أو بدون أجر بما في ذلك الإجازات والعطل وبعد الدوام.\n-3 أن يلتزم التزامًا تامًا بمواعيد العمل وفي حال الغياب المفاجئ بدون علم فإنه يحق لشركة فخر الجزيرة للحراسات الأمنية الخصم بما يعادل يومين من راتبي.\n-4 أن يلتزم التزامًا تامًا بلبس الزي الرسمي المحدد لي في العمل وأن يكون نظيفًا ومرتبًا وفي حال عدم الالتزام يحق لشركة فخر الجزيرة للحراسات الأمنية الخصم بما يعادل يوم من راتبي.\n-5 أن ألتزم التزامًا تامًا بعدم الانسحاب من الموقع وفي حال الانسحاب يخصم بما يعادل ثلاثة أيام من راتبي.\n-6 في حال عدم التزامي بأي من لوائح ونظم العمل يطبق علي فورًا الالئحة الحسومات المعتمدة لدى شركة فخر الجزيرة للحراسات الأمنية.\n-7 إذا لم أكمل مدة شهر بالشركة لا يحق لي المطالبة بأي راتب أو مستحقات وأقر بأنها فترة تدريبية حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (53).\n-8 إذا لم أكمل مدة {{PROBATION}} أشهر بالشركة لا يحق لي المطالبة بأي مستحقات وأقر بأنها فترة تجريبية حسب بند وزارة العمل والعمال بالمملكة العربية السعودية (53).\n-9 في حالة رفضي من قبل العميل لأسباب منطقية يتم التعامل معي نظاميًا مثل الاستقالة الفورية ولا يحق لي بأي مستحقات.\n-10 عندما يرد على الشركة خطاب من أي مشروع بوجود مخالفة خلال فترة استلامي فإنه لا مانع لدي من خصم كامل مبلغ المخالفة من استحقاقي ومرتباتي وليس لي الحق في الاعتراض.\n-11 أن يلتزم بتنفيذ أية مهام أو أعمال يكلفه بها الطرف الأول في حالات الضرورة وفقًا لما تقتضيه مصلحة العمل.\n-12 أن يلتزم بالمحافظة على ما في عهدته وأن يستخدمها في الأغراض المعدة لها ولأداء عمله الذي تتطلبه وظيفته.\n-13 أن يبلغ فورًا الطرف الأول عن أي فعل أو تقصير ينتج عنه إلحاق ضرر أو خسارة مادية أو معنوية بالعمل.\n-14 أن يحافظ على الأسرار الخاصة بالعمل وعدم إفشائها.\n-15 أن يستخدم كل قدراته في تحسين وتطوير العمل.`,
    art10:`المادة العاشرة : أحكام عامة:-\n1- لا يترتب على هذا العقد أي التزامات على الطرف الأول في مواجهة من يعولهم الطرف الثاني.\n2- يعتبر عنوان الطرف الأول عنوانًا مشتركًا لكلا الطرفين ويحق للطرف الأول أن يسلم فيه جميع الإشعارات والإخطارات إلى الطرف الثاني يدًا أو وضعها على لوحة الإعلانات في مقر العمل.\n3- أي خلاف ينشأ بين طرفي العقد بسبب تنفيذه أو تفسيره يتم حله وديًا فإذا تعذر ذلك فيعرض النزاع على لجان العمل المختصة في مدينة مكة.\n4- تحتسب المدة في هذا العقد بالتقويم الميلادي.\n5- يقر الطرف الثاني بأنه لا توجد لديه أي أمراض مزمنة، وأن الوثائق المقدمة منه صحيحة ومكتملة، وفي حالة ظهور خلاف ذلك يحق للطرف الأول إنهاء هذا العقد.\n6- يلغي هذا العقد أي عقد أو اتفاق سابق بين الطرفين.\n7- كل ما لم يرد بشأنه نص في هذا العقد يطبق عليه نظام العمل والعمال المعمول به في المملكة العربية السعودية.\n8- الالتزام التام بأوقات الدوام الرسمي.\n9- يقر الطرف الثاني بأنه قد سبق له قبل التوقيع على هذا العقد الاطلاع على ما جاء في لائحة تنظيم العمل المعمول بها لدى الطرف الأول وأنه ملتزم بما جاء فيها.`,
    art11:`المادة الحادي عشر : نسخ العقد:\n1- تم تحرير العقد من نسختين.\nعلى ما ذكر تم تنظيم هذا العقد والله خير الشاهدين،،،`
  };
  function contractReplacements(e,c){
    const total=(Number(c.salary)||0)+(Number(c.housing)||0)+(Number(c.transport)||0)+(Number(c.other)||0);
    const words=n=>{ const v=Number(n)||0; return v===1500?'ألف وخمسمائة ريال':v===500?'خمسمائة ريال':v===1000?'ألف ريال':v===3000?'ثلاثة آلاف ريال فقط':`${fmt(v)} ريال`; };
    const dateVal=c.start||new Date().toISOString().slice(0,10);
    const d=new Date(dateVal+'T00:00:00');
    const arDate=isNaN(d)?dateVal:d.toLocaleDateString('ar-SA-u-ca-islamic',{day:'2-digit',month:'2-digit',year:'numeric'});
    const grDate=isNaN(d)?dateVal:d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});
    const dayName=isNaN(d)?'':d.toLocaleDateString('ar-SA',{weekday:'long'});
    return {
      '{{DATE}}':arDate,
      '{{DATE_M}}':grDate,
      '{{DAY_NAME}}':dayName,
      '{{START_HIJRI}}':arDate,
      '{{START_M}}':grDate,
      '{{END_DATE}}':c.end||'',
      '{{FULLNAME}}':e.fullname||'',
      '{{IDNUM}}':e.idnum||'',
      '{{ADDRESS}}':e.address||'',
      '{{PHONE}}':e.phone||'',
      '{{JOB}}':e.jobtitle||'',
      '{{DURATION}}':c.durationText||contractDurationText(c.start,c.end)||c.duration||'',
      '{{HOURS}}':c.hours||8,
      '{{WEEK_HOURS}}':c.weekHours||48,
      '{{PROBATION}}':c.probation||6,
      '{{NOTICE}}':c.notice||30,
      '{{NOTICE_COMP}}':fmt(c.noticeComp||300),
      '{{RESIGN_NOTICE}}':c.resignNotice||15,
      '{{START_DATE}}':c.start||'',
      '{{OVERTIME}}':c.overtime||'',
      '{{SALARY}}':fmt(c.salary),
      '{{SALARY_WORDS}}':words(c.salary),
      '{{HOUSING}}':fmt(c.housing),
      '{{HOUSING_WORDS}}':words(c.housing),
      '{{OTHER}}':fmt(c.other),
      '{{OTHER_WORDS}}':words(c.other),
      '{{TOTAL}}':fmt(total),
      '{{TOTAL_WORDS}}':words(total),
      '{{LOCATION}}':c.location||e.project||e.region||'',
      '{{START}}':c.start||'',
      '{{START_M}}':grDate,
      '{{EMPCODE}}':e.empcode||'',
      '{{CONTRACTCODE}}':c.contractCode||''
    };
  }
  function fillContractText(text,e,c){ const r=contractReplacements(e,c); return String(text||'').replace(/\{\{[A-Z_]+\}\}/g,m=>escapeHtml(r[m]??m)); }
  function editableBlock(title,key,text,e,c){ return `<section class="contract-edit-block" data-contract-key="${key}"><h3>${title}</h3><div class="contract-editable" contenteditable="true" spellcheck="false">${fillContractText(text,e,c).replace(/\n/g,'<br>')}</div></section>`; }
  function buildContractHtml(e,c){
    const num=escapeHtml(c.contractCode||'');
    const block=(title,key,text,extraClass='')=>`<section class="contract-edit-block new-contract-block ${extraClass}" data-contract-key="${key}">${title?`<h3>${title}</h3>`:''}<div class="contract-editable" contenteditable="true" spellcheck="false">${fillContractText(text,e,c).replace(/\n/g,'<br>')}</div></section>`;
    const header=`<div class="new-contract-header"><div class="new-contract-number">رقم العقد: ${num}</div><div class="new-contract-title">عقد عمل</div></div>`;
    const p1=`<div class="contract-page new-contract-page page-1"><div class="contract-page-content">${header}${block('البيانات التمهيدية','intro',contractSource.intro)}${block('المادة الأولى','art1',contractSource.art1)}${block('المادة الثانية','art2',contractSource.art2)}${block('المادة الثالثة','art3',contractSource.art3)}${block('المادة الرابعة','art4',contractSource.art4)}${block('المادة الخامسة','art5',contractSource.art5)}${block('المادة السادسة','art6',contractSource.art6)}</div></div>`;
    const p2=`<div class="contract-page new-contract-page page-2"><div class="contract-page-content">${block('المادة السابعة','art7',contractSource.art7)}${block('المادة الثامنة','art8',contractSource.art8)}</div></div>`;
    const p3=`<div class="contract-page new-contract-page page-3"><div class="contract-page-content">${block('المادة التاسعة','art9',contractSource.art9)}</div></div>`;
    const p4=`<div class="contract-page new-contract-page page-4"><div class="contract-page-content">${block('المادة العاشرة','art10',contractSource.art10)}${block('المادة الحادية عشرة','art11',contractSource.art11)}<div class="contract-signatures new-contract-signatures"><div>الطرف الأول<br>شركة فخر الجزيرة للحراسات الأمنية<br>التوقيع: ____________________</div><div>الطرف الثاني<br>${escapeHtml(e.fullname||'')}<br>التوقيع: ____________________<br>البصمة: ____________________</div></div></div></div>`;
    return p1+p2+p3+p4;
  }
  function renderContracts(){
    refreshEmpSelect(document.getElementById('contract_emp'),'— اختر الموظف —');
    const id=document.getElementById('contract_emp').value;
    if(id) loadContractEmployee(id); else document.getElementById('contractSheet').innerHTML='<p class="empty-note">اختر موظفاً تمت إضافته إلى البرنامج لعرض عقده.</p>';
  }
  function syncSavedContractDynamicFields(){
    const sheet=document.getElementById('contractSheet');
    const empId=document.getElementById('contract_emp')?.value;
    const e=employees.find(x=>x.id===empId);
    if(!sheet || !e) return '';
    const duration=updateContractDurationNote();
    const c={...contractDataFromEmployee(e),...currentContractForm()};
    const rebuildBlock=(key,source)=>{
      const el=sheet.querySelector(`.contract-edit-block[data-contract-key="${key}"] .contract-editable`);
      if(el) el.innerHTML=fillContractText(source,e,c).replace(/\n/g,'<br>');
    };
    // Dynamic contract fields must always reflect the current form values, even for previously saved contracts.
    rebuildBlock('art2',contractSource.art2);
    rebuildBlock('art4',contractSource.art4);
    rebuildBlock('art6',contractSource.art6);
    rebuildBlock('art9',contractSource.art9);
    return duration;
  }
  function loadContractEmployee(empId, contractId){
    const e=employees.find(x=>x.id===empId); if(!e)return;
    currentContractId=contractId||null;
    newContractMode=!currentContractId;
    const c=contractDataFromEmployee(e,currentContractId,!newContractMode);
    document.getElementById('contract_code').value=c.contractCode||'';
    document.getElementById('contract_start').value=c.start||'';
    document.getElementById('contract_end').value=c.end||'';
    document.getElementById('contract_duration').value=contractDurationText(c.start,c.end)||c.durationText||'';
    updateContractDurationNote();
    document.getElementById('contract_location').value=c.location||'';
    document.getElementById('contract_hours').value=c.hours??8;
    document.getElementById('contract_week_hours').value=c.weekHours??48;
    document.getElementById('contract_probation').value=c.probation??6;
    document.getElementById('contract_notice').value=c.notice??30;
    document.getElementById('contract_notice_comp').value=c.noticeComp??300;
    document.getElementById('contract_resign_notice').value=c.resignNotice??15;
    document.getElementById('contract_notes').value=c.notes||'';
    document.getElementById('contractSheet').innerHTML=buildContractHtml(e,c);
  }
  function updateContractDurationNote(){
    const start=document.getElementById('contract_start')?.value||'', end=document.getElementById('contract_end')?.value||'';
    const text=contractDurationText(start,end);
    const field=document.getElementById('contract_duration'); if(field) field.value=text;
    const note=document.getElementById('contractDurationNote'); if(note) note.textContent=text ? `المدة المحسوبة تلقائياً: ${text}` : 'أدخل تاريخ البداية والنهاية ليتم حساب مدة العقد تلقائياً.';
    return text;
  }
  function currentContractForm(){ const start=document.getElementById('contract_start').value,end=document.getElementById('contract_end').value,durationText=contractDurationText(start,end); return {duration:contractDurationMonths(start,end)||document.getElementById('contract_duration').value,durationText,start,end,location:document.getElementById('contract_location').value,hours:document.getElementById('contract_hours').value,weekHours:document.getElementById('contract_week_hours').value,probation:document.getElementById('contract_probation').value,notice:document.getElementById('contract_notice').value,noticeComp:document.getElementById('contract_notice_comp').value,resignNotice:document.getElementById('contract_resign_notice').value,notes:document.getElementById('contract_notes').value}; }
  function renderContractSheet(){ const id=document.getElementById('contract_emp').value,e=employees.find(x=>x.id===id); if(!e)return; const c={...contractDataFromEmployee(e),...currentContractForm()}; document.getElementById('contractSheet').innerHTML=buildContractHtml(e,c); }
  document.getElementById('newContractBtn')?.addEventListener('click',()=>{
    currentContractId=null;
    newContractMode=true;
    const sel=document.getElementById('contract_emp');
    if(sel) sel.value='';
    ['contract_code','contract_duration','contract_start','contract_end','contract_location','contract_notes'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
    document.getElementById('contract_hours').value=8;
    document.getElementById('contract_week_hours').value=48;
    document.getElementById('contract_probation').value=6;
    document.getElementById('contract_notice').value=30;
    document.getElementById('contract_notice_comp').value=300;
    document.getElementById('contract_resign_notice').value=15;
    updateContractDurationNote();
    document.getElementById('contractSheet').innerHTML='<p class="empty-note">اختر الموظف لإنشاء عقد جديد بنفس بيانات الموظف تلقائياً.</p>';
    document.getElementById('contract_emp')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.getElementById('contract_emp')?.addEventListener('change',e=>{
    if(!e.target.value){
      currentContractId=null; newContractMode=true;
      document.getElementById('contractSheet').innerHTML='<p class="empty-note">اختر الموظف لإنشاء عقد جديد.</p>';
      return;
    }
    if(newContractMode) loadContractEmployee(e.target.value,null);
    else loadContractEmployee(e.target.value,currentContractId);
  });
  ['contract_start','contract_end','contract_location','contract_hours','contract_week_hours','contract_probation','contract_notice','contract_notice_comp','contract_resign_notice','contract_notes'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{ if(id==='contract_start'||id==='contract_end') updateContractDurationNote(); renderContractSheet(); }));
  document.getElementById('rebuildContractBtn')?.addEventListener('click',renderContractSheet);
  document.getElementById('saveContractBtn')?.addEventListener('click',()=>{
    const empId=document.getElementById('contract_emp').value,e=employees.find(x=>x.id===empId); if(!e){showToast('اختر الموظف أولاً');return;}
    const existing=currentContractId ? contracts.find(c=>c.id===currentContractId) : null;
    const contractCode=existing?.contractCode || nextContractCode(e.region||'');
    const data={id:currentContractId||('ct'+Date.now()+Math.random().toString(36).slice(2,7)),empId,contractCode,...currentContractForm(),customHtml:document.getElementById('contractSheet').innerHTML,templateVersion:6,updatedAt:new Date().toISOString()};
    if(currentContractId){
      const i=contracts.findIndex(c=>c.id===currentContractId);
      if(i>=0) contracts[i]=data; else contracts.push(data);
    }else{
      contracts.push(data);
      currentContractId=data.id;
      newContractMode=false;
    }
    e.contractduration=data.duration;e.startdate=data.start;e.contractend=data.end;e.project=data.location;saveContracts();saveEmployees();
    document.getElementById('contractSavedNote').textContent='تم حفظ بيانات العقد وتعديلاته بنجاح.';
    showToast('تم حفظ العقد وتعديلاته بنجاح');
  });
  document.getElementById('printContractBtn')?.addEventListener('click',()=>{
    const sheet=document.getElementById('contractSheet');
    if(!sheet || !sheet.querySelector('.new-contract-page')) return;
    const win=window.open('', '_blank', 'width=900,height=1200');
    if(!win) return;
    const pages=[...sheet.querySelectorAll('.new-contract-page')].slice(0,4).map(p=>{ const c=p.cloneNode(true); c.querySelectorAll('.contract-bg-image').forEach(img=>img.remove()); return c.outerHTML; }).join('');
    win.document.open();
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عقد عمل</title><style>
      @page{size:A4 portrait;margin:0!important;}
      *{box-sizing:border-box!important;}
      html,body{margin:0!important;padding:0!important;width:210mm!important;background:#fff!important;}
      body{direction:rtl;font-family:"JF Flat Regular","JF Flat","Segoe UI",Tahoma,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      .contract-sheet{display:block!important;width:210mm!important;margin:0!important;padding:0!important;}
      .new-contract-page{display:block!important;position:relative!important;width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff url("${location.href.replace(/index\.html.*$/,'')}assets/contract-bg.jpg") center top / 100% 100% no-repeat!important;page-break-after:always!important;break-after:page!important;page-break-inside:avoid!important;break-inside:avoid!important;}
      .new-contract-page:last-of-type{page-break-after:auto!important;break-after:auto!important;}
      .contract-page-content{position:relative!important;z-index:2!important;width:210mm!important;height:297mm!important;max-height:297mm!important;overflow:hidden!important;padding:28mm 17mm 17mm!important;font-size:13.2px!important;line-height:1.35!important;font-weight:600!important;}
      .new-contract-page .contract-edit-block{display:block!important;margin:0 0 4px!important;padding:0!important;border:0!important;background:transparent!important;}
      .new-contract-page .contract-edit-block h3{margin:2px 0 1px!important;font-size:15px!important;line-height:1.2!important;font-weight:800!important;color:#111!important;}
      .new-contract-page .contract-editable{display:block!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;min-height:0!important;font-size:13.2px!important;line-height:1.35!important;font-weight:600!important;white-space:normal!important;}
      .new-contract-page .new-contract-header{display:block!important;position:relative!important;min-height:15mm!important;margin:0 0 2mm!important;}
      .new-contract-page .new-contract-title{font-size:24px!important;line-height:1.2!important;margin-top:1mm!important;text-align:center!important;}
      .new-contract-page .new-contract-number{font-size:13px!important;padding:1px 6px!important;}
      .new-contract-signatures{margin-top:7mm!important;line-height:1.6!important;gap:20mm!important;}
      .new-contract-signatures>div{min-height:18mm!important;}
      @media print{html,body{width:210mm!important;margin:0!important;padding:0!important;overflow:visible!important}.new-contract-page{height:297mm!important;max-height:297mm!important;page-break-after:always!important;break-after:page!important}.new-contract-page:last-of-type{page-break-after:auto!important;break-after:auto!important;}}
    </style></head><body><div class="contract-sheet">${pages}</div></body></html>`);
    win.document.close();
    const printNow=()=>{setTimeout(()=>{win.focus();win.print();},250);};
    const imgs=[...win.document.images];
    if(imgs.length){let left=imgs.length; const done=()=>{if(--left<=0)printNow();}; imgs.forEach(img=>{if(img.complete)done();else{img.onload=done;img.onerror=done;}}); setTimeout(printNow,1500);}else printNow();
  });

  /* ===== all saved employee contracts ===== */
  function uniqueSorted(values){
    return [...new Set(values.filter(v=>String(v||'').trim()).map(v=>String(v).trim()))].sort((a,b)=>a.localeCompare(b,'ar'));
  }
  function fillAllContractsFilter(id, values, placeholder, keepValue){
    const el=document.getElementById(id); if(!el)return;
    const old=keepValue ?? el.value ?? '';
    el.innerHTML=`<option value="">${placeholder}</option>` + uniqueSorted(values).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if([...el.options].some(o=>o.value===old)) el.value=old;
  }
  function renderAllContractsFilters(){
    const savedEmployees=contracts.map(c=>employees.find(e=>e.id===c.empId)).filter(Boolean);
    fillAllContractsFilter('allContractsRegion',savedEmployees.map(e=>e.region),'كل المناطق');
    fillAllContractsFilter('allContractsProject',savedEmployees.map(e=>e.project),'كل المشاريع');
    fillAllContractsFilter('allContractsDept',savedEmployees.map(e=>e.dept),'كل الأقسام');
  }
  function renderAllContracts(){
    renderAllContractsFilters();
    const region=document.getElementById('allContractsRegion')?.value||'';
    const project=document.getElementById('allContractsProject')?.value||'';
    const dept=document.getElementById('allContractsDept')?.value||'';
    const search=(document.getElementById('allContractsSearch')?.value||'').trim().toLowerCase();
    const rows=contracts.map(c=>({c,e:employees.find(x=>x.id===c.empId)})).filter(x=>x.e);
    const filtered=rows.filter(({c,e})=>{
      if(region && (e.region||'')!==region)return false;
      if(project && (e.project||c.location||'')!==project)return false;
      if(dept && (e.dept||'')!==dept)return false;
      if(search){
        const hay=[e.empcode,e.fullname,e.jobtitle,e.idnum,e.region,e.project,e.dept,c.location].join(' ').toLowerCase();
        if(!hay.includes(search))return false;
      }
      return true;
    });
    const body=document.getElementById('allContractsTableBody');
    const count=document.getElementById('allContractsCount');
    const empty=document.getElementById('allContractsEmpty');
    if(count)count.textContent=filtered.length;
    if(body)body.innerHTML=filtered.map(({c,e})=>{
      const location=e.project||c.location||'—';
      const duration=c.durationText||contractDurationText(c.start,c.end)||'—';
      return `<tr>
        <td class="mono">${escapeHtml(c.contractCode||'—')}</td>
        <td class="mono">${escapeHtml(e.empcode||'—')}</td>
        <td><b>${escapeHtml(e.fullname||'—')}</b></td>
        <td>${escapeHtml(e.region||'—')}</td>
        <td>${escapeHtml(location)}</td>
        <td>${escapeHtml(e.dept||'—')}</td>
        <td>${escapeHtml(e.jobtitle||'—')}</td>
        <td class="mono">${escapeHtml(c.start||'—')}</td>
        <td class="mono">${escapeHtml(c.end||'—')}</td>
        <td>${escapeHtml(duration)}</td>
        <td class="all-contract-actions">
          <button type="button" class="btn btn-primary btn-sm all-contract-edit" data-emp-id="${escapeHtml(e.id)}" data-contract-id="${escapeHtml(c.id||'')}">تعديل</button>
          <button type="button" class="btn btn-danger btn-sm all-contract-delete" data-contract-id="${escapeHtml(c.id||'')}" data-contract-code="${escapeHtml(c.contractCode||'')}">حذف</button>
        </td>
      </tr>`;
    }).join('');
    if(empty)empty.style.display=filtered.length?'none':'';
    if(body)body.querySelectorAll('.all-contract-edit').forEach(btn=>btn.addEventListener('click',()=>openContractForEdit(btn.dataset.empId,btn.dataset.contractId)));
    if(body)body.querySelectorAll('.all-contract-delete').forEach(btn=>btn.addEventListener('click',()=>deleteSavedContract(btn.dataset.contractId,btn.dataset.contractCode)));
  }
  function deleteSavedContract(contractId,contractCode){
    if(!contractId) return;
    const target=contracts.find(c=>c.id===contractId);
    if(!target) return;
    const emp=employees.find(e=>e.id===target.empId);
    const employeeName=emp?.fullname || 'هذا الموظف';
    const label=contractCode ? `العقد ${contractCode}` : 'هذا العقد';
    if(!window.confirm(`هل أنت متأكد من حذف ${label} للموظف ${employeeName}؟\n\nسيتم حذف العقد المحفوظ فقط ولن يتم حذف الموظف.`)) return;
    contracts=contracts.filter(c=>c.id!==contractId);
    if(currentContractId===contractId){
      currentContractId=null;
      newContractMode=true;
    }
    saveContracts();
    renderAllContracts();
    showToast('تم حذف العقد بنجاح');
  }
  function openContractForEdit(empId,contractId){
    switchView('contracts');
    const select=document.getElementById('contract_emp');
    if(select){
      select.value=empId;
      loadContractEmployee(empId,contractId);
    }
    document.getElementById('contract_emp')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  ['allContractsRegion','allContractsProject','allContractsDept','allContractsSearch'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input',renderAllContracts);
    document.getElementById(id)?.addEventListener('change',renderAllContracts);
  });

  /* ===== employee commencements ===== */
  function isGuardEmployee(e){
    const job=String(e?.jobtitle||'').trim().toLowerCase();
    return /حارس|حارسة|guard|security guard/.test(job);
  }
  function contractedGuardsForProject(projectName){
    const contractedIds=new Set(contracts.filter(c=>{
      const emp=employees.find(e=>e.id===c.empId);
      const cp=String(c.location||emp?.project||'').trim();
      return cp===String(projectName||'').trim();
    }).map(c=>c.empId));
    return employees.filter(e=>contractedIds.has(e.id) && String(e.project||'').trim()===String(projectName||'').trim() && isGuardEmployee(e));
  }
  function renderCommencementProjects(){
    const sel=document.getElementById('comm_project'); if(!sel)return;
    const cur=sel.value;
    sel.innerHTML='<option value="">اختر المشروع</option>'+uniqueSorted(projects.map(p=>p.name)).map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
    if(projects.some(p=>p.name===cur))sel.value=cur;
  }
  function renderCommencementEmployees(){
    const p=document.getElementById('comm_project'), sel=document.getElementById('comm_employee'); if(!p||!sel)return;
    const cur=sel.value, list=contractedGuardsForProject(p.value);
    sel.disabled=!p.value;
    sel.innerHTML='<option value="">'+(p.value?'اختر الحارس':'اختر المشروع أولاً')+'</option>'+list.map(e=>`<option value="${escapeAttr(e.id)}">${escapeHtml(e.fullname||'')} — ${escapeHtml(e.empcode||'')}</option>`).join('');
    if(list.some(e=>e.id===cur))sel.value=cur;
    else { sel.value=''; renderCommencementEmployee(); }
  }
  function renderCommencementEmployee(){
    const id=document.getElementById('comm_employee')?.value||'', box=document.getElementById('comm_employee_data');
    const e=employees.find(x=>x.id===id); if(!box)return;
    if(!e){box.style.display='none';return;}
    const c=contracts.filter(x=>x.empId===e.id && String(x.location||e.project||'').trim()===String(e.project||'').trim()).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0] || contracts.find(x=>x.empId===e.id) || {};
    const vals={comm_fullname:e.fullname,comm_empcode:e.empcode,comm_idnum:e.idnum,comm_nationality:e.nationality,comm_gender:e.gender,comm_dob:e.dob,comm_phone:e.phone,comm_email:e.email,comm_dept:e.dept,comm_jobtitle:e.jobtitle,comm_region:e.region,comm_project_display:e.project,comm_basicsalary:fmt(e.basicsalary),comm_housing:fmt(e.housing),comm_transport:fmt(e.transport),comm_otherallow:fmt(e.otherallow),comm_lastwage:fmt(e.lastwage||netSalary(e)),comm_contractcode:c.contractCode,comm_contractstart:c.start,comm_contractend:c.end};
    Object.entries(vals).forEach(([k,v])=>{const el=document.getElementById(k);if(el)el.value=v||'';});
    const existing=commencements.find(x=>x.empId===e.id && x.project===e.project);
    const date=document.getElementById('comm_startdate'); if(date && !date.value) date.value=existing?.startDate||e.startdate||new Date().toISOString().slice(0,10);
    document.getElementById('comm_notes').value=existing?.notes||'';
    box.style.display='';
  }
  function renderCommencementTable(){
    const body=document.getElementById('commencementTableBody'); if(!body)return;
    const rows=[...commencements].sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
    body.innerHTML=rows.map(r=>`<tr><td class="mono">${escapeHtml(r.startDate||'—')}</td><td><b>${escapeHtml(r.employeeName||'—')}</b></td><td class="mono">${escapeHtml(r.empcode||'—')}</td><td>${escapeHtml(r.project||'—')}</td><td>${escapeHtml(r.jobtitle||'—')}</td><td class="mono">${escapeHtml(r.contractCode||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty-note">لا توجد مباشرات محفوظة.</td></tr>';
  }
  function renderCommencements(){
    renderCommencementProjects();
    renderCommencementEmployees();
    renderCommencementTable();
  }
  document.getElementById('comm_project')?.addEventListener('change',()=>{document.getElementById('comm_startdate').value=new Date().toISOString().slice(0,10);document.getElementById('comm_notes').value='';renderCommencementEmployees();});
  document.getElementById('comm_employee')?.addEventListener('change',()=>{document.getElementById('comm_startdate').value='';document.getElementById('comm_notes').value='';renderCommencementEmployee();});
  document.getElementById('resetCommencementBtn')?.addEventListener('click',()=>{const p=document.getElementById('comm_project');if(p)p.value='';const e=document.getElementById('comm_employee');if(e){e.value='';e.disabled=true;e.innerHTML='<option value="">اختر المشروع أولاً</option>';}document.getElementById('comm_startdate').value=new Date().toISOString().slice(0,10);document.getElementById('comm_notes').value='';document.getElementById('comm_employee_data').style.display='none';});
  document.getElementById('saveCommencementBtn')?.addEventListener('click',()=>{
    const empId=document.getElementById('comm_employee')?.value||'', project=document.getElementById('comm_project')?.value||'', startDate=document.getElementById('comm_startdate')?.value||'';
    const e=employees.find(x=>x.id===empId); if(!project||!e){showToast('اختر المشروع والحارس أولاً');return;}
    const contract=contracts.find(c=>c.empId===e.id && String(c.location||e.project||'').trim()===String(project).trim());
    if(!contract){showToast('هذا الموظف ليس لديه عقد محفوظ على المشروع المختار');return;}
    if(!startDate){showToast('اختر تاريخ المباشرة');return;}
    const existingIndex=commencements.findIndex(x=>x.empId===e.id && x.project===project);
    const rec={id:existingIndex>=0?commencements[existingIndex].id:'cm'+Date.now()+Math.random().toString(36).slice(2,7),empId:e.id,employeeName:e.fullname||'',empcode:e.empcode||'',project,region:e.region||'',dept:e.dept||'',jobtitle:e.jobtitle||'',contractId:contract.id||'',contractCode:contract.contractCode||'',startDate,notes:document.getElementById('comm_notes')?.value||'',updatedAt:new Date().toISOString()};
    if(existingIndex>=0)commencements[existingIndex]=rec;else commencements.push(rec);
    saveCommencements();renderCommencementTable();showToast(existingIndex>=0?'تم تحديث المباشرة':'تم حفظ المباشرة');
  });

  /* ===== documents ===== */
  function loadSettingsIntoForm(){
    document.getElementById('s_company').value = settings.company||'';
    document.getElementById('s_cr').value = settings.cr||'';
    document.getElementById('s_manager').value = settings.manager||'';
    document.getElementById('s_managerphone').value = settings.managerphone||'';
  }
  ['s_company','s_cr','s_manager','s_managerphone'].forEach(id=>{
    document.getElementById(id).addEventListener('input', ()=>{
      settings = {
        company: document.getElementById('s_company').value,
        cr: document.getElementById('s_cr').value,
        manager: document.getElementById('s_manager').value,
        managerphone: document.getElementById('s_managerphone').value
      };
      saveSettings();
      renderDocSheet();
    });
  });
  document.querySelectorAll('.doc-type-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.doc-type-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentDocType = btn.dataset.doc;
      renderDocSheet();
    });
  });
  document.getElementById('doc_emp').addEventListener('change', renderDocSheet);
  document.getElementById('printDocBtn').addEventListener('click', ()=>window.print());
  function blank(v){ return v ? escapeHtml(v) : '<span class="blank">.......................</span>'; }
  function renderDocuments(){
    refreshEmpSelect(document.getElementById('doc_emp'), '— اختر الموظف —');
    loadSettingsIntoForm();
    renderDocSheet();
  }
  function renderDocSheet(){
    const empId = document.getElementById('doc_emp').value;
    const e = employees.find(x=>x.id===empId) || {};
    const co = settings.company || 'اسم الشركة';
    const today = new Date().toLocaleDateString('ar-SA-u-ca-gregory');
    const sheet = document.getElementById('docSheet');
    let html = '';
    if(currentDocType==='contract'){
      const c=contractDataFromEmployee(e);
      html = buildContractHtml(e,c);
    }else if(currentDocType==='penalties'){
      html=`<h2>لائحة الجزاءات والخصومات</h2><div class="doc-date">${today}</div>
      <p><b>ملاحظة:</b> هذه اللائحة مستقلة عن عقد العمل ويُرجع إليها عند تطبيق الجزاءات وفق الإجراءات المعتمدة.</p>
      <p>نحرص على التحفيز وليس العقاب، ويسبق الخصم إنذار شفهي ثم إنذار خطي أول وثانٍ، ثم الخصم عند استمرار المخالفة وبعد التحقيق.</p>
      <table class="doc-mini-table"><thead><tr><th>م</th><th>المخالفة أثناء العمل</th><th>الخصم / الإجراء</th></tr></thead><tbody>
      <tr><td>1</td><td>التأخير، عدم الالتزام بالزي، عدم حمل البطاقة أو أدوات العمل، التدخين أو المزاح أثناء العمل، عدم اتباع التعليمات</td><td>حسم نصف يوم، وعند التكرار حسم يوم</td></tr>
      <tr><td>2</td><td>الغياب، التجمعات في المواقع، عدم متابعة دخول أو خروج المواد</td><td>حسم يومين</td></tr>
      <tr><td>3</td><td>الغياب أيام العيد أو الانسحاب من العمل دون إذن مسبق</td><td>حسم أربعة أيام</td></tr>
      <tr><td>4</td><td>الغياب خمسة أيام أو أكثر متتالية خلال الشهر أو عشرين يوماً في السنة</td><td>فصل بدون مستحقات</td></tr>
      <tr><td>5</td><td>النوم أثناء العمل أو عدم التقيد بالتعليمات أو الانشغال بالجوال والأجهزة الذكية</td><td>حسم ثلاثة أيام</td></tr>
      <tr><td>6</td><td>مخالفات أخرى لم تذكر أعلاه</td><td>وفق الحالة واللائحة المعتمدة</td></tr></tbody></table>`;
    }else if(currentDocType==='directwork'){
      html=`<h2>مباشرة عمل</h2><div class="doc-date">التاريخ: ${today}</div>
      <table class="doc-mini-table"><tbody><tr><th>اسم الموظف</th><td>${blank(e.fullname)}</td></tr><tr><th>المسمى الوظيفي</th><td>${blank(e.jobtitle)}</td></tr><tr><th>القسم</th><td>${blank(e.dept)}</td></tr><tr><th>الموقع</th><td>${blank(e.project||e.region)}</td></tr></tbody></table>
      <p>نفيدكم بأن الموظف المذكور أعلاه باشر العمل لدينا اعتباراً من:</p><p>التاريخ: <span class="blank">/ / 144هـ</span> الموافق: <span class="blank">/ / 202م</span></p>
      <p>نوع المباشرة: ☐ تعيين جديد &nbsp;&nbsp; ☐ إعادة تعيين &nbsp;&nbsp; ☐ عودة من الإجازة &nbsp;&nbsp; ☐ أخرى</p>
      <p>أقر أنا الموظف بأنني باشرت العمل لدى ${blank(co)} وألتزم بأنظمة الشركة وتعليماتها وفترة التجربة المحددة في عقد العمل.</p>
      <div class="sign-row"><div>اسم الموظف<br>${blank(e.fullname)}<br>التوقيع: ....................</div><div>الموارد البشرية<br>...........................</div><div>رئيس العمليات<br>...........................</div></div>`;
    }else if(currentDocType==='fileundertaking'){
      html = `
        <h2>إقرار وتعهد بإكمال ملف التوظيف</h2>
        <div class="doc-date">التاريخ: ${today}</div>
        <p>أقر وأتعهد أنا الموظف: ${blank(e.fullname)}، هوية رقم: ${blank(e.idnum)}، موقعي: ${blank(e.dept)}،</p>
        <p>بإكمال متطلبات ملف التوظيف الخاص بي خلال أسبوع من تاريخ توقيعي على هذا الإقرار، وفي حال عدم تجاوبي يحق للشركة إيقافي عن العمل وإنهاء خدماتي.</p>
        <p><b>المستندات المطلوبة:</b></p>
        <ol>
          <li>صورة الهوية الوطنية مع إحضار الأصل للمطابقة.</li>
          <li>صورتان شمسيتان 4×6.</li>
          <li>صورة من إثبات السكن (العنوان الوطني).</li>
          <li>شهادة خلو سوابق من أبشر.</li>
          <li>شهادة الآيبان البنكي.</li>
          <li>تعبئة الكفالة الحضورية من الكفيل مع صورة من هوية الكفيل.</li>
        </ol>
        <div class="sign-row"><div>اسم الموظف: ${blank(e.fullname)}</div><div>التوقيع<br>...........................</div><div>البصمة<br>...........................</div></div>`;
    }else if(currentDocType==='guarantee'){
      html = `
        <h2>كفالة حضورية وغرم</h2>
        <div class="doc-date">التاريخ: ${today}</div>
        <p>أتعهد أنا: <span class="blank">.......................</span> (اسم الكفيل)، بصفتي كفيلاً للموظف / ${blank(e.fullname)} الراغب في العمل لدى ${blank(co)}،</p>
        <p>بأنه في حال تركه للعمل دون تسليم العُهد المسلّمة له أو تصفية الحقوق أو تسببه في أي التزامات أو إتلاف ممتلكات خاصة بالشركة أو بعملائها، فسوف أُحضره فوراً خلال مدة أقصاها أسبوعان من تاريخ إبلاغي بذلك، وفي حال عدم تمكني من إحضاره أقر بموافقتي على تحمل جميع المبالغ المترتبة عليه وكذلك العُهد، وألتزم بتحمل أي إجراء قانوني يصدر بحقه من الجهات الرسمية.</p>
        <p style="font-size:12px; color:var(--ink-soft);">ملاحظة: يجب إرفاق صورة من بطاقة أحوال الكفيل.</p>
        <div class="sign-row"><div>اسم الكفيل<br>...........................</div><div>التوقيع والبصمة<br>...........................</div><div>التاريخ<br>...........................</div></div>`;
    }else if(currentDocType==='medical'){
      html = `
        <h2>استمارة كشف طبي</h2>
        <div class="doc-date">التاريخ: ${today}</div>
        <p>الاسم: ${blank(e.fullname)} &nbsp;&nbsp; المسمى الوظيفي: ${blank(e.jobtitle)}</p>
        <hr>
        <p><b>نتيجة الكشف الطبي:</b></p>
        <p>وبناءً على نتائج الكشف والفحوصات الطبية الموضحة أعلاه، فقد تبيّن أن المذكور:</p>
        <p>☐ لائق طبياً للعمل &nbsp;&nbsp;&nbsp; ☐ لائق طبياً للعمل مع ملاحظات &nbsp;&nbsp;&nbsp; ☐ غير لائق طبياً للعمل</p>
        <p>هذا للاطلاع والإحاطة.. وتقبلوا خالص التحية وفائق التقدير.</p>
        <div class="sign-row"><div>اسم الدكتور<br>...........................</div><div>التوقيع<br>...........................</div><div>الختم<br>...........................</div></div>`;
    }else if(currentDocType==='salarytransfer'){
      html = `
        <h2>إقرار تحويل راتب</h2>
        <div class="doc-date">التاريخ: ${today}</div>
        <p>السادة: ${blank(co)} المحترمين</p>
        <p>السلام عليكم ورحمة الله وبركاته،</p>
        <p>نظراً لعدم إمكانية تحويل راتبي الشهري إلى حسابي الخاص، أرجو منكم إيداع راتبي في حساب السيد:</p>
        <p>الاسم: ${e.holder_name ? blank(e.holder_name) : '<span class="blank">.......................</span>'} &nbsp; رقم الهوية الوطنية: <span class="blank">.......................</span> &nbsp; صلة القرابة: <span class="blank">.......................</span></p>
        <p>مع تأكيدي بموافقة صاحب الحساب وعدم ممانعته على إيداع راتبي في حسابه، وأتحمّل كافة التبعات القانونية بالكامل في حال عدم صحة ذلك، وبهذا أُخلي مسؤولية ${blank(co)} من أي مساءلة بهذا الخصوص.</p>
        <p><b>المرفقات:</b> صورة من الحساب البنكي المراد التحويل إليه — صورة من هوية صاحب الحساب.</p>
        <div class="sign-row"><div>اسم الموظف<br>${blank(e.fullname)}</div><div>رقم الهوية<br>${blank(e.idnum)}</div><div>البصمة<br>...........................</div></div>
        <div class="sign-row"><div>اعتماد مشرف الموقع<br>...........................</div><div>مدير العمليات<br>...........................</div></div>`;
    }
    sheet.innerHTML = html;
  }

  function refreshEmployeeDependencies(){
    try{
      refreshRegionSelects();
      refreshEmployeeProjectSelect(document.getElementById('f_region')?.value||'');
      const dept=document.getElementById('f_dept')?.value||'';
      const job=document.getElementById('f_jobtitle')?.value||'';
      refreshDepartmentJobSelects(dept,job);
      renderDepartments?.();
      renderProjects?.();
    }catch(err){ console.error('Employee dependencies refresh failed:',err); }
  }

  async function initCloud(){
    const deadline=Date.now()+12000;
    while((!window.firebaseUserReady || !window.FB) && Date.now()<deadline){
      await new Promise(r=>setTimeout(r,50));
    }
    if(!window.firebaseUserReady || !window.FB) return;
    const user = await window.firebaseUserReady;
    if(!user) return;
    try{
      const localFallback = currentState();
      const cloudState = await window.FB.hydrateState(localFallback);
      // إذا كانت قاعدة Firestore موجودة لكنها بلا موظفين، لا نستبدل بيانات
      // المشروع المحلية/المبدئية بقائمة فارغة. نستخدم الموظفين الموجودين
      // بالفعل في المشروع ثم نحفظهم في Firestore ليظهروا لكل المستخدمين.
      const hasCloudEmployees = Array.isArray(cloudState?.employees) && cloudState.employees.length > 0;
      if(hasCloudEmployees){
        applyState(cloudState);
        persistLocal();
        refreshEmployeeDependencies();
      }else if(Array.isArray(localFallback.employees) && localFallback.employees.length > 0){
        applyState(localFallback);
        persistLocal();
        refreshEmployeeDependencies();
        try{ await window.FB.saveState(currentState()); }catch(saveErr){ console.error('Initial employee restore failed:',saveErr); }
      }else{
        applyState(cloudState || localFallback);
        persistLocal();
        refreshEmployeeDependencies();
      }
      window.FB.startRealtimeSync((state)=>{
        if(!state) return;
        cloudApplying=true;
        try{
          // أثناء تنفيذ "بدء دورة بيانات جديدة" يجب قبول الحالة الفارغة
          // القادمة من Firestore وعدم استرجاع البيانات القديمة من الذاكرة المحلية.
          // في الحالات العادية فقط نحمي البيانات المحلية من snapshot فارغ قديم.
          if(!forceOperationalReset && Array.isArray(state.employees) && state.employees.length===0 && employees.length>0){
            const keepState=currentState();
            persistLocal();
            window.FB.saveState(keepState).catch(err=>console.error('Employee restore sync failed:',err));
            applyState(keepState);
            refreshEmployeeDependencies();
          }else{
            applyState(state);
            persistLocal();
            refreshEmployeeDependencies();
          }
          switchView(currentView);
          if(currentView==='employees') renderEmployeeTable();
          renderAttendanceAndPenalties?.();
        } finally { cloudApplying=false; }
      });
    }catch(err){
      console.error('Cloud initialization failed:',err);
      showToast('تعذر الاتصال بقاعدة البيانات السحابية');
      loadEmployees(); loadAux();
    }
  }

  /* ===== init ===== */
  applyTheme();
  loadEmployees();
  loadAux();
  await initCloud();
  renderRegions();
  renderProjects();
  refreshRegionSelects();
  refreshEmployeeProjectSelect();
  document.getElementById('p_date').value = new Date().toISOString().slice(0,10);
  document.getElementById('c_date').value = new Date().toISOString().slice(0,10);
  switchView('dashboard');
  renderPenalties();
})();
