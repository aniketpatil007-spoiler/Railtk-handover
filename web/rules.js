const family=['Father','Mother','Brother','Sister','Son','Daughter','Husband','Wife'];
function assess(status,relationship,departure,now){
 const reasons=[];
 const deadline=Date.parse(departure+'+05:30')-86400000;
 if(status!=='Confirmed') reasons.push('This process requires a confirmed reservation.');
 if(!family.includes(relationship)) reasons.push('The family-transfer rule does not cover this relationship.');
 if(!Number.isFinite(deadline)||now>deadline) reasons.push('The 24-hour submission deadline has passed or the departure is invalid.');
 return {deadline,reasons};
}
if(typeof module!=='undefined') module.exports={assess};
