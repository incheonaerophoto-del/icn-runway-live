(()=>{'use strict';
const $=id=>document.getElementById(id),C=window.ICNCore;
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const defaults={types:['A124','IL76','AN12','B703','DC86'],regs:[],flights:[]};
let watch=load('icn-watch-v3',defaults);if(!watch||!['types','regs','flights'].every(k=>Array.isArray(watch[k])&&watch[k].every(v=>typeof v==='string')))watch=defaults;
let schedules=load('icn-schedules-v3',[]);if(!Array.isArray(schedules))schedules=[];schedules=schedules.filter(C.validSchedule).slice(0,500);
const state={data:null,selected:null,demo:false,paused:false,busy:false,zoom:1,tab:'arrival',generation:0};
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{message('이 브라우저에 저장할 수 없습니다. 저장 공간·비공개 모드 설정을 확인해 주세요.');return false;}}
function message(s){$('alert').hidden=!s;$('alert').textContent=s;}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const kst=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t*1000));
const dateText=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(new Date(t*1000));
const eta=t=>t?Math.max(0,Math.ceil((t-Date.now()/1000)/60))+'분':'—';
const fresh=()=>!!state.data?.fresh&&(Date.now()/1000-(state.data?.received_at||0)<70);
const livePlanes=()=>fresh()?(state.data?.aircraft||[]):[];
const activeSchedules=()=>state.demo?[]:schedules.filter(s=>s.time>Date.now()/1000-86400);
const ns='http://www.w3.org/2000/svg';
const colors={'33R':'#59bcff','34L':'#f9be5c','33L':'#c7a6ff','34R':'#58d6cc','15L':'#59bcff','16R':'#f9be5c','15R':'#c7a6ff','16L':'#58d6cc'};
const baseRunways=[
{name:'33L',threshold:[37.454201,126.460999],opposite:[37.481800,126.435997]},
{name:'33R',threshold:[37.456402,126.464996],opposite:[37.483898,126.440002]},
{name:'34R',threshold:[37.443432,126.441697],opposite:[37.472740,126.415631]},
{name:'34L',threshold:[37.441272,126.437882],opposite:[37.468746,126.413446]},
];

