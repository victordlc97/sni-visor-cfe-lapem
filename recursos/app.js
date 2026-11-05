'use strict';
(()=>{
 const db=window.SNI_DATA; if(!db){document.getElementById('resultsList').textContent='No se encontró el archivo de datos. Abra index.html dentro de la carpeta completa, sin mover archivos.';return;}
 const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
 const byId=new Map(db.items.map(x=>[x.id,x]));
 const doclink=i=>`documentos/${i.src==='LPA'?'LPA-04112026.pdf':'LPP-Proveedores-Aprobados.pdf'}#page=${i.page}`;
 const DATE=new Date();
 function dateOf(s){if(!s)return null;const m=String(s).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1],23,59,59):null;}
 function expired(i){const d=dateOf(i.expiry);return !!d && d<DATE;}
 let selected={};try{selected=JSON.parse(localStorage.getItem('sniSelection20261104')||'{}')||{};}catch{selected={}}
 const saveSelected=()=>{try{localStorage.setItem('sniSelection20261104',JSON.stringify(selected))}catch{}document.querySelectorAll('.selection-n').forEach(e=>e.textContent=Object.keys(selected).length)};
 let filterPage=0,companyPage=0,activeRecords=[],showCompanies=[],lastResults=[];
 const FORM=['q','fFamily','fSpec','fVolt','fAmp','fPower','fMva','fKa','fNbi','fType','fSource'];
 const sourceLabel=i=>i.src==='LPA'?'LPA · Prototipo':'LPP · Proveedor';
 const fmt=n=>Number.isFinite(n)?Number(n).toLocaleString('es-MX',{maximumFractionDigits:3}):String(n??'');
 const getVal=id=>$(id).value.trim();
 function getFilters(){return {q:getVal('q'),family:getVal('fFamily'),spec:norm(getVal('fSpec')).replace(/\s+/g,''),volt:parseFloat(getVal('fVolt')),amp:parseFloat(getVal('fAmp')),power:parseFloat(getVal('fPower')),mva:parseFloat(getVal('fMva')),ka:parseFloat(getVal('fKa')),nbi:parseFloat(getVal('fNbi')),type:getVal('fType'),source:getVal('fSource'),exclude:$('exclude').checked}}
 function hasNum(v){return Number.isFinite(v)&&v>=0}
 // Automatic technical values are evidence only and never a contractual acceptance ruling.
 function checkRange(meta,v,key){
    if(!meta ||meta.mode==='unknown')return 'unknown';
    if(meta.mode==='range')return v+1e-8>=meta.min && v-1e-8<=meta.max?'yes':'no';
    if((meta.points||[]).some(x=>Math.abs(x-v)<1e-5))return 'yes';
    return (meta.points||[]).length?'no':'unknown';
 }
 function checkAtLeast(meta,v){if(!meta || !(meta.points||[]).length)return 'unknown';if(meta.points.some(x=>Math.abs(x-v)<1e-8))return 'yes';return meta.points.some(x=>x>v)?'unknown':'no'}
 function checkType(i,t){if(!t)return 'yes';
   if(!i.family.includes('Cuchillas')&&!i.family.includes('Interruptores')&&!i.family.includes('Desconectadores'))return 'unknown';
   if(i.tags.includes(t))return 'yes';
   const contra={'TRIPOLAR':['MONOPOLAR'],'MONOPOLAR':['TRIPOLAR'],'PANTÓGRAFO':['TIPO V'],'TIPO V':['PANTÓGRAFO']};
   if((contra[t]||[]).some(x=>i.tags.includes(x)))return 'no';
   return 'unknown';
 }
 // Blind text matches are not interpreted as certified technical parameters.
 function checkText(i,q){
    if(!q)return true;
    const phrases=norm(q).split(/\s+/).filter(x=>x&&!['EL','LA','LAS','LOS','UN','DE','DEL','PARA','EN','Y','CON','TIPO','KV'].includes(x));
    const src=norm(i.company+' '+i.brand+' '+i.title+' '+i.query+' '+i.norms.join(' '));
    const synonyms={'CUCHILLA':['CUCHILLA','SECCIONADOR','DESCONECTADOR'],'SECCIONADOR':['SECCIONADOR','CUCHILLA','DESCONECTADOR'],'BANCO':['BANCO','BANCOS']};
    return phrases.every(w=>(synonyms[w]||[w]).some(s=>src.includes(s)));
 }
 function checkNumericFromText(i,v,unit){
    if(!hasNum(v))return 'yes';
    const str=norm(i.normalizedScope||i.title).replace(/(\d),(\d{3})(?=\s)/g,'$1$2');
    // kA and NBAI are only extracted from explicit labels, not from all text.
    if(unit==='ka'){
       // Withstand RMS/breaking ratings are NOT equivalent to peak/crest currents.
       // Ignore peaks; accept explicit short-circuit/short-time rating or value followed by 1s/3s.
       const found=[];
       for(const m of str.matchAll(/(?<!\w)(\d+(?:[.,]\d+)?)\s*KA\b/g)){
         const prior=str.slice(Math.max(0,m.index-52),m.index);
         const after=str.slice(m.index+m[0].length,m.index+m[0].length+24);
         if(/(?:CRESTA|PICO|MECANIC)[^;,.]{0,35}$/.test(prior)||/^\s*(?:PICO|CRESTA)/.test(after))continue;
         if(/(?:CORTOCIRCUITO|AGUANTE|INTERRUP|EFICAZ|TERMICA|RMS)[^;,.]{0,55}$/.test(prior)||/^\s*,?\s*(?:1|3)\s*S\b/.test(after))found.push(+m[1].replace(',','.'));
       }
       if(!found.length)return 'unknown';
       if(found.some(x=>Math.abs(x-v)<1e-7))return 'yes';
       return found.some(x=>x>v)?'unknown':'no';
    }
    const found=[];let m;
    const expressions=[/\bNBAI(?:\s+DE)?\s*(\d+(?:[.,]\d+)?)\s*KV\b/g,/(\d+(?:[.,]\d+)?)\s*KV\s*(?:DE\s*)?NBAI\b/g];
    for(const re of expressions){while((m=re.exec(str))!==null){found.push(+m[1].replace(',','.'))}}
    return found.length?(found.some(x=>x>=v)?'yes':'no'):'unknown';
 }
 function rate(i,f){
    const checks=[];
    if(!i.folio)checks.push(['Folio de constancia','unknown']);
    if(hasNum(f.volt))checks.push(['Tensión',checkRange(i.voltage,f.volt)]);
    if(hasNum(f.amp))checks.push(['Corriente',checkAtLeast(i.current,f.amp)]);
    if(hasNum(f.power))checks.push(['MVAr',checkRange(i.power,f.power)]);
    if(hasNum(f.mva))checks.push(['MVA',checkRange(i.mva,f.mva)]);
    if(hasNum(f.ka))checks.push(['Cortocircuito',checkNumericFromText(i,f.ka,'ka')]);
    if(hasNum(f.nbi))checks.push(['NBAI',checkNumericFromText(i,f.nbi,'nbai')]);
    if(f.type)checks.push(['Tipo',checkType(i,f.type)]);
    const contradictions=checks.filter(x=>x[1]==='no').map(x=>x[0]);
    const missing=checks.filter(x=>x[1]==='unknown').map(x=>x[0]);
    return {checks,contradictions,missing,status:contradictions.length?'no':missing.length?'unknown':checks.length?'yes':'neutral'};
 }
 function runFilters(f){
    const ans=[];
    for(const i of db.items){
      if(f.family&&i.family!==f.family)continue;
      if(f.spec&&!i.norms.includes(f.spec))continue;
      if(f.source&&i.src!==f.source)continue;
      if(!checkText(i,f.q))continue;
      const score=rate(i,f);
      if(f.exclude && score.status==='no')continue;
      ans.push({i,...score});
    }
    const priority={yes:0,unknown:1,neutral:2,no:3};
    ans.sort((a,b)=>(priority[a.status]-priority[b.status])||a.i.company.localeCompare(b.i.company,'es')||a.i.id.localeCompare(b.i.id));
    return ans;
 }
 function statusText(s){return {'yes':'Parámetros respaldados','unknown':'Requiere cotejo técnico','neutral':'Referencia documental','no':'No equivalente'}[s]||'Referencia'}
 function statusClass(s){return s==='yes'?'ok':s==='no'?'bad':''}
 function metrics(rows){let nCompany=new Set(rows.map(x=>x.i.key)).size;let yes=rows.filter(x=>x.status==='yes').length, unknown=rows.filter(x=>x.status==='unknown').length;
    $('foundCompanies').textContent=fmt(nCompany);$('foundRecords').textContent=fmt(rows.length);$('verifiedCount').textContent=fmt(yes);$('unknownCount').textContent=fmt(unknown);
 }
 function chooseBest(rows){const byComp=new Map();for(const r of rows){const v=byComp.get(r.i.key);if(!v)byComp.set(r.i.key,{...r,total:1,related:[r]});else{v.total++;v.related.push(r)}}return Array.from(byComp.values())}
 function buildResCard(x,group){const i=x.i,has=!!selected[i.id];const more=group?`<span class="pill">${x.total} registro(s) encontrados</span>`:'';
 const hints=[];
 if(group&&x.related&&x.related.length>1){
   const sources=[...new Set(x.related.map(r=>r.i.src))];
   hints.push(`<div class="related"><span>Folios vinculados al fabricante (${sources.join(' + ')}; verificar alcance de cada uno):</span>${x.related.slice(0,7).map(r=>`<button data-detail="${esc(r.i.id)}">${esc(r.i.folio)} · ${r.i.src}</button>`).join('')}${x.related.length>7?'<span>Consulte el resto en vista por registro.</span>':''}</div>`);
 }
 if(x.missing.length)hints.push(`<div class="result-note">Sin dato verificable en: ${esc(x.missing.join(', '))}.</div>`);
 if(x.contradictions.length)hints.push(`<div class="result-note" style="color:#9c4947">Contradicción en: ${esc(x.contradictions.join(', '))}.</div>`);
 return `<article class="result-card"><div class="res-head"><div><h3>${esc(i.company)}</h3><div class="muted">${esc(i.brand||'Marca no indicada')} · ${esc(i.country||'País no indicado')}</div></div><span class="status ${statusClass(x.status)}">${statusText(x.status)}</span></div><div class="meta"><span class="pill">${sourceLabel(i)}</span><span class="pill">${esc(i.folio||'Folio no localizado')}</span>${i.norms.slice(0,3).map(n=>`<span class="pill spec">${esc(n)}</span>`).join('')}${more}</div><div class="res-sub">${esc((i.normalizedScope||i.title).slice(0,280))}${(i.normalizedScope||i.title).length>280?'…':''}</div><div class="muted">${esc(i.family)} · Vigencia en PDF: ${esc(i.expiry||'No indicada')}${expired(i)?' · <b style="color:#9b3e39">Fecha vencida</b>':''}</div>${hints.join('')}<div class="res-actions"><button data-detail="${esc(i.id)}">Ver ficha y modelos</button><a href="${doclink(i)}" target="_blank" rel="noopener" style="font-size:12px">PDF · pág. ${i.page} ↗</a><button class="save ${has?'saved':''}" data-save="${esc(i.id)}">${has?'✓ Seleccionado':'+ Para cotizar'}</button></div></article>`;
 }
 const PAGE_SIZE=18;
 function showPagination(target,page,total,func){const pages=Math.ceil(total/PAGE_SIZE);target.innerHTML=pages<=1?'':`<button data-pg="prev" ${page<=0?'disabled':''}>← Anterior</button><span>${page+1} de ${pages} páginas</span><button data-pg="next" ${page>=pages-1?'disabled':''}>Siguiente →</button>`;
   target.querySelectorAll('button').forEach(b=>b.onclick=()=>func(b.dataset.pg==='next'?page+1:page-1));}
 function renderResults(){const f=getFilters();lastResults=runFilters(f);metrics(lastResults);
   const any=FORM.some(k=>Boolean(getVal(k)));$('resultTitle').textContent=any?'Fabricantes candidatos':'Consulta general de registros';
   $('resultSubtitle').textContent=any?'Ordenados por evidencia de los parámetros solicitados, no por calidad comercial.':'Utilice los filtros para generar una lista corta; se muestran los registros oficiales.';
   const data=$('viewMode').value==='empresa'?chooseBest(lastResults):lastResults;
   if(filterPage>=Math.ceil(data.length/PAGE_SIZE))filterPage=0;
   $('resultsList').innerHTML=data.length?data.slice(filterPage*PAGE_SIZE,filterPage*PAGE_SIZE+PAGE_SIZE).map(x=>buildResCard(x,$('viewMode').value==='empresa')).join(''):'<div class="empty">Sin resultados con estos criterios. Pruebe quitar un filtro o mostrar los registros con contradicciones.</div>';
   showPagination($('pagination'),filterPage,data.length,x=>{filterPage=x;renderResults();$('resultsList').scrollIntoView({behavior:'smooth',block:'start'})});
   bindCardActions($('resultsList'));
 }
 function bindCardActions(host){host.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>detail(byId.get(b.dataset.detail))));host.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',()=>toggleSelect(b.dataset.save)));}
 function sourceCSV(rows){const str=x=>'"'+String(x??'').replace(/"/g,'""')+'"';const h=['Fabricante','Marca','Producto/Familia','Folio','Fuente','Norma','Vencimiento','Página PDF','Estado búsqueda','Observación','Archivo'];
    return '\ufeff'+[h,...rows.map(r=>[r.company,r.brand,r.family,r.folio,r.src,r.norms.join('; '),r.expiry,r.page,'PENDIENTE DE VALIDACIÓN DE CP','No inferir cumplimiento sin verificar el alcance',doclink(r)])].map(a=>a.map(str).join(',')).join('\r\n'); }
 function download(name,contents,type){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([contents],{type}));a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),800)}
 function toggleSelect(id){if(selected[id])delete selected[id];else selected[id]=true;saveSelected();renderResults();renderSelection();}
 function renderSelection(){const rr=Object.keys(selected).map(id=>byId.get(id)).filter(Boolean);$('selectionList').innerHTML=rr.length?rr.map(i=>`<div class="selection-item"><div><strong>${esc(i.company)}</strong><span>${esc(i.family)} · ${esc(i.folio)} · ${esc(i.src)} · Vigencia según PDF: ${esc(i.expiry)}</span></div><button data-del="${i.id}">Quitar</button></div>`).join(''):'<div class="empty">No hay fabricantes seleccionados. Vaya a Buscar equipos y añada los registros que quiera consultar con Compras.</div>';
 $('selectionList').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>toggleSelect(b.dataset.del));}
 function detail(i){if(!i)return;const modal=$('detail');$('detailTitle').textContent=i.company;
  const fields=[['Fuente',sourceLabel(i)],['Folio',i.folio||'No localizado en la extracción'],['Marca',i.brand||'No indicada'],['Normas',i.norms.join(', ')||'No indicadas'],['Emisión',i.issue||'No indicada'],['Vencimiento',i.expiry||'No indicado'],['Tipo',i.type],['Página',String(i.page)],['País',i.country||'No indicado']];
  const nums=[['Tensión (kV)',i.voltage.mode==='range'?`${fmt(i.voltage.min)}–${fmt(i.voltage.max)} (rango descrito)`:i.voltage.mode==='points'?i.voltage.points.map(fmt).join(', '):'No extraída'],['Potencia (MVAr)',i.power.mode==='range'?`${fmt(i.power.min)}–${fmt(i.power.max)}`:i.power.mode==='points'?i.power.points.map(fmt).join(', '):'No extraída'],['Corriente (A)',i.current.points.length?i.current.points.map(fmt).join(', '):'No extraída'],['Potencia aparente (MVA)',i.mva.mode==='range'?`${fmt(i.mva.min)}–${fmt(i.mva.max)}`:i.mva.mode==='points'?i.mva.points.map(fmt).join(', '):'No extraída']];
  $('detailBody').innerHTML=`<div class="detail-grid">${fields.map(([k,v])=>`<div><label>${esc(k)}</label><strong>${esc(v)}</strong></div>`).join('')}</div><h3>Alcance declarado en el PDF</h3><div class="source-text">${esc(i.title)}</div><h3 style="margin-top:23px">Parámetros extraídos para búsqueda</h3><div class="detail-grid">${nums.map(([k,v])=>`<div><label>${esc(k)}</label><strong>${esc(v)}</strong></div>`).join('')}</div><h3>Modelos / descripciones del fabricante (${i.models.length})</h3><ul class="details-list">${i.models.map(m=>`<li><b>${esc(m.code||'Modelo no individualizado')}</b>${esc(m.desc)}${m.cfe?`<div class="muted">Descripción CFE: ${esc(m.cfe)}</div>`:''}</li>`).join('')}</ul><a class="detail-link" href="${doclink(i)}" target="_blank" rel="noopener">Abrir PDF original, página ${i.page} ↗</a><div class="detail-warning">Esta ficha no constituye una constancia emitida por SNI ni acredita automáticamente cumplimiento contractual, ubicación de planta, ni aceptación de un lote. Confronte los requisitos de la CP y el documento LAPEM original.</div>`;
  modal.showModal(); }
 function renderCompanies(){const q=norm(getVal('companySearch')),fam=getVal('companyFamily');showCompanies=db.companies.filter(x=>(!q||norm(x.name+' '+x.aliases.join(' ')).includes(q))&&(!fam||x.families.includes(fam))).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'es'));
 $('companyCount').textContent=`${fmt(showCompanies.length)} fabricantes`;if(companyPage>=Math.ceil(showCompanies.length/PAGE_SIZE))companyPage=0;
 $('companyGrid').innerHTML=showCompanies.slice(companyPage*PAGE_SIZE,companyPage*PAGE_SIZE+PAGE_SIZE).map(c=>`<article class="company-tile"><h3>${esc(c.name)}</h3><p>${esc(c.country||'País no indicado')} · ${c.count} registro(s)</p><div class="pills">${c.sources.map(s=>`<span class="pill">${s}</span>`).join('')}${c.families.slice(0,2).map(f=>`<span class="pill spec">${esc(f)}</span>`).join('')}</div><button data-company="${esc(c.key)}">Ver sus registros →</button></article>`).join('');
 $('companyGrid').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=db.companies.find(x=>x.key===b.dataset.company);if(!c)return;switchPanel('buscar');resetForm();$('q').value=c.name;filterPage=0;renderResults()});
 showPagination($('companyPagination'),companyPage,showCompanies.length,p=>{companyPage=p;renderCompanies();$('companyGrid').scrollIntoView({behavior:'smooth',block:'start'})});}
 function resetForm(){FORM.forEach(id=>$(id).value='');$('exclude').checked=true}
 function switchPanel(name){document.querySelectorAll('.panel').forEach(e=>e.classList.toggle('show',e.id===name));document.querySelectorAll('.tab').forEach(e=>e.classList.toggle('active',e.dataset.panel===name));window.scrollTo({top:0,behavior:'instant'});if(name==='empresas')renderCompanies();if(name==='lista')renderSelection();}
 document.querySelectorAll('.tab').forEach(e=>e.onclick=()=>switchPanel(e.dataset.panel));
 const byFamily=[...db.families].sort((a,b)=>a.localeCompare(b,'es'));for(const f of byFamily){for(const id of ['fFamily','companyFamily']){const op=document.createElement('option');op.value=f;op.textContent=f;$(id).appendChild(op)}}
 let debounce;for(const id of FORM){$(id).addEventListener(id==='q'||id==='fSpec'?'input':'change',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{filterPage=0;renderResults()},id==='q'||id==='fSpec'?240:60)})}
 $('exclude').onchange=()=>{filterPage=0;renderResults()};$('searchBtn').onclick=()=>{filterPage=0;renderResults()};$('resetBtn').onclick=()=>{resetForm();filterPage=0;renderResults()};$('viewMode').onchange=()=>{filterPage=0;renderResults()};
 document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{resetForm();const type=b.dataset.example;if(type==='bancos'){$('fFamily').value='Bancos de capacitores AT (69–161 kV)';$('fSpec').value='V8000-53';$('fVolt').value='115'}if(type==='cuchillas'){$('fFamily').value='Cuchillas y seccionadores AT/MT';$('fVolt').value='123';$('fAmp').value='2000';$('fType').value='TIPO V'}if(type==='transformadores'){$('fFamily').value='Transformadores de potencia'}filterPage=0;renderResults();$('resultsList').scrollIntoView({behavior:'smooth',block:'start'})});
 $('companySearch').oninput=()=>{companyPage=0;renderCompanies()};$('companyFamily').onchange=()=>{companyPage=0;renderCompanies()};
 $('closeDetail').onclick=()=>$('detail').close();$('detail').addEventListener('click',e=>{if(e.target===$('detail'))$('detail').close()});
 $('exportCsv').onclick=()=>download('SNI_CANDIDATOS_COTIZACION.csv',sourceCSV(Object.keys(selected).map(id=>byId.get(id)).filter(Boolean)),'text/csv;charset=utf-8');
 $('exportJson').onclick=()=>download('SNI_RESPALDO_SELECCION.json',JSON.stringify({schema:'SNI-LAPEM-selection-v1',date:new Date().toISOString(),ids:Object.keys(selected)},null,2),'application/json');
 $('clearSelection').onclick=()=>{if(Object.keys(selected).length&&!confirm('¿Vaciar la lista de cotización?'))return;selected={};saveSelected();renderSelection();};
 $('importJson').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const obj=JSON.parse(await file.text());if(obj.schema!=='SNI-LAPEM-selection-v1'||!Array.isArray(obj.ids))throw Error('Formato de selección no válido');for(const id of obj.ids)if(byId.has(id))selected[id]=true;saveSelected();renderSelection()}catch(x){alert('No se pudo importar el archivo: '+x.message)}e.target.value=''};
 $('allCompanies').textContent=fmt(db.meta.companyKeys);$('allRegs').textContent=fmt(db.items.length);saveSelected();renderResults();
 // Diagnostic data accessible for independent automated verification, without side effects.
 window.SNI_DEBUG={getFilters,runFilters:(overrides={})=>runFilters({...getFilters(),...overrides}).map(r=>({id:r.i.id,company:r.i.company,folio:r.i.folio,voltage:r.i.voltage,power:r.i.power,status:r.status,missing:r.missing,contradictions:r.contradictions})),record:id=>byId.get(id),meta:db.meta};
})();
