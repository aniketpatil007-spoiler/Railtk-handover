const alertButton=$('alerts'),alertState=$('alertState');
const supported='Notification' in window && 'serviceWorker' in navigator;
const preference='rail-letter-alerts';
const registered=supported?navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).catch(()=>null):Promise.resolve(null);
function alertsOn(){return supported && Notification.permission==='granted' && localStorage.getItem(preference)==='on';}
function updateAlerts(){
 alertButton.hidden=!supported||Notification.permission==='denied';
 alertButton.textContent=alertsOn()?'Turn off notifications':'Enable notifications';
 alertState.textContent=!supported?'Use the on-page letter preview in this browser.':Notification.permission==='denied'?'Notifications are blocked in your browser settings.':alertsOn()?'Letter-ready alerts are on for this browser.':'';
}
alertButton.onclick=async()=>{
 if(alertsOn())localStorage.removeItem(preference);
 else if(await Notification.requestPermission()==='granted')localStorage.setItem(preference,'on');
 updateAlerts();
};
updateAlerts();
$('booking').addEventListener('submit',async()=>{
 if($('preview').hidden||!alertsOn())return;
 try{const reg=await registered;if(!reg)throw Error();await reg.showNotification('Your request letter is ready',{body:'Return to Rail Handover to review and print it.',tag:'rail-letter'});}
 catch{alertState.textContent='Your letter is ready. This browser could not display the notification.';}
});