const bounds={lat:37.452,lon:126.454,latRange:.26,lonRange:.34};
const fmt=n=>n==null?'—':new Intl.NumberFormat('ko-KR').format(n);
const timeFmt=t=>t?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t*1000)):'—';
function color(r){return colors[r]||'#a4bed5';}
function svgNode(tag,attrs={},parent=$('mapSvg')){const el=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));parent.appendChild(el);return el;}
function pt(lat,lon){return [(lon-bounds.lon)/(bounds.lonRange*state.zoom)*800+400,(bounds.lat-lat)/(bounds.latRange*state.zoom)*520+260];}
function coordPoint(p){return pt(p[0],p[1]);}
function ext(start,other,distanceM){const refCos=Math.cos(37.46*Math.PI/180);const east=(other[1]-start[1])*111320*refCos,north=(other[0]-start[0])*111320;const len=Math.hypot(east,north)||1;return [start[0]-north/len*distanceM/111320,start[1]-east/len*distanceM/(111320*refCos)];}
function textSvg(txt,x,y,opts={}){const node=svgNode('text',{x,y,fill:opts.fill||'#9cb8ce','font-size':opts.size||13,'font-weight':opts.weight||650,'text-anchor':opts.anchor||'middle','paint-order':'stroke','stroke':'#0b1c2c','stroke-width':opts.stroke||2.5,'stroke-linejoin':'round'});node.textContent=txt;return node;}
function drawMap(){
 const svg=$('mapSvg');while(svg.firstChild)svg.removeChild(svg.firstChild);
 svgNode('rect',{x:0,y:0,width:800,height:520,fill:'#0b1c2c'});
 // Coordinate grid.
 const step=state.zoom<.75?.025:.05;for(let a=37.1;a<=37.8;a+=step){const[_,y]=pt(a,bounds.lon);if(y>0&&y<520){svgNode('line',{x1:0,y1:y,x2:800,y2:y,stroke:'#213748','stroke-width':1});textSvg(a.toFixed(2)+'°N',6,y-5,{size:10,anchor:'start',fill:'#5c788f',stroke:0});}}
 for(let a=126.1;a<=126.8;a+=step){const[x]=pt(bounds.lat,a);if(x>0&&x<800){svgNode('line',{x1:x,y1:0,x2:x,y2:520,stroke:'#213748','stroke-width':1});textSvg(a.toFixed(2)+'°E',x,19,{size:10,fill:'#5c788f',stroke:0});}}
 const arp=pt(37.4625,126.447);svgNode('circle',{cx:arp[0],cy:arp[1],r:91,fill:'#233b48',opacity:.32});
 textSvg('INCHEON · RKSI',arp[0]+34,arp[1]+74,{size:11,fill:'#7793aa',anchor:'middle'});
 for(const r of baseRunways){const a=coordPoint(r.threshold),b=coordPoint(r.opposite),col=color(r.name);
 const ex=coordPoint(ext(r.threshold,r.opposite,14000));
 const otherEx=coordPoint(ext(r.opposite,r.threshold,14000));svgNode('line',{x1:b[0],y1:b[1],x2:otherEx[0],y2:otherEx[1],stroke:col,opacity:.25,'stroke-width':2,'stroke-dasharray':'7 10'});
 const reciprocal={'33L':'15R','33R':'15L','34R':'16L','34L':'16R'};textSvg(reciprocal[r.name],b[0]+16,b[1]-12,{size:12,fill:col});
 svgNode('line',{x1:ex[0],y1:ex[1],x2:a[0],y2:a[1],stroke:col,opacity:.38,'stroke-width':2,'stroke-dasharray':'7 10'});
 svgNode('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#50738d','stroke-width':12,'stroke-linecap':'round',opacity:.38});
 svgNode('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:col,'stroke-width':3,'stroke-linecap':'round',opacity:.91});
 svgNode('circle',{cx:a[0],cy:a[1],r:4,fill:col});
 const offset=(r.name==='33R'||r.name==='34R')?18:-16;
 textSvg(r.name,a[0]+offset,a[1]+14,{size:14,fill:col,weight:850});
 }
 const planes=livePlanes();
 for(const p of planes){let[x,y]=pt(p.lat,p.lon);if(x<0||x>800||y<0||y>520)continue;
 let active=state.selected===p.hex,approach=!!p.predicted_runway,col=active?'#ffffff':approach?color(p.predicted_runway||p.runway):'#7395ae';
 const g=svgNode('g',{transform:`translate(${x} ${y})`,role:'button',tabindex:0,'aria-label':`${p.flight} ${p.runway||'주변 항공기'}`});
 g.style.cursor='pointer';g.style.outline='none';
 if(active)svgNode('circle',{cx:0,cy:0,r:20,fill:'none',stroke:'#ffffff','stroke-width':1.4,opacity:.8},g);
 svgNode('circle',{cx:0,cy:0,r:13,fill:'#10293d',opacity:.82},g);
 const heading=Number.isFinite(p.track_deg)?p.track_deg:0;
 svgNode('path',{d:'M 0 -12 L 3.1 -3 L 11 1 L 11 4 L 3 2 L 3 8 L 6 10 L 6 12 L 0 10 L -6 12 L -6 10 L -3 8 L -3 2 L -11 4 L -11 1 L -3.1 -3 Z',transform:`rotate(${heading})`,fill:col,stroke:'#0a1927','stroke-width':.8},g);
 const lbl=svgNode('text',{x:16,y:-9,'font-size':12,'font-weight':750,fill:active?'#ffffff':approach?'#e5f3ff':'#9eb4c9','paint-order':'stroke',stroke:'#0b1c2c','stroke-width':3},g);lbl.textContent=p.flight;
 const choose=()=>{state.selected=p.hex;renderSelected();drawMap();renderBoard();};
 g.addEventListener('click',choose);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
 }
 svgNode('path',{d:'M 754 37 L 767 14 L 780 37 L 767 31 Z',fill:'#a6c7d8',opacity:.8});textSvg('N',767,52,{size:11,weight:800,fill:'#b7d5e7'});
 $('mapEmpty').style.display=planes.length?'none':'block';$('mapEmpty').textContent=state.data?.error?'데이터 연결 재시도 중':state.data?.received_at?'현재 지도 범위에 수신 항공기가 없습니다':'항공기 데이터 연결 중…';
 }
