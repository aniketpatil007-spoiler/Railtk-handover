self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(tabs=>tabs.length?tabs[0].focus():clients.openWindow('/')));
});
