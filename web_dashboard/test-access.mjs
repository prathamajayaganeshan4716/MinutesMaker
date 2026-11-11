import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
const root='/home/ubuntu/.local/share/minutes-maker-rbac/team-demo-20261103';
const accounts=JSON.parse(fs.readFileSync(`${root}/demo-accounts.json`,'utf8'));
const key=JSON.parse(fs.readFileSync('/home/ubuntu/Minutes_maker/Minutes_maker/laptop_processor/firebase-adminsdk.json','utf8'));
const app=initializeApp({credential:cert(key),projectId:'minutes-maker-1013'});const adminAuth=getAuth(app);const db=getFirestore(app);
const base=process.env.TEST_BASE || 'http://127.0.0.1:3001';
const apiKey='AIzaSyAICwfXkfBfwFJinlVZWBqScnAHuCEmdkg';
const sessions=new Map();const results=[];const meetings=[];
async function check(label,fn) { try {await fn();results.push({label,passed:true});} catch(e) {results.push({label,passed:false,error:e.message});} }
async function login(a) {
 const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password,returnSecureToken:true})});const j=await r.json();assert.equal(r.status,200,j.error?.message);sessions.set(a.uid,j.idToken);return j.idToken;
}
async function call(a,path,method='GET',body) {
 const r=await fetch(`${base}/api/access/${path}`,{method,headers:{'Content-Type':'application/json',...(a?{Authorization:`Bearer ${sessions.get(a.uid)}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});let data;try {data=await r.json();}catch {data={};}return {status:r.status,data};
}
const sa=accounts.find(a=>a.role==='super_admin');const admins=accounts.filter(a=>a.role==='admin');const leads=accounts.filter(a=>a.role==='team_lead');const members=accounts.filter(a=>a.role==='member');
const fsBase='https://firestore.googleapis.com/v1/projects/minutes-maker-1013/databases/(default)/documents';
async function direct(a,path,method='GET',body) {const r=await fetch(`${fsBase}/${path}`,{method,headers:{'Content-Type':'application/json',...(a?{Authorization:`Bearer ${sessions.get(a.uid)}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return r.status;}
try {
 for(const a of accounts)await check(`Sign in: ${a.name}`,async()=>{await login(a);assert.equal((await call(a,'account','POST',{})).status,200);});
 await check('Organization: four teams and seven board members',async()=>{const r=await call(sa,'organization');assert.equal(r.status,200);assert.equal(r.data.teams.length,4);assert.equal(r.data.board.length,7);for(const t of r.data.teams){assert.equal(r.data.users.filter(u=>u.isActive&&u.teamId===t.id&&u.role==='member').length,2);assert.equal(r.data.users.filter(u=>u.isActive&&u.teamId===t.id&&u.role==='team_lead').length,1);}});
 for(const lead of leads) {
  const r=await call(lead,'meetings','POST',{title:`Access check ${lead.teamId}`,scope:'team',teamId:lead.teamId});
  await check(`${lead.name} creates own team meeting`,async()=>{assert.equal(r.status,200,JSON.stringify(r.data));});
  if(r.status!==200)continue;meetings.push(r.data.id);lead.meetingId=r.data.id;lead.meetingCode=r.data.code;
  for(const a of accounts) {
   const join=['super_admin','admin'].includes(a.role)||a.teamId===lead.teamId;
   const minutes=a.role==='super_admin'||(a.role==='team_lead'&&a.teamId===lead.teamId);
   await check(`${a.name}: ${join?'allow':'deny'} ${lead.teamId} join`,async()=>{assert.equal((await call(a,'lookup','POST',{key:r.data.code})).status,join?200:403);assert.equal(await direct(a,`meeting_rooms/${r.data.id}`),join?200:403);});
   await check(`${a.name}: ${minutes?'allow':'deny'} ${lead.teamId} minutes`,async()=>{assert.equal((await call(a,`minutes/${r.data.id}`)).status,minutes?200:403);assert.equal(await direct(a,`meetings/${r.data.id}`),minutes?200:403);});
  }
 }
 for(const a of [...admins,sa])await check(`${a.name} creates any team's meeting`,async()=>{const r=await call(a,'meetings','POST',{title:`Staff-created ${a.name}`,scope:'team',teamId:'team-4'});assert.equal(r.status,200);meetings.push(r.data.id);if(a.role==='admin')assert.equal((await call(a,`minutes/${r.data.id}`)).status,403);});
 for(const a of members)await check(`${a.name} cannot create meetings`,async()=>assert.equal((await call(a,'meetings','POST',{title:'Forbidden',scope:'team',teamId:a.teamId})).status,403));
 for(const a of leads)await check(`${a.name} cannot create another team's meeting`,async()=>assert.equal((await call(a,'meetings','POST',{title:'Forbidden',scope:'team',teamId:a.teamId==='team-1'?'team-2':'team-1'})).status,403));
 const board=await call(admins[0],'meetings','POST',{title:'Access check board',scope:'board'});
 await check('Admin creates board meeting',async()=>assert.equal(board.status,200));
 if(board.status===200){meetings.push(board.data.id);for(const a of accounts)await check(`${a.name}: board membership enforced`,async()=>{const allowed=a.role!=='member';assert.equal((await call(a,'lookup','POST',{key:board.data.code})).status,allowed?200:403);assert.equal(await direct(a,`meeting_rooms/${board.data.id}`),allowed?200:403);assert.equal((await call(a,`minutes/${board.data.id}`)).status,allowed?200:403);});}
 await check('Anonymous API access denied',async()=>assert.equal((await call(null,'organization')).status,401));
 await check('Anonymous database minutes denied',async()=>assert.equal(await direct(null,`meetings/${meetings[0]}`),403));
 await check('Member cannot promote self through database',async()=>assert.equal(await direct(members[0],`users/${members[0].uid}`,'PATCH',{fields:{role:{stringValue:'super_admin'}}}),403));
 await check('Member cannot promote self through API',async()=>assert.equal((await call(members[0],`users/${members[0].uid}`,'PATCH',{role:'super_admin'})).status,403));
 await check('Admin cannot assign a privileged role',async()=>assert.equal((await call(admins[0],`users/${members[0].uid}`,'PATCH',{role:'admin'})).status,403));
 await check('Admin cannot modify another admin',async()=>assert.equal((await call(admins[0],`users/${admins[1].uid}`,'PATCH',{role:'member',teamId:'team-1'})).status,403));
 await check('Only super admin can assign roles and board membership updates',async()=>{assert.equal((await call(sa,`users/${members[0].uid}`,'PATCH',{role:'admin'})).status,200);let r=await call(sa,'organization');assert.ok(r.data.board.some(p=>p.id===members[0].uid));assert.equal((await call(sa,`users/${members[0].uid}`,'PATCH',{role:'member',teamId:members[0].teamId})).status,200);await login(members[0]);});
 await check('Admin can approve a guest as member and assign a team',async()=>{assert.equal((await call(sa,`users/${members[1].uid}`,'PATCH',{role:'guest'})).status,200);assert.equal((await call(admins[0],`users/${members[1].uid}`,'PATCH',{role:'member',teamId:'team-2'})).status,200);assert.equal((await db.doc(`users/${members[1].uid}`).get()).data().teamId,'team-2');assert.equal((await call(sa,`users/${members[1].uid}`,'PATCH',{role:'member',teamId:members[1].teamId})).status,200);await login(members[1]);});
 await check('Admin can manage board details',async()=>{assert.equal((await call(admins[1],'board','PATCH',{name:'Board members'})).status,200);});
 await check('Super admin can save another host minutes; admin cannot retrieve them',async()=>{assert.equal((await call(sa,`minutes/${leads[0].meetingId}`,'PUT',{summary:'Confidential team minutes',transcript:'Private team discussion'})).status,200);assert.equal((await call(admins[0],`minutes/${leads[0].meetingId}`)).status,403);assert.equal((await call(leads[1],`minutes/${leads[0].meetingId}`)).status,403);assert.equal(await direct(members[0],`meetings/${leads[0].meetingId}/transcript_segments`),403);});
 await check('Existing accounts paused and original super admins retained',async()=>{const old=JSON.parse(fs.readFileSync(`${root}/account-snapshot.json`,'utf8'));for(const uid of Object.keys(old.auth)){assert.equal((await adminAuth.getUser(uid)).disabled,true);assert.equal((await db.doc(`users/${uid}`).get()).data().isActive,false);}for(const uid of ['YhEBwaC6RKUmLQBE7ykLeAL9eGu2','n6u1hZp9WZSHP1jV3lFJ2ETIlur2'])assert.equal((await db.doc(`users/${uid}`).get()).data().role,'super_admin');});
 await check('Old account token cannot bypass test mode',async()=>{const old=JSON.parse(fs.readFileSync(`${root}/account-snapshot.json`,'utf8'));const uid=Object.keys(old.auth)[0];const token=await adminAuth.createCustomToken(uid);const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});assert.notEqual(r.status,200);});
 await check('Nonmember guest cannot enter any team',async()=>{const a=members[7];assert.equal((await call(sa,`users/${a.uid}`,'PATCH',{role:'guest'})).status,200);await login(a);assert.equal((await call(a,'lookup','POST',{key:leads[0].meetingCode})).status,403);assert.equal((await call(a,'lookup','POST',{key:leads[3].meetingCode})).status,403);assert.equal((await call(sa,`users/${a.uid}`,'PATCH',{role:'member',teamId:a.teamId})).status,200);await login(a);});
 await check('Disabled demo loses API and database access immediately',async()=>{const a=members[6];await db.doc(`users/${a.uid}`).update({isActive:false});assert.equal((await call(a,'organization')).status,403);assert.equal(await direct(a,`meeting_rooms/${leads[3].meetingId}`),403);await db.doc(`users/${a.uid}`).update({isActive:true});});
 await check('Join metadata contains no confidential minutes',async()=>{for(const id of meetings){const data=(await db.doc(`meeting_rooms/${id}`).get()).data();for(const field of ['summary','decisions','actionItems','conclusion','transcript'])assert.equal(field in data,false);}});
} finally {
 // Restore the demo baseline even if an individual permission assertion failed.
 for(const a of accounts){await adminAuth.updateUser(a.uid,{disabled:false});await db.doc(`users/${a.uid}`).set({role:a.role,teamId:a.teamId,isActive:true,isGuest:false,isTeamHead:a.role==='team_lead'},{merge:true});}
 for(const id of meetings){await db.recursiveDelete(db.doc(`meetings/${id}`));await db.doc(`meeting_rooms/${id}`).delete();}
 for(const p of await db.collection('board_members').listDocuments())await p.delete();
 for(const a of accounts.filter(a=>['super_admin','admin','team_lead'].includes(a.role)))await db.doc(`board_members/${a.uid}`).set({uid:a.uid,name:a.name,email:a.email,role:a.role,teamId:a.teamId,isHead:a.role==='team_lead'});
 for(const a of leads)await db.doc(`teams/${a.teamId}`).set({leadUid:a.uid},{merge:true});
 const report={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};fs.writeFileSync(`${root}/access-test-results.json`,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({passed:report.passed,failed:report.failed,failures:results.filter(r=>!r.passed)}));
}
