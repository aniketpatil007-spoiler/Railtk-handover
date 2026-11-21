const form=document.querySelector('#lookup'),records=document.querySelector('#records'),feedback=document.querySelector('#feedback');
const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
let busy=false;
function action(label,callback){
 const button=element('button',label);button.onclick=callback;return button;
}
async function loadTickets(){
 const response=await fetch('/api/pnr');if(!response.ok)throw Error();
 const tickets=await response.json();records.replaceChildren();
 if(!tickets.length)records.append(element('p','Your checked tickets will appear here.'));
 for(const t of tickets){
  const card=element('article','');card.className='savedJourney';
  card.append(element('strong','PNR ending '+t.pnr.slice(-4)+(t.train?' · '+t.train:'')));
  const time=new Date(t.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
  if(t.passengers.length){
   const confirmed=t.passengers.every(s=>/^(CNF|CONFIRMED)(?:$|[ /-])/i.test(s));
   card.append(element('p',(t.source==='manual'?'Reported passenger status · Entered by you':confirmed?'All passengers confirmed · API Mitra':'Passenger status · API Mitra')+' · '+time+' IST'));
   if(typeof t.chartPrepared==='boolean')card.append(element('p',t.chartPrepared?'Chart prepared':'Chart not yet prepared'));
   t.passengers.forEach((s,i)=>card.append(element('p','Passenger '+(i+1)+' · '+s)));
  }else card.append(element('p','Awaiting a live result · Added '+time+' IST'));
  card.append(action('Check again',()=>request('POST',t.pnr)),action('Remove',()=>request('DELETE',t.pnr)));
  records.append(card);
 }
}
async function request(method,pnr){
 if(busy)return;busy=true;form.querySelector('button').disabled=true;
 feedback.textContent=method==='POST'?'Checking ticket status…':'Removing ticket…';
 try{
  const r=await fetch('/api/pnr',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({pnr})});
  const data=await r.json();feedback.textContent=data.message||(r.ok?'Ticket removed.':'Please try again.');
  await loadTickets();
 }catch{feedback.textContent='Could not reach your ticket list. Refresh to try again.';}
 finally{busy=false;form.querySelector('button').disabled=false;}
}
form.onsubmit=e=>{e.preventDefault();request('POST',document.querySelector('#number').value);};
loadTickets().catch(()=>{records.textContent='Could not load your tickets. Refresh to try again.';});
