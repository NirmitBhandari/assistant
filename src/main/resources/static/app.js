const $ = (selector) => document.querySelector(selector);
let charts = {}, summary = null, readings = [], events = null, activeView = 'home', selectedAssessment = null, askHistory = [], pendingGoogleCredential = '', googleInitialized = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Not available';
const timeOnly = value => value ? new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '--';
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.add('show'); setTimeout(()=>node.classList.remove('show'),3500); }

async function api(url, options={}) {
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  if(!response.ok){let error={};try{error=await response.json()}catch{}if(response.status===401)showLogin();throw Error(error.message||`Request failed (${response.status})`)}
  return response.status===204?null:response.json();
}
function showLogin(){ $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); if(events)events.close(); configureLogin(); }
async function configureLogin(){
  try{
    const config=await api('/api/auth/google/config');
    $('#demoLoginFields').classList.toggle('hidden',!config.demo);$('#loginDivider').classList.toggle('hidden',!config.demo||!config.googleEnabled);
    $('#demoLoginHint').classList.toggle('hidden',!config.demo);
    if(!config.googleEnabled){$('#googleLoginBlock').classList.add('hidden');$('#googleSetupNotice').classList.remove('hidden');$('#googleSetupNotice').textContent='Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID to your local .env file to enable it.';return}
    $('#googleSetupNotice').classList.add('hidden');$('#googleLoginBlock').classList.remove('hidden');
    if(googleInitialized)return;
    const render=()=>{if(!window.google?.accounts?.id)return;google.accounts.id.initialize({client_id:config.googleClientId,callback:handleGoogleCredential,auto_select:false});google.accounts.id.renderButton($('#googleButton'),{theme:'outline',size:'large',shape:'rectangular',text:'continue_with',width:314});googleInitialized=true};
    if(window.google?.accounts?.id){render();return}
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.onload=render;script.onerror=()=>{$('#googleLoginError').textContent='Google sign-in could not load. Check your connection and try again.'};document.head.append(script);
  }catch(error){if(!error.message.includes('401'))$('#loginError').textContent='Login options could not be loaded. Refresh and try again.'}
}
async function handleGoogleCredential(response){pendingGoogleCredential=response.credential;await sendGoogleCredential(null)}
async function sendGoogleCredential(age){
  $('#googleLoginError').textContent='';
  try{
    const response=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:pendingGoogleCredential,age})});let result={};try{result=await response.json()}catch{}
    if(response.status===428&&result.profileRequired){$('#googleProfileSetup').classList.remove('hidden');$('#googleAge').focus();$('#googleLoginError').textContent=`Welcome, ${result.name}. Enter your age to create your profile.`;return}
    if(!response.ok)throw Error(result.message||`Google sign-in failed (${response.status})`);
    pendingGoogleCredential='';$('#googleProfileSetup').classList.add('hidden');window.currentPatientId=result.patientId;showApp();
  }catch(error){$('#googleLoginError').textContent=error.message}
}
$('#completeGoogleSignup').addEventListener('click',()=>{const age=Number($('#googleAge').value);if(!Number.isInteger(age)||age<1||age>120){$('#googleLoginError').textContent='Enter an age between 1 and 120.';return}sendGoogleCredential(age)});
function showApp(){
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#today').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  const requested=location.hash.slice(1); go(['home','medications','monitor','risk','insights','ask','profile'].includes(requested)?requested:'home');
  refresh(); connectEvents();
}
function go(view){
  activeView=view;const home=view==='home';
  document.querySelectorAll('[data-view]').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
  document.querySelectorAll('.home-only').forEach(node=>node.classList.toggle('hidden',!home));
  document.querySelectorAll('.page-section').forEach(node=>node.classList.add('hidden'));
  if(!home)$('#page-'+view)?.classList.remove('hidden');
  const titles={home:`Good day, ${summary?.name||'there'}`,medications:'Medications',monitor:'Health monitor',risk:'Risk assessment',insights:'Health insights',ask:'Ask Wellnest',profile:'Profile'};
  const subtitles={home:'Your readings, medicines, and follow-up reminders.',medications:'Your saved medicines and their schedules.',monitor:'Record readings and review each trend clearly.',risk:'A screening signal based on the readings collected so far.',insights:'Patterns to verify and discuss with a health professional.',ask:'Explore health questions with clear, cautious guidance.',profile:'Account, browser reminder, and report settings.'};
  $('#pageTitle').textContent=titles[view]||titles.home;$('#pageSubtitle').textContent=subtitles[view]||subtitles.home;
  if(view==='monitor')renderMonitor();if(view==='risk')renderRisk();if(view==='insights')renderInsights();if(view==='profile')$('#profileName').textContent=summary?.name||'Patient';
  if(view==='ask')$('#askInput').focus({preventScroll:true});
}
document.querySelectorAll('[data-view]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();go(a.dataset.view);history.replaceState(null,'','#'+a.dataset.view)}));
document.addEventListener('click',e=>{const button=e.target.closest('[data-open]');if(!button)return;go(button.dataset.open);history.replaceState(null,'','#'+button.dataset.open)});

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{const user=await api('/api/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});window.currentPatientId=user.patientId;showApp()}catch(error){$('#loginError').textContent=error.message}});
$('#logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST'});showLogin()}catch(e){toast(e.message)}};

