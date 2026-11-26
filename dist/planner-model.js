/* Weekly lessons are projected onto dates; no duplicate event records are saved. */
(function(root){
const colors=['sage','blue','amber','rose','violet','slate'];
const defaultCategories=()=>['학급 운영','수업 준비','보호자 연락','행정 업무','기타'].map((name,i)=>({id:'cat-'+i,name,color:colors[i]}));
const defaultPeriods=()=>[['09:00','09:40'],['09:50','10:30'],['10:40','11:20'],['11:30','12:10'],['13:00','13:40'],['13:50','14:30']].map(([start,end],i)=>({id:'period-'+(i+1),name:(i+1)+'교시',start,end}));
function normalize(data){
 if(!Array.isArray(data.categories)||!data.categories.length)data.categories=defaultCategories();
 for(const t of data.tasks){if(!data.categories.some(c=>c.name===t.category))data.categories.push({id:crypto.randomUUID(),name:t.category||'기타',color:'slate'});}
 if(!data.planner)data.planner={periods:defaultPeriods(),lessons:[],startDate:'',endDate:'',offDates:[],skips:[]};
 return data;
}
function datePlus(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function lessonsForDate(data,date,includeSkipped=false){
 const p=data.planner,weekday=new Date(date+'T12:00:00').getDay();
 if((p.startDate&&date<p.startDate)||(p.endDate&&date>p.endDate))return [];
 return p.lessons.filter(l=>l.day===weekday).flatMap(l=>{
 const period=p.periods.find(x=>x.id===l.periodId);if(!period)return [];
 const skipped=p.offDates.includes(date)||p.skips.includes(date+'|'+l.id);
 if(skipped&&!includeSkipped)return [];
 return [{id:l.id,title:l.subject,place:l.place,time:period.start,end:period.end,period:period.name,color:l.color,recurring:true,skipped,date}];
 });
}
function eventsForDate(data,date,includeSkipped=false){return [...data.events.filter(e=>e.date===date).map(e=>({...e,recurring:false})),...lessonsForDate(data,date,includeSkipped)].sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title,'ko'));}
function validateExtras(data){
 if(data.categories!==undefined&&(!Array.isArray(data.categories)||!data.categories.length||data.categories.some(c=>!c||typeof c.id!=='string'||typeof c.name!=='string'||!c.name.trim()||!colors.includes(c.color))||new Set(data.categories.map(c=>c.id)).size!==data.categories.length||new Set(data.categories.map(c=>c.name)).size!==data.categories.length))return false;
 if(data.planner===undefined)return true;
 const p=data.planner,dateOk=s=>typeof s==='string'&&(!s||/^\d{4}-\d{2}-\d{2}$/.test(s)),timeOk=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 if(!p||!Array.isArray(p.periods)||!p.periods.length||p.periods.length>12||!Array.isArray(p.lessons)||!dateOk(p.startDate)||!dateOk(p.endDate)||(p.startDate&&p.endDate&&p.endDate<p.startDate))return false;
 if(p.periods.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||!r.name.trim()||!timeOk(r.start)||!timeOk(r.end)||r.start>=r.end)||new Set(p.periods.map(r=>r.id)).size!==p.periods.length)return false;
 if(p.lessons.some(l=>!l||typeof l.id!=='string'||!Number.isInteger(l.day)||l.day<1||l.day>5||!p.periods.some(r=>r.id===l.periodId)||typeof l.subject!=='string'||!l.subject.trim()||typeof l.place!=='string'||!colors.includes(l.color))||new Set(p.lessons.map(l=>l.id)).size!==p.lessons.length||new Set(p.lessons.map(l=>l.day+'|'+l.periodId)).size!==p.lessons.length)return false;
 return Array.isArray(p.offDates)&&p.offDates.every(d=>dateOk(d)&&!!d)&&Array.isArray(p.skips)&&p.skips.every(s=>typeof s==='string');
}
root.Planner={colors,defaultCategories,defaultPeriods,normalize,datePlus,lessonsForDate,eventsForDate,validateExtras};
})(typeof globalThis!=='undefined'?globalThis:this);
