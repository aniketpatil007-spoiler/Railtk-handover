async function pnrApi(req,env,userId){
 const prefix='pnr/'+encodeURIComponent(userId)+'/';
 const json=(data,status=200)=>reply(JSON.stringify(data),'application/json',status);
 if(req.method==='GET'){
  const items=[];let cursor;
  do{
   const page=await env.BUCKET.list({prefix,cursor});
   const batch=await Promise.all(page.objects.map(async o=>{
    const record=await env.BUCKET.get(o.key);
    return record?record.json():null;
   }));
   items.push(...batch.filter(Boolean));
   cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return json(items.sort((a,b)=>b.at.localeCompare(a.at)));
 }
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({message:'Invalid origin.'},403);
 if(!['POST','PUT','DELETE'].includes(req.method))return json({message:'Method unavailable.'},405);
 const input=await req.json().catch(()=>null);
 if(typeof input?.pnr!=='string'||!/^\d{10}$/.test(input.pnr))return json({message:'Enter a 10-digit PNR.'},400);
 const pnr=input.pnr,key=prefix+pnr;
 if(req.method==='DELETE'){await env.BUCKET.delete(key);return json({});}
 const item={pnr,at:new Date().toISOString(),passengers:[]};
 if(req.method==='PUT'){
  if(!Array.isArray(input.passengers)||!input.passengers.length||input.passengers.length>12||
    !input.passengers.every(status=>typeof status==='string'&&status.trim()&&status.length<=80))
   return json({message:'Enter one current status per passenger, up to 12 passengers.'},400);
  item.passengers=input.passengers.map(status=>status.trim());
  item.source='manual';
  await env.BUCKET.put(key,JSON.stringify(item));
  return json({message:'Reported status saved.',ticket:item});
 }
 if(!env.APIMITRA_API_KEY)return json({message:'Automatic lookup needs an API Mitra key. Check on Indian Railways and save the result here.'},503);
 try{
  const response=await fetch('https://api.apimitra.in/train/pnr?number='+pnr,{
   headers:{'x-api-key':env.APIMITRA_API_KEY},redirect:'error',signal:AbortSignal.timeout(12000)
  });
  if(response.status===401||response.status===403)
   return json({message:'API Mitra rejected the configured key. Use Indian Railways enquiry.'},503);
  if(response.status===429)
   return json({message:'API Mitra has reached its lookup limit. Use Indian Railways enquiry.'},503);
  if(!response.ok)throw Error();
  const data=await response.json();
  if(data.status!=='ok'||String(data.pnr)!==pnr||!Array.isArray(data.passengers)||!data.passengers.length||!data.passengers.every(p=>typeof p?.current_status==='string'&&p.current_status.trim()))throw Error();
  item.passengers=data.passengers.map(p=>p.current_status.trim().slice(0,80));
  item.train=String(data.train_name||'').slice(0,100);
  const trainNumber=String(data.train_number||'');
  if(/^\d{5}$/.test(trainNumber))item.trainNumber=trainNumber;
  if(typeof data.chart_prepared==='boolean')item.chartPrepared=data.chart_prepared;
  item.at=new Date().toISOString();
 }catch{
  return json({message:'API Mitra could not return a status. Check on Indian Railways and save the result here.'},503);
 }
 await env.BUCKET.put(key,JSON.stringify(item));
 return json({message:'Ticket status retrieved and saved.',ticket:item});
}
