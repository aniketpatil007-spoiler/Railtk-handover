const $=id=>document.getElementById(id);
const official='https://contents.irctc.co.in/en/Eticket_new_cancel.html';
const format=t=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(t)+' IST';
for(const value of [...family,'Friend','Other']) $('relation').add(new Option(value,value));
for(const [id,title,pattern] of [['pnr','PNR (10 digits)','[0-9]{10}'],['train','Train number (5 digits)','[0-9]{5}'],['from','Boarding station'],['to','Destination station'],['old','Booked passenger name'],['new','Family member’s name']]){
 const label=document.createElement('label'),input=document.createElement('input');
 label.textContent=title;input.id=id;input.required=true;input.maxLength=100;
 if(pattern){input.pattern=pattern;input.inputMode='numeric';input.maxLength=id==='pnr'?10:5;}
 label.append(input);$('fields').append(label);
}
function invalidate(){for(const id of ['create','details','preview']) $(id).hidden=true;$('result').replaceChildren();}
$('check').oninput=invalidate;
function check(){
 const {deadline,reasons}=assess($('status').value,$('relation').value,$('dep').value,Date.now());
 if($('ordinary').value!=='yes')reasons.push('This checker covers first requests for regular full-fare tickets. Contact the reservation office about your booking.');
 const heading=document.createElement('strong'),description=document.createElement('p'),link=document.createElement('a');
 heading.textContent=reasons.length?'Review your booking before applying':'You can prepare a request';
 description.textContent=[...reasons,Number.isFinite(deadline)?'Submission deadline: '+format(deadline)+'.':''].join(' ');
 link.href=official;link.textContent='Read the official guidance';$('result').replaceChildren(heading,description,link);
 $('create').hidden=!!reasons.length;
 if(reasons.length){$('details').hidden=true;$('preview').hidden=true;}
 return !reasons.length;
}
$('check').onsubmit=e=>{e.preventDefault();check();};
$('create').onclick=()=>{if(check()){$('details').hidden=false;$('pnr').focus();}};
$('booking').oninput=()=>{$('preview').hidden=true;};
$('booking').onsubmit=e=>{
 e.preventDefault();if(!check()){$('result').scrollIntoView();return;}
 const v=id=>$(id).value.trim();
 $('letter').value=`Date: __________________

To the Chief Reservation Supervisor
Railway Reservation Office

Subject: Request for change of passenger name on confirmed reservation

Dear Sir/Madam,

I, ${v('old')}, request that my confirmed reservation be transferred to my ${v('relation').toLowerCase()}, ${v('new')}.

PNR: ${v('pnr')}
Train number: ${v('train')}
Scheduled departure: ${format(Date.parse(v('dep')+'+05:30'))}
Journey: ${v('from')} to ${v('to')}

I submit my reservation slip and supporting documents for verification. Kindly consider my request.

Yours faithfully,
${v('old')}
Signature: __________________`;
 $('submissionDeadline').textContent='Submit by '+format(Date.parse(v('dep')+'+05:30')-86400000)+'.';
 $('preview').hidden=false;$('preview').scrollIntoView();
};
$('download').onclick=()=>{if(check()){$('paper').textContent=$('letter').value;window.print();}else $('result').scrollIntoView();};
$('clear').onclick=()=>{document.querySelectorAll('#check,#booking').forEach(f=>f.reset());$('handoverTicket').hidden=true;$('letter').value='';$('paper').textContent='';invalidate();$('status').focus();};