async function refresh(){
  try{
    const [data,trend]=await Promise.all([api('/api/dashboard/summary'),api('/api/sensor-data?days=7')]);
    summary=data;readings=trend||[];selectedAssessment=null;
    const user=data.name||'Patient';$('#sideName').textContent=user;$('#profileName').textContent=user;
    $('#avatar').textContent=$('#headerAvatar').textContent=user[0];$('#mode').textContent=data.liveAI?'Live AI':'Demo Data';document.getElementById('askMode').textContent=data.liveChatAI?'Nemotron AI':'Nemotron unavailable';document.getElementById('askModeNote').textContent=data.liveChatAI?'Your question and recent chat context go to Nemotron. Readings are optional.':'The NVIDIA key is missing. Add it to the local .env file and restart to enable open-ended answers.';
    const reading=data.reading||{};$('#heartRate').textContent=reading.heartRate??'--';$('#spo2').textContent=reading.spo2??'--';
    $('#heartRateTime').textContent=reading.timestamp?`Updated ${dateTime(reading.timestamp)}`:'No reading yet';$('#spo2Time').textContent=reading.timestamp?`Updated ${dateTime(reading.timestamp)}`:'No reading yet';
    const risk=data.risk||{};$('#riskScore').textContent=readings.length?(risk.riskScore??'--'):'--';const pill=$('#riskPill');pill.textContent=readings.length&&risk.riskLevel?`${risk.riskLevel} signal`:'Awaiting reading';pill.className='risk-pill '+(readings.length?(risk.riskLevel||'low').toLowerCase():'low');
    $('#medProgress').textContent=(data.medicines||[]).length;renderMeds(data.medicines||[]);renderReminders(data.reminders||[]);renderHomeInsight();renderHomeChart();
    if(activeView==='medications')renderAllMeds(data.medicines||[]);if(activeView==='monitor')renderMonitor();if(activeView==='risk')renderRisk();if(activeView==='insights')renderInsights();
  }catch(error){toast(error.message)}
}

function medicineMarkup(m){return `<div class="medicine-row"><span class="medicine-icon">MED</span><div><b>${esc(m.name)}</b><small>${esc(m.dosage||'As prescribed')} | ${esc(m.frequency||'Daily')}${m.instructions?' | '+esc(m.instructions):''}</small></div><button data-delete="${m.id}" title="Remove medicine" aria-label="Remove ${esc(m.name)}">Remove</button></div>`}
function bindDelete(){document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{try{await api('/api/medicines/'+button.dataset.delete,{method:'DELETE'});toast('Medicine removed');await refresh()}catch(error){toast(error.message)}})}
function renderMeds(medicines){$('#medicineList').innerHTML=medicines.length?medicines.map(medicineMarkup).join(''):'<div class="empty-state"><b>No medicines saved</b><p>Add a medicine and set a reminder time.</p></div>';bindDelete()}
function renderAllMeds(medicines){$('#allMedicineList').innerHTML=medicines.length?medicines.map(medicineMarkup).join(''):'<div class="empty-state"><b>No medicines saved</b><p>Add a medicine to start your schedule.</p></div>';bindDelete()}
function renderReminders(reminders){
  $('#reminderList').innerHTML=reminders.length?reminders.slice(0,6).map(r=>`<div class="reminder-item"><span class="reminder-time">${timeOnly(r.time)}</span><span class="reminder-symbol">RX</span><span class="reminder-info"><b>${esc(r.medicine)}</b><small>${dateTime(r.time)} | ${esc(r.status.toLowerCase())}</small></span>${r.status==='SENT'?`<button class="outline" data-ack="${r.id}">Taken</button>`:''}</div>`).join(''):'<div class="empty-state"><b>No upcoming reminders</b><p>Add a medicine with a reminder time.</p></div>';
  document.querySelectorAll('[data-ack]').forEach(b=>b.onclick=async()=>{try{await api(`/api/reminders/${b.dataset.ack}/ack`,{method:'POST'});toast('Reminder marked as taken');await refresh()}catch(e){toast(e.message)}});
}

