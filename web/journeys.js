const journeyForm=$('journey'),message=$('journeyMessage'),list=$('journeys');
const bookingUrl='https://www.irctc.co.in/nget/train-search';
$('travelDate').min=new Date(Date.now()+19800000).toISOString().slice(0,10);
$('kind').onchange=()=>{$('saveJourney').textContent=$('kind').value==='held'?'Save my ticket':'Save journey request';};
function node(tag,content){const el=document.createElement(tag);el.textContent=content;return el;}
function action(label,fn){const el=node('button',label);el.type='button';el.onclick=fn;return el;}
async function refreshJourneys(){
 try{
  const r=await fetch('/api/journeys');if(!r.ok)throw Error();
  const items=await r.json();
  const checks=new Map();
  if(items.some(item=>item.pnr)){
   try{
    const saved=await fetch('/api/pnr');
    if(saved.ok)for(const check of await saved.json())checks.set(check.pnr,check);
   }catch{/* The check form remains available if history cannot load. */}
  }
  list.replaceChildren();
  if(!items.length)list.append(node('p','Your saved tickets and route requests will appear here.'));
  for(const item of items){
   const row=node('article','');row.className='savedJourney';
   row.append(node('strong',item.from+' → '+item.to),node('p',item.date+' · '+(item.kind==='held'?'My ticket':'Journey request')));
   if(item.kind==='wanted'){
    const link=node('a','Check seats on IRCTC');link.href=bookingUrl;link.target='_blank';link.rel='noopener';
    row.append(node('p','Enter these stations and date on IRCTC to see live seats and book.'),link);
   }else row.append(ticketChecker(item,checks.get(item.pnr)));
   row.append(action('Remove',async e=>{
    const btn=e.currentTarget;btn.disabled=true;
    try{const r=await fetch('/api/journeys/'+item.id,{method:'DELETE'});if(!r.ok)throw Error();await refreshJourneys();}
    catch{btn.disabled=false;message.textContent='Could not remove this journey. Try again.';}
   }));
   list.append(row);
  }
 }catch{list.textContent='Could not load saved journeys. Refresh to try again.';}
}
journeyForm.onsubmit=async e=>{
 e.preventDefault();const btn=$('saveJourney');btn.disabled=true;
 try{
  const r=await fetch('/api/journeys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:$('kind').value,from:$('origin').value,to:$('destination').value,date:$('travelDate').value})});
  if(!r.ok){message.textContent=r.status===400?await r.text():'Could not save your journey. Try again.';return;}
  message.textContent=$('kind').value==='held'?'Ticket saved privately.':'Journey request saved. Check live availability on IRCTC below.';
  await refreshJourneys();
 }catch{message.textContent='Could not save your journey. Check your connection and retry.';}
 finally{btn.disabled=false;}
};
refreshJourneys();
function ticketChecker(item,lastCheck){
 const panel=node('section','');panel.className='inlinePnr';
 const title=node('h3','PNR status'),result=node('div',''),notice=node('p','');
 notice.setAttribute('role','status');
 const form=node('form',''),label=node('label','10-digit PNR'),input=document.createElement('input');
 input.inputMode='numeric';input.pattern='[0-9]{10}';input.maxLength=10;input.required=true;input.autocomplete='off';input.value=item.pnr||'';
 label.append(input);
 const check=node('button','Check automatically');
 const official=node('a','Check on Indian Railways');
 official.href='https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html';
 official.target='_blank';official.rel='noopener noreferrer';
 const manual=document.createElement('details');
 manual.append(node('summary','Save result from Indian Railways'));
 const statusLabel=node('label','Current status for each passenger, one per line');
 const statuses=document.createElement('textarea');statuses.rows=3;statuses.maxLength=971;
 statuses.placeholder='CNF\nRAC/2';
 statusLabel.append(statuses);
 const save=action('Save reported status',()=>{
  if(!input.reportValidity())return;
  const passengers=statuses.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!passengers.length){notice.textContent='Enter at least one passenger status.';statuses.focus();return;}
  submit('PUT',passengers);
 });
 manual.append(statusLabel,save);
 form.append(label,check);
 function render(record){
  lastCheck=record;
  result.replaceChildren();
  if(!record?.passengers?.length){result.append(node('p','No checked status available yet.'));return;}
  const allConfirmed=record.passengers.every(s=>/^(CNF|CONFIRMED)(?:$|[ /-])/i.test(s));
  result.append(node('strong',record.source==='manual'?'Reported passenger status':allConfirmed?'All passengers confirmed':'Last checked passenger status'));
  if(typeof record.chartPrepared==='boolean')result.append(node('p',record.chartPrepared?'Chart prepared':'Chart not yet prepared'));
  record.passengers.forEach((value,i)=>result.append(node('p','Passenger '+(i+1)+' · '+value)));
  result.append(node('p','PNR ending '+record.pnr.slice(-4)+' · '+(record.source==='manual'?'Entered by you':'API Mitra')+' · '+new Date(record.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST'));
 }
 render(lastCheck);
 form.onsubmit=e=>{e.preventDefault();submit('POST');};
 async function submit(method,passengers){
  const pnr=input.value;
  check.disabled=true;save.disabled=true;input.disabled=true;statuses.disabled=true;
  notice.textContent=method==='POST'?'Checking your ticket…':'Saving your reported status…';
  try{
   if(item.pnr!==pnr){
    const linked=await fetch('/api/journeys/'+item.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pnr})});
    if(!linked.ok)throw Error('Could not link this PNR. Refresh and try again.');
    item.pnr=pnr;render(null);
   }
   const response=await fetch('/api/pnr',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({pnr,passengers})});
   const data=await response.json();
   if(!response.ok)throw Error(data.message||'Live status unavailable.');
   render(data.ticket);notice.textContent=data.message;
   if(method==='PUT'){manual.open=false;statuses.value='';}
  }catch(error){notice.textContent=error.message;}
  finally{check.disabled=false;save.disabled=false;input.disabled=false;statuses.disabled=false;}
 }
 panel.append(title,result,form,node('p','Automatic lookup sends your PNR to API Mitra.'),official,manual,notice);
 const handover=action('Prepare family name-change request',()=>{
  $('check').reset();
  $('booking').reset();
  invalidate();
  $('from').value=item.from;
  $('to').value=item.to;
  $('pnr').value=item.pnr||'';
  $('train').value=lastCheck?.trainNumber||'';
  const note=$('handoverTicket');
  note.textContent='Saved journey for '+item.date+'. Select the current status of the passenger whose name you want to change.';
  if(lastCheck?.passengers?.length){
   const source=lastCheck.source==='manual'?'Reported statuses':'Last provider result';
   note.textContent+=' '+source+' ('+new Date(lastCheck.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST): '+lastCheck.passengers.join(', ')+'.';
  }
  note.hidden=false;
  $('handover').scrollIntoView();
  $('status').focus({preventScroll:true});
 });
 const wrapper=document.createDocumentFragment();
 wrapper.append(panel,handover);
 return wrapper;
}