function selectPlane(p){state.selected=p.hex;renderSelected();renderBoard();drawMap();}
function renderSelected(){const p=(state.data?.aircraft||[]).find(p=>p.hex===state.selected);const good=fresh();$('detailFlight').textContent=p?.flight||'항공기를 선택하세요';$('detailSub').textContent=p?`${p.type||'기종 미확인'} · ${p.phase} ${good?'':'· 오래된 자료'}`:'지도 또는 목록에서 선택';$('dRunway').textContent=good&&p?.predicted_runway?p.predicted_runway:p?.prediction?.ambiguous?'구분 대기':'—';$('dEta').textContent=good?eta(p?.arrival_eta):'—';$('dConfidence').textContent=good?p?.prediction?.confidence||'—':'—';$('dReason').textContent=p?.prediction?.reason||'최종 접근 관측이 시작되면 후보를 표시합니다.';const root=$('candidateList');root.replaceChildren();if(good)for(const c of p?.prediction?.candidates||[])root.append(el('span','candidate',`${c.runway} · 중심선 ${c.cross_m}m · 방향차 ${c.heading_error}°`));$('dAlt').textContent=p?.ground?'지상':p?.altitude_ft!=null?fmt(p.altitude_ft)+' ft':'—';$('dSpeed').textContent=p?.speed_kt!=null?p.speed_kt+' kt':'—';$('dVr').textContent=p?.vertical_speed_fpm!=null?p.vertical_speed_fpm+' ft/min':'—';$('dReg').textContent=p?.registration||'—';$('watchBtn').disabled=!p||state.demo;$('watchBtn').textContent=p&&watch.regs.includes(p.registration)?'★ 관심 해제':'☆ 관심 등록';}
function renderStats(){const a=livePlanes();$('total').textContent=state.data?.received_at?a.length:'—';$('arrivals').textContent=a.filter(p=>p.movement==='arrival').length;$('departures').textContent=a.filter(p=>p.movement==='departure').length;$('specialCount').textContent=a.filter(p=>C.reasons(p,watch,activeSchedules()).length).length;}
function filtered(p){const query=$('search').value.trim().toUpperCase(),r=$('runwayFilter').value;return(!query||[p.flight,p.registration,p.type,p.airport].some(v=>String(v||'').toUpperCase().includes(query)))&&(!r||p.predicted_runway===r||(p.prediction?.candidates||[]).some(c=>c.runway===r));}
function empty(root,title,sub){const box=el('div','empty');box.append(el('b','',title),el('span','',sub));root.append(box);}
function flightCard(root,p,i,kind,s){const card=el('article','flight-card'+(state.selected===p.hex?' selected':''));if(p.hex){card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',p.flight+' 자세히 보기');card.addEventListener('click',e=>{if(!e.target.closest('button'))selectPlane(p);});card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectPlane(p);}});}const body=el('div','flight-body'),right=el('div','flight-right');body.append(el('h4','',p.flight),el('p','',`${p.registration||'등록번호 미확인'} · ${p.type||'기종 미확인'}`));let text=kind==='schedule'?`${s.direction==='arrival'?'도착':'출발'} · ${s.airport||'공항 미입력'} · 직접 등록`:kind==='departure'?'출발 상승 관측 · 미래 이륙 순서 아님':p.phase||'주변 비행';body.append(el('div','meta',text));const rs=C.reasons(p,watch,activeSchedules());if(rs.length)body.append(el('span','pill gold',rs.join(' · ')));if(kind==='schedule'){right.append(el('strong','',kst(s.time)),el('small','',dateText(s.time)+' KST · 등록 일정'));if(s.note)body.append(el('p','',s.note));if(s.source)body.append(el('p','',`출처: ${s.source}`));}else if(kind==='departure'){right.append(el('strong','',kst(p.departure_observed_at)),el('small','','최초 상승 관측 KST'));}else if(p.arrival_eta){right.append(el('strong','',eta(p.arrival_eta)),el('small','',`${kst(p.arrival_eta)} 예상 · 속도 유지 가정`));}else right.append(el('strong','','—'),el('small','','예정시간 미확인'));
 if(p.prediction?.candidates?.length){const label=p.predicted_runway||p.prediction.candidates.slice(0,2).map(c=>c.runway).join(' / ');right.append(el('span','pill rwy',label),el('small','',p.prediction.ambiguous?'평행 활주로 구분 대기':`신뢰도 ${p.prediction.confidence}`));}card.append(el('span','rank',String(i+1).padStart(2,'0')),body,right);if(s){const actions=el('div','schedule-actions');const edit=el('button','','수정'),del=el('button','','삭제');edit.addEventListener('click',()=>openSchedule(s));del.addEventListener('click',()=>{if(!confirm(`${s.flight} 등록 일정을 삭제할까요?`))return;const next=schedules.filter(x=>x.id!==s.id);if(save('icn-schedules-v3',next)){schedules=next;render();}});actions.append(edit,del);card.append(actions);}root.append(card);}
function renderBoard(){const root=$('flightList');root.replaceChildren();$('specialIntro').hidden=state.tab!=='special';let a=livePlanes().filter(filtered);let sc=activeSchedules().filter(filtered);let count=0;const headings={arrival:'예상 착륙시간 순 · 실제 관제 순서 아님',departure:'등록 예정시간 순 / 상승 관측시간 순',special:'등록 일정순 / 실시간 관심 항공기',all:'예상 도착시간 우선 · 시간 미확인은 아래'};$('orderLabel').textContent=headings[state.tab];
 if(state.tab==='special'||state.tab==='departure'||state.tab==='arrival'){
  let plans=sc.filter(s=>state.tab==='special'||s.direction===state.tab).sort(C.byTime);
  if(plans.length){root.append(el('div','special-section','등록 일정 · KST'));plans.forEach((s,i)=>{const match=a.find(p=>C.matches(p,s));flightCard(root,match?{...match,...s,hex:match.hex}:s,i,'schedule',s);});count+=plans.length;}
 }
 if(state.tab==='arrival')a=a.filter(p=>p.movement==='arrival');if(state.tab==='departure')a=a.filter(p=>p.movement==='departure'&&p.departure_observed_at);if(state.tab==='special')a=a.filter(p=>C.reasons(p,watch,activeSchedules()).length);
 a.sort((a,b)=>state.tab==='departure'?(a.departure_observed_at-b.departure_observed_at):C.byTime({time:a.arrival_eta,flight:a.flight},{time:b.arrival_eta,flight:b.flight}));
 if(a.length){if(count||state.tab==='special'||state.tab==='departure')root.append(el('div','special-section',state.demo?'데모 · 가상 항적':'실시간 관측 · ADS-B'));a.forEach((p,i)=>flightCard(root,p,i,p.movement==='departure'?'departure':'live'));count+=a.length;}
 if(!count){const title=state.tab==='special'?'아직 표시할 특별편이 없어요':state.tab==='departure'?'현재 출발 후보가 없습니다':state.tab==='arrival'?'현재 최종 접근 후보가 없습니다':'수신 항공기가 없습니다';empty(root,title,state.tab==='special'?'관심 기준을 바꾸거나 확인한 특별편 일정을 등록하세요.':fresh()?'확인된 항공기만 표시합니다. 지상 항공기의 이륙 순서는 추측하지 않습니다.':'실시간 데이터가 들어오면 자동으로 표시됩니다.');}
 $('listCount').textContent=count;
}
function renderEvents(){const root=$('eventList');root.replaceChildren();const ev=state.data?.events||[];if(!ev.length){empty(root,'관측 기록 대기','활주로 진입을 연속 관측하면 표시됩니다. 서버가 재시작되면 기록이 초기화됩니다.');return;}for(const e of ev.slice(0,15)){const row=el('div','event');row.append(el('time','',kst(e.timestamp)),el('b','',e.flight),el('span','pill',e.runway),el('span','',e.status));root.append(row);}}
function updateHeader(){const d=state.data,good=fresh();$('status').className='status'+(good&&!state.demo?' live':'');$('status').textContent=state.paused?'일시정지':state.demo?'● DEMO':good?'● LIVE':'● 연결 대기';$('lastUpdate').textContent=d?.received_at?`최근 수신 ${timeFmt(d.received_at)} KST · ${d.source||'미확인'}`:'데이터 수신 대기';if(state.demo)message('데모 모드입니다. 아래 항공편·항적·활주로 예측은 가상 예시이며 실제 일정이 아닙니다.');else if(d?.error)message(d.error+' · 자동 재시도 중입니다. 마지막 수신 시각을 확인하세요.');else if(d?.polling&&!d.received_at)message('공개 항공기 데이터를 연결하고 있습니다. 잠시 기다려 주세요.');else if(d&&!good)message('수신 자료가 오래되어 예측을 잠시 중단했습니다. 새 데이터 수신 시 자동 복구합니다.');else message('');}
function render(){updateHeader();renderStats();renderSelected();renderBoard();renderEvents();drawMap();}
async function refresh(){if(state.busy||state.paused)return;state.busy=true;const generation=state.generation,mode=state.demo;const control=new AbortController(),timeout=setTimeout(()=>control.abort(),35000);$('refreshBtn').disabled=true;try{const r=await fetch(mode?'/api/demo':'/api/live',{cache:'no-store',signal:control.signal});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(generation===state.generation){state.data=d;render();}}catch(e){if(generation===state.generation){updateHeader();message('서버 연결이 지연되고 있습니다. 자동으로 다시 연결합니다.');}}finally{clearTimeout(timeout);state.busy=false;$('refreshBtn').disabled=false;if(generation!==state.generation)refresh();}}
function openSchedule(s){$('scheduleForm').reset();$('scheduleId').value=s?.id||'';for(const [id,key]of [['scheduleFlight','flight'],['scheduleReg','registration'],['scheduleType','type'],['scheduleAirport','airport'],['scheduleSource','source'],['scheduleNote','note'],['scheduleCallsign','callsign']])$(id).value=s?.[key]||'';$('scheduleDirection').value=s?.direction||'arrival';const t=s?.time||Date.now()/1000;$('scheduleTime').value=new Date(t*1000+9*3600000).toISOString().slice(0,16);$('formMsg').textContent='';$('scheduleDialog').showModal();}
$('scheduleForm').addEventListener('submit',e=>{e.preventDefault();const s={id:$('scheduleId').value||crypto.randomUUID(),flight:C.norm($('scheduleFlight').value),direction:$('scheduleDirection').value,time:Date.parse($('scheduleTime').value+':00+09:00')/1000,callsign:C.norm($('scheduleCallsign').value),registration:C.norm($('scheduleReg').value),type:C.norm($('scheduleType').value),airport:$('scheduleAirport').value.trim(),source:$('scheduleSource').value.trim(),note:$('scheduleNote').value.trim()};if(!C.validSchedule(s)){ $('formMsg').textContent='편명과 한국시간 일시를 확인해 주세요.';return;}const next=[...schedules.filter(x=>x.id!==s.id),s];if(next.length>500){$('formMsg').textContent='최대 500개까지 저장할 수 있습니다.';return;}if(save('icn-schedules-v3',next)){schedules=next;$('scheduleDialog').close();render();}});
$('addScheduleBtn').addEventListener('click',()=>openSchedule());$('settingsBtn').addEventListener('click',()=>{$('watchTypes').value=watch.types.join(', ');$('watchRegs').value=watch.regs.join(', ');$('watchFlights').value=watch.flights.join(', ');$('settingsMsg').textContent='';$('settingsDialog').showModal();});$('settingsForm').addEventListener('submit',e=>{e.preventDefault();const next={types:C.list($('watchTypes').value),regs:C.list($('watchRegs').value),flights:C.list($('watchFlights').value)};if(save('icn-watch-v3',next)){watch=next;$('settingsDialog').close();render();}});
$('watchBtn').addEventListener('click',()=>{const p=livePlanes().find(p=>p.hex===state.selected);if(!p?.registration){message('등록번호가 없는 항공기입니다. 관심 기준에서 편명을 등록해 주세요.');return;}const next={...watch,regs:watch.regs.includes(p.registration)?watch.regs.filter(r=>r!==p.registration):[...watch.regs,p.registration]};if(save('icn-watch-v3',next)){watch=next;render();}});
$('exportBtn').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,schedules},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='ICN-special-schedules.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('importFile').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1000000)throw Error('1MB 이하 파일만 가져올 수 있습니다.');const d=JSON.parse(await f.text());if(d.version!==1||!Array.isArray(d.schedules)||d.schedules.length>500||!d.schedules.every(C.validSchedule))throw Error('일정 파일 형식을 확인해 주세요.');const map=new Map(schedules.map(s=>[s.id,s]));d.schedules.forEach(s=>map.set(s.id,s));const next=[...map.values()];if(next.length>500)throw Error('일정 500개 한도를 초과했습니다.');if(save('icn-schedules-v3',next)){schedules=next;$('settingsMsg').textContent=d.schedules.length+'개 일정을 가져왔습니다.';render();}}catch(err){$('settingsMsg').textContent=err.message;}finally{e.target.value='';}});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>{state.tab=b.dataset.tab;for(const x of document.querySelectorAll('[data-tab]')){x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));}renderBoard();});
$('search').addEventListener('input',renderBoard);$('runwayFilter').addEventListener('change',renderBoard);$('refreshBtn').addEventListener('click',refresh);$('demoBtn').addEventListener('click',()=>{state.demo=!state.demo;state.generation++;state.data=null;state.selected=null;$('demoBtn').textContent=state.demo?'실시간':'데모';render();refresh();});$('pauseBtn').addEventListener('click',()=>{state.paused=!state.paused;$('pauseBtn').textContent=state.paused?'재개':'일시정지';updateHeader();if(!state.paused)refresh();});$('zoomIn').addEventListener('click',()=>{state.zoom=Math.max(.35,state.zoom/1.4);drawMap();});$('zoomOut').addEventListener('click',()=>{state.zoom=Math.min(2.8,state.zoom*1.4);drawMap();});
setInterval(()=>{$('clock').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());if(state.data&&!state.demo&&!fresh())render();},1000);setInterval(()=>{if(!document.hidden)refresh();},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});render();refresh();
})();