function chartBase(){return {responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{enabled:true}},scales:{x:{grid:{display:false},ticks:{color:'#89857c',maxTicksLimit:6,maxRotation:0,font:{size:10}}}}}}
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id]}}
function noChart(canvasId,message){const canvas=$('#'+canvasId);if(!canvas)return;canvas.style.display='none';let note=canvas.parentElement.querySelector('.chart-empty');if(!note){note=document.createElement('div');note.className='empty-state chart-empty';canvas.parentElement.appendChild(note)}note.textContent=message;note.classList.remove('hidden')}
function renderHomeChart(){
  if(!window.Chart){noChart('chart','Chart library is unavailable. Readings are still listed below in Health Monitor.');return}
  destroyChart('home');if(!readings.length){noChart('chart','Save a reading to start your heart-rate trend.');return}$('#chart').style.display='block';const note=$('#chart').parentElement.querySelector('.chart-empty');if(note)note.classList.add('hidden');
  const daily=new Map();for(const row of readings){const day=new Date(row.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'});const bucket=daily.get(day)||{total:0,count:0};bucket.total+=row.heartRate;bucket.count++;daily.set(day,bucket)}const labels=[...daily.keys()],values=[...daily.values()].map(x=>Math.round(x.total/x.count));
  $('#homeTrendNote').textContent=`Daily average from ${readings.length} readings`;
  charts.home=new Chart($('#chart'),{type:'line',data:{labels,datasets:[{label:'Average heart rate',data:values,borderColor:'#a88d6b',backgroundColor:'rgba(168,141,107,.10)',fill:true,tension:.32,pointRadius:3,borderWidth:2}]},options:{...chartBase(),scales:{...chartBase().scales,y:{min:40,max:150,grid:{color:'#efede7'},ticks:{color:'#89857c'}}}}});
}
function selectedReadings(){const days=Number($('#trendRange')?.value||7);const cutoff=Date.now()-days*86400000;return readings.filter(r=>new Date(r.timestamp).getTime()>=cutoff).slice(-100)}
function lineChart(id,canvasId,rows,datasets,axis){
  if(!window.Chart){noChart(canvasId,'Charts are unavailable. Recorded values remain listed below.');return}
  destroyChart(id);const canvas=$('#'+canvasId);if(!rows.length){noChart(canvasId,'No readings in this date range.');return}
  canvas.style.display='block';const note=canvas.parentElement.querySelector('.chart-empty');if(note)note.classList.add('hidden');
  const labels=rows.map(r=>Number($('#trendRange').value)===1?timeOnly(r.timestamp):new Date(r.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'}));
  charts[id]=new Chart(canvas,{type:'line',data:{labels,datasets},options:{...chartBase(),scales:{...chartBase().scales,y:axis}}});
}
function renderMonitor(){
  const rows=selectedReadings();const latest=rows.at(-1);$('#monitorSummary').innerHTML=latest?`<div><b>${rows.length}</b><span>readings in selected period</span></div><div><b>${latest.heartRate} bpm</b><span>latest heart rate</span></div><div><b>${latest.systolicBP}/${latest.diastolicBP}</b><span>latest blood pressure</span></div><div><b>${latest.spo2}%</b><span>latest SpO2</span></div>`:'<p class="muted">No readings in this period. Save a reading above to begin.</p>';
  lineChart('hr','monitorHeartChart',rows,[{label:'Heart rate (bpm)',data:rows.map(r=>r.heartRate),borderColor:'#a88d6b',backgroundColor:'rgba(168,141,107,.08)',fill:true,tension:.28,pointRadius:2,borderWidth:2}],{min:40,max:150,grid:{color:'#efede7'},ticks:{color:'#89857c'}});
  lineChart('bp','monitorBpChart',rows,[{label:'Systolic',data:rows.map(r=>r.systolicBP),borderColor:'#ad7468',tension:.28,pointRadius:2,borderWidth:2},{label:'Diastolic',data:rows.map(r=>r.diastolicBP),borderColor:'#81949a',tension:.28,pointRadius:2,borderWidth:2}],{min:50,max:210,grid:{color:'#efede7'},ticks:{color:'#89857c'}});
  lineChart('o2','monitorOxygenChart',rows,[{label:'SpO2 (%)',data:rows.map(r=>r.spo2),borderColor:'#718e79',backgroundColor:'rgba(113,142,121,.08)',fill:true,tension:.28,pointRadius:2,borderWidth:2}],{min:80,max:100,grid:{color:'#efede7'},ticks:{color:'#89857c',callback:v=>`${v}%`}});
  $('#readingList').innerHTML=rows.length?rows.slice(-12).reverse().map(r=>`<div class="reading-row"><div><b>${r.heartRate} bpm</b><small>Heart rate</small></div><div><b>${r.systolicBP}/${r.diastolicBP}</b><small>Blood pressure</small></div><div><b>${r.spo2}%</b><small>SpO2</small></div><div><b>${esc(sourceKind(r.source))}</b><small>Reading source</small></div><time>${dateTime(r.timestamp)}</time></div>`).join(''):'<div class="empty-state">No readings available yet.</div>';
}
$('#trendRange').addEventListener('change',renderMonitor);

const promptChips=document.querySelectorAll('.prompt-chip');
function renderAssistantMarkdown(target,source){
  const lines=String(source??'').replace(/\r/g,'').split('\n');let list=null,table=null;
  const flushList=()=>{if(!list)return;target.append(list);list=null};
  const flushTable=()=>{if(!table)return;const t=document.createElement('table');t.className='chat-table';table.forEach((cells,i)=>{if(i===1&&cells.every(c=>/^:?-{3,}:?$/.test(c)))return;const tr=document.createElement('tr');cells.forEach(value=>{const cell=document.createElement(i===0?'th':'td');cell.append(renderInlineMarkdown(value));tr.append(cell)});t.append(tr)});target.append(t);table=null};
  const inline=(text)=>{const frag=document.createDocumentFragment(),re=/\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;let at=0,m;while((m=re.exec(text))){frag.append(document.createTextNode(text.slice(at,m.index)));const el=document.createElement(m[1]?'strong':m[2]?'em':'code');el.textContent=m[1]||m[2]||m[3];frag.append(el);at=re.lastIndex}frag.append(document.createTextNode(text.slice(at)));return frag};
  function renderInlineMarkdown(text){return inline(text)}
  for(const raw of lines){const line=raw.trim();const cells=line.startsWith('|')&&line.endsWith('|')?line.slice(1,-1).split('|').map(c=>c.trim()):null;if(cells){flushList();if(!table)table=[];table.push(cells);continue}flushTable();if(!line){flushList();continue}const heading=line.match(/^(#{1,3})\s+(.+)$/);if(heading){flushList();const h=document.createElement(`h${Math.min(heading[1].length+2,5)}`);h.append(inline(heading[2]));target.append(h);continue}const item=line.match(/^[-*]\s+(.+)$/);if(item){if(!list)list=document.createElement('ul');const li=document.createElement('li');li.append(inline(item[1]));list.append(li);continue}flushList();const p=document.createElement('p');p.append(inline(line));target.append(p)}flushList();flushTable();
}
function addChatMessage(role,text){const bubble=document.createElement('div');bubble.className=`chat-bubble ${role}`;const label=document.createElement('b');label.textContent=role==='user'?'You':'Wellnest';bubble.append(label);if(role==='assistant')renderAssistantMarkdown(bubble,text);else{const body=document.createElement('p');body.textContent=text;bubble.append(body)}$('#chatMessages').append(bubble);$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight}
function askLocal(question){
  const q=question.toLowerCase().trim();const rows=readings;const latest=rows.at(-1);const analysis=deriveSignals(rows);const isDemo=rows.some(r=>/spike|simulat|demo|seed/i.test(String(r.source||'')));
  if(/^(hi|hello|hey|good morning|good afternoon|good evening|how are you|how are you\?)\b/.test(q))return "Hi! I'm here to help you understand health information and your saved readings. What would you like to know?";
  if(/emergency|urgent|chest pain|can't breathe|cannot breathe|trouble breathing|stroke|face droop|faint|unconscious|severe bleeding/.test(q))return 'If this is happening now, contact your local emergency number or seek urgent care. Chest pain, difficulty breathing, fainting, stroke symptoms, or rapidly worsening symptoms should not wait for an online answer. I cannot assess emergencies through chat.';
  if(/my (latest )?(reading|readings|vitals)|my data|my health|what do my|based on my|my result|what does (this|that|the) (reading|result|number)|explain (this|that|the) (reading|result|number)|what does this say|what do these numbers mean/.test(q)){
    if(!latest)return 'There are no readings saved yet, so I cannot summarize your data. Open Health Monitor to record a measurement, then ask me again.';
    const source=isDemo?' Some history is seeded or simulated demo data, so those entries are not real clinical measurements.':'';
    return `Your latest saved entry is heart rate ${latest.heartRate} bpm, blood pressure ${latest.systolicBP}/${latest.diastolicBP} mmHg, and oxygen ${latest.spo2}%. ${analysis.signals.map(s=>s.title+': '+s.detail).join(' ')}${source} These values alone cannot establish or rule out a disease. If readings remain unusual or you have symptoms, share the log with a clinician; they can decide whether a repeat measurement, examination, or tests are appropriate.`;
  }
  if(/blood pressure|hypertension|high bp/.test(q))return 'Blood pressure is the force of blood against artery walls. A pattern of elevated measurements can be a reason to discuss hypertension risk with a clinician, but one reading cannot diagnose it. Rest quietly, use a correctly fitted validated cuff, and record repeat readings. A clinician can confirm the pattern and discuss whether further evaluation is appropriate.';
  if(/oxygen|spo2|pulse ox|shortness of breath/.test(q))return 'A pulse oximeter estimates oxygen saturation and can be affected by movement, cold fingers, circulation, skin factors, and device quality. Recheck with a warm, still hand and consider how you feel. Persistently low readings or breathing symptoms merit prompt medical advice; severe breathing difficulty needs emergency care.';
  if(/heart rate|pulse|heartbeat/.test(q))return 'Heart rate changes with activity, stress, fever, medicines, and other factors. For adults at rest, a commonly cited range is 60-100 bpm, but a number outside it does not identify a disease by itself. Measure after resting and discuss a repeated unusual rate or symptoms with a clinician.';
  if(/disease|contract|develop|risk|what condition|what illness/.test(q))return `I cannot predict what disease you will contract or diagnose you. Health risks depend on symptoms, history, examination, and appropriate tests, not just the vitals recorded here. ${rows.length?`Your current screening summary says: ${analysis.signals.map(s=>s.title).join('; ')}. `:''}I can help explain a specific measurement or prepare questions for a clinician.`;
  if(/doctor|clinician|ask|check|test|appointment/.test(q))return `You could ask: "Are these readings reliable and should we repeat them?" "Do this pattern and my symptoms need an examination or tests?" and "What symptoms should prompt urgent care?" Bring the reading log, dates, measurement conditions, medicines, and symptoms. ${rows.length?`Your current summary highlights: ${analysis.signals.map(s=>s.title).join('; ')}.`:''}`;
  return 'I received your question, but Demo Guide mode only has local guidance for common health topics and readings. Nemotron is not connected in this run, so I cannot give a reliable answer to this topic yet. Try asking about your readings, blood pressure, heart rate, oxygen, or what to discuss with a clinician.';
}
async function submitQuestion(question){const clean=question.trim();if(!clean)return;$('#askInput').value='';addChatMessage('user',clean);askHistory.push({role:'user',text:clean});const submit=$('#askSubmit');submit.disabled=true;submit.textContent='Thinking...';$('#chatMessages').classList.add('is-thinking');let answer;try{if(summary?.liveChatAI){const prior=askHistory.slice(0,-1).slice(-8);const result=await api('/api/ask',{method:'POST',body:JSON.stringify({question:clean,history:prior,includeReadings:document.getElementById("includeReadings").checked})});answer=result.answer}else{await new Promise(resolve=>setTimeout(resolve,260));answer=askLocal(clean)}}catch(error){answer=`I could not get an answer right now: ${error.message}. Please try again in a moment.`}askHistory.push({role:'assistant',text:answer});addChatMessage('assistant',answer);$('#chatMessages').classList.remove('is-thinking');submit.disabled=false;submit.textContent='Ask';$('#askInput').focus()}
$('#askForm').addEventListener('submit',e=>{e.preventDefault();submitQuestion($('#askInput').value)});
promptChips.forEach(button=>button.addEventListener('click',()=>submitQuestion(button.textContent)));

function sourceKind(value){const source=String(value||'Unknown');if(/spike|simulat|demo/i.test(source))return 'demo/simulated';if(/seed/i.test(source))return 'seeded sample';if(/manual/i.test(source))return 'user-entered';return source}
function sourceSummary(rows){const groups={};for(const row of rows){const kind=sourceKind(row.source);groups[kind]=(groups[kind]||0)+1}return Object.entries(groups).map(([name,count])=>`${name}: ${count}`).join(' | ')||'No source data'}
function demoQualifier(rows){const count=rows.filter(r=>/spike|simulat|demo|seed/i.test(String(r.source||''))).length;return count?` ${count} of these are demo, simulated, or seeded values, not clinical measurements.`:''}
function deriveSignals(rows){
  if(!rows.length)return {signals:[{level:'watch',title:'No readings available to assess yet',detail:'Record several measurements over time. A health signal needs data and cannot be inferred from an empty record.'}],actions:['Open Health Monitor, enter a reading, and continue tracking measurements in similar conditions.'],counts:{}};
  const bpStage1=rows.filter(r=>r.systolicBP>=130||r.diastolicBP>=80);
  const bpStage2=rows.filter(r=>r.systolicBP>=140||r.diastolicBP>=90);
  const highBP=rows.filter(r=>r.systolicBP>180||r.diastolicBP>120);
  const lowO2=rows.filter(r=>r.spo2<=92),veryLowO2=rows.filter(r=>r.spo2<=88),below95=rows.filter(r=>r.spo2<95);
  const outsideRestingHr=rows.filter(r=>r.heartRate<60||r.heartRate>100);
  const signals=[],actions=[];
  if(highBP.length){signals.push({level:'high',title:'Very high blood-pressure reading to repeat',detail:`${highBP.length} recorded value${highBP.length===1?'':'s'} exceeded 180 systolic or 120 diastolic. A single reading does not diagnose a condition.${demoQualifier(highBP)}`});actions.push('Sit quietly and repeat the blood-pressure measurement. If it remains above 180 systolic or 120 diastolic, contact a health professional promptly. If there is chest pain, trouble breathing, weakness, vision change, or difficulty speaking, seek emergency care.');}
  else if(bpStage2.length>=2){signals.push({level:'high',title:'Repeated blood pressure in a higher range',detail:`${bpStage2.length} of ${rows.length} readings were at least 140 systolic or 90 diastolic. Discuss the pattern with a clinician; this is not a diagnosis.${demoQualifier(bpStage2)}`});actions.push('Ask a clinician to review repeated blood-pressure readings. They may confirm measurements with a validated cuff and decide whether further evaluation is appropriate.');}
  else if(bpStage1.length>=2){signals.push({level:'medium',title:'Blood-pressure readings to keep checking',detail:`${bpStage1.length} of ${rows.length} readings were at least 130 systolic or 80 diastolic. Repeated readings matter more than one measurement.${demoQualifier(bpStage1)}`});actions.push('Take repeat measurements at rest over the next several days and share the log with your clinician if these values continue.');}
  else if(bpStage1.length===1){signals.push({level:'watch',title:'One blood-pressure reading was above the usual target range',detail:`The latest set includes ${bpStage1[0].systolicBP}/${bpStage1[0].diastolicBP} mmHg. One reading alone is not enough to identify a pattern.${demoQualifier(bpStage1)}`});actions.push('Repeat the reading after sitting quietly and track whether similar values appear again.');}
  if(veryLowO2.length){signals.push({level:'high',title:'Very low oxygen reading to verify',detail:`${veryLowO2.length} reading${veryLowO2.length===1?'':'s'} were 88% or lower. Pulse oximeters can be inaccurate; symptoms and repeat readings matter.${demoQualifier(veryLowO2)}`});actions.push('Repeat the measurement with a warm, still finger. If it remains 88% or lower, seek immediate medical attention.');}
  else if(lowO2.length){signals.push({level:'high',title:'Low oxygen reading to verify',detail:`${lowO2.length} reading${lowO2.length===1?'':'s'} were 92% or lower. Home pulse-ox readings can vary.${demoQualifier(lowO2)}`});actions.push('Repeat the measurement with a warm, still finger and contact a health professional if it remains 92% or lower.');}
  else if(below95.length>=3){signals.push({level:'medium',title:'Oxygen readings are often below 95%',detail:`${below95.length} of ${rows.length} readings were below 95%. Device readings can vary by several points.${demoQualifier(below95)}`});actions.push('Repeat a few readings and show the trend to your clinician, especially if you feel short of breath or unwell.');}
  if(outsideRestingHr.length>=3){signals.push({level:'medium',title:'Heart-rate readings often fall outside the adult resting range',detail:`${outsideRestingHr.length} of ${rows.length} readings were outside 60-100 bpm. This comparison is useful only for measurements taken at rest; activity, medicines, and other factors affect pulse.${demoQualifier(outsideRestingHr)}`});actions.push('If these values were measured while resting, keep a short log and ask your clinician whether they need review. Seek urgent help for severe symptoms such as fainting, chest pain, or trouble breathing.');}
  else if(outsideRestingHr.length){signals.push({level:'watch',title:'Some heart-rate readings were outside the adult resting range',detail:`${outsideRestingHr.length} reading${outsideRestingHr.length===1?'':'s'} were outside 60-100 bpm. Exercise and other factors can raise or lower pulse.${demoQualifier(outsideRestingHr)}`});actions.push('If concerned, repeat after resting and compare several measurements rather than relying on one value.');}
  if(!signals.length){signals.push({level:'low',title:'No repeated threshold pattern found in these readings',detail:`Reviewed ${rows.length} readings. This does not rule out health conditions or replace a clinical check.${demoQualifier(rows)}`});actions.push('Continue recording readings in similar conditions. Discuss symptoms or concerns with a qualified health professional.');}
  return {signals,actions,counts:{bpStage1:bpStage1.length,bpStage2:bpStage2.length,lowO2:lowO2.length,below95:below95.length,outsideRestingHr:outsideRestingHr.length,veryLowO2:veryLowO2.length,highBP:highBP.length}};
}
function readingTiles(row){return row?`<div class="vital-tile"><span>Heart rate</span><b>${row.heartRate} <small>bpm</small></b><small>${dateTime(row.timestamp)}</small></div><div class="vital-tile"><span>Blood pressure</span><b>${row.systolicBP}/${row.diastolicBP} <small>mmHg</small></b><small>Latest recorded value</small></div><div class="vital-tile"><span>Blood oxygen</span><b>${row.spo2}<small>%</small></b><small>Latest recorded value</small></div><div class="vital-tile source-tile"><span>Reading source</span><b>${esc(sourceKind(row.source))}</b><small>Check whether it was simulated or measured.</small></div>`:'<div class="empty-state">No reading is available yet. Open Health Monitor and record one.</div>'}
function renderRisk(){
  const risk=selectedAssessment||summary?.risk||{};const latest=readings.at(-1);const analysis=deriveSignals(readings);const hasData=readings.length>0;
  $('#riskDetails').innerHTML=`<div class="risk-hero"><div><span class="risk-pill ${(hasData?(risk.riskLevel||'low'):'low').toLowerCase()}">${hasData?esc(risk.riskLevel||'No assessment'):'Not assessed'} signal</span><h3>${hasData?esc(risk.riskScore??'--'):'--'}<small> / 100 signal score</small></h3><p>This score is a screening indicator, not a percentage chance of disease.</p></div><div class="risk-hero-note"><b>Latest reading</b><span>${dateTime(latest?.timestamp)}</span><span>${readings.length} readings reviewed</span></div></div><div class="risk-reading-grid">${readingTiles(latest)}</div><div class="risk-section"><div class="section-heading"><div><h3>Signals to review</h3><p class="muted">Patterns from recorded measurements; not a diagnosis.</p></div></div><div class="signal-list">${analysis.signals.map(s=>`<article class="signal-card ${s.level}"><span class="signal-tag">${s.level==='high'?'CHECK PROMPTLY':s.level==='medium'?'DISCUSS':'OBSERVE'}</span><h4>${esc(s.title)}</h4><p>${esc(s.detail)}</p></article>`).join('')}</div></div><div class="risk-section followup-panel"><h3>Suggested checks</h3><ol class="action-list">${analysis.actions.map(a=>`<li>${esc(a)}</li>`).join('')}</ol>${!hasData?'<button class="outline" data-open="monitor">Record your first reading</button>':''}</div><p class="disclaimer">Educational tool only. It cannot diagnose heart disease. A clinician interprets readings alongside symptoms, history, examination, and appropriate tests.</p>`;
}
function renderInsights(){
  const latest=readings.at(-1);const analysis=deriveSignals(readings);const risk=summary?.risk||{};const hasData=readings.length>0;
  $('#insightReadings').innerHTML=`<div class="insight-summary-head"><div><span class="eyebrow">DATA WINDOW</span><h3>Last 7 days</h3><p>${readings.length} recorded reading${readings.length===1?'':'s'} | Latest: ${dateTime(latest?.timestamp)}</p><p class="source-summary"><b>Sources:</b> ${esc(sourceSummary(readings))}</p></div><span class="risk-pill ${(hasData?(risk.riskLevel||'low'):'low').toLowerCase()}">${hasData?esc(risk.riskLevel||'No assessment'):'Not assessed'} signal</span></div><div class="risk-reading-grid">${readingTiles(latest)}</div><p class="data-provenance">Demo and seeded values are test data. Do not interpret simulated readings as measurements from a real person.</p>`;
  $('#insightSignals').innerHTML=analysis.signals.map(s=>`<article class="signal-card ${s.level}"><span class="signal-tag">${s.level==='high'?'FOLLOW UP':s.level==='medium'?'PATTERN':'INFORMATION'}</span><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p></article>`).join('');
  $('#insightActions').innerHTML=analysis.actions.map((a,i)=>`<div class="action-item"><span>${i+1}</span><p>${esc(a)}</p></div>`).join('');
}
function renderHomeInsight(){
  const analysis=deriveSignals(readings);const first=analysis.signals[0];
  $('#guidance').textContent=first?first.title:'Record readings to see possible patterns.';
  $('#tips').innerHTML=first?`<li>${esc(first.detail)}</li>`:'<li>Use Health Monitor to save a reading.</li>';
}

$('#spike').onclick=async()=>{try{const result=await api('/api/demo/spike',{method:'POST'});toast(`Abnormal reading saved. ${result.result.riskLevel} signal.`);await refresh();go('risk')}catch(e){toast(e.message)}};
$('#reminderNow').onclick=async()=>{try{await api('/api/demo/reminder-now',{method:'POST'});toast('Demo reminder scheduled. Keep this page open for its alert.');setTimeout(refresh,6000)}catch(e){toast(e.message)}};
function openMedicineDialog(){const input=$('#medicineForm [name=reminderTime]');const next=new Date(Date.now()+10*60000);input.value=`${String(next.getHours()).padStart(2,'0')}:${String(next.getMinutes()).padStart(2,'0')}`;$('#medicineDialog').showModal()}
$('#addMedicine').onclick=openMedicineDialog;document.querySelectorAll('.add-medicine-page').forEach(b=>b.onclick=openMedicineDialog);
$('#medicineForm').addEventListener('submit',async e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const form=Object.fromEntries(new FormData(e.target));form.startDate=new Date().toISOString().slice(0,10);const end=new Date();end.setMonth(end.getMonth()+3);form.endDate=end.toISOString().slice(0,10);try{const saved=await api('/api/medicines',{method:'POST',body:JSON.stringify(form)});$('#medicineDialog').close();e.target.reset();toast(`${saved.name} added. Reminder set for ${timeOnly(saved.reminderTime)}.`);await refresh();go('medications')}catch(error){toast(error.message)}});
$('#readingForm').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));for(const k of ['heartRate','systolicBP','diastolicBP','spo2'])values[k]=Number(values[k]);try{const result=await api('/api/sensor-data',{method:'POST',body:JSON.stringify(values)});toast(`Reading saved. ${result.result.riskLevel} signal.`);await refresh();go('risk')}catch(error){toast(error.message)}});
$('#assessLatest').onclick=async()=>{try{const reading=summary?.reading;if(!reading?.heartRate)throw Error('Save a health reading first.');selectedAssessment=await api('/api/risk-assessment',{method:'POST',body:JSON.stringify(reading)});renderRisk();toast('Latest reading reassessed')}catch(e){toast(e.message)}};
$('#enableNotifications').onclick=async()=>{if(!('Notification'in window)){toast('This browser does not support browser notifications.');return}const permission=await Notification.requestPermission();toast(permission==='granted'?'Browser reminders enabled':'Browser notifications were not enabled')};
$('#exportReport').onclick=()=>{if(!window.currentPatientId){toast('Sign in again to export your report.');return}window.location.href=`/api/export/${window.currentPatientId}`};
function notify(title,body){toast(`${title}: ${body}`);if('Notification'in window&&Notification.permission==='granted')new Notification(title,{body})}
function connectEvents(){if(events)events.close();events=new EventSource('/api/events');events.addEventListener('reading',()=>refresh());events.addEventListener('reminder',e=>{const data=JSON.parse(e.data);notify('Medicine reminder',`Time to take ${data.name}`);refresh()});events.addEventListener('risk',e=>{const data=JSON.parse(e.data);refresh();if(data.riskLevel==='HIGH'||data.riskLevel==='MEDIUM')notify('Health signal',`${data.riskLevel} result is ready to review`)});events.onerror=()=>{events.close();setTimeout(()=>{if(!$('#app').classList.contains('hidden'))connectEvents()},6000)}}

(async()=>{try{const user=await api('/api/auth/me');window.currentPatientId=user.patientId;showApp()}catch{showLogin()}})();
