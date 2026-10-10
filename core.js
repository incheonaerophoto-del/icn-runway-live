(function(root){'use strict';
const norm=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'');
const list=v=>Array.from(new Set(String(v||'').split(',').map(norm).filter(Boolean))).slice(0,100);
function validSchedule(s){return s&&typeof s.id==='string'&&s.id.length<80&&typeof s.flight==='string'&&s.flight.length>0&&s.flight.length<=20&&['arrival','departure'].includes(s.direction)&&Number.isFinite(s.time)&&s.time>=946684800&&s.time<4102444800&&['callsign','registration','type','airport','source','note'].every(k=>s[k]==null||(typeof s[k]==='string'&&s[k].length<=200));}
function matches(p,s){return !!((s.registration&&norm(p.registration)===norm(s.registration))||(s.callsign&&norm(p.flight)===norm(s.callsign))||norm(p.flight)===norm(s.flight));}
function reasons(p,w,schedules){const result=[];if(w.types.includes(norm(p.type)))result.push('관심 기종');if(w.regs.includes(norm(p.registration)))result.push('관심 등록번호');if(w.flights.includes(norm(p.flight)))result.push('관심 편명');if(schedules.some(s=>matches(p,s)))result.push('등록한 특별편');return result;}
function byTime(a,b){return (a.time??Infinity)-(b.time??Infinity)||String(a.flight).localeCompare(String(b.flight));}
const api={norm,list,validSchedule,matches,reasons,byTime};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ICNCore=api;
})(typeof window!=='undefined'?window:globalThis);
