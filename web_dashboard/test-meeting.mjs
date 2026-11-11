import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp as clientApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, setDoc, query, where, deleteDoc, terminate } from 'firebase/firestore';
const root='/home/ubuntu/.local/share/minutes-maker-rbac/team-demo-20261103';
const accounts=JSON.parse(fs.readFileSync(`${root}/demo-accounts.json`));
const key=JSON.parse(fs.readFileSync('/home/ubuntu/Minutes_maker/Minutes_maker/laptop_processor/firebase-adminsdk.json'));
const db=adminFirestore(initializeApp({credential:cert(key),projectId:'minutes-maker-1013'}));
const cfg={apiKey:'AIzaSyAICwfXkfBfwFJinlVZWBqScnAHuCEmdkg',projectId:'minutes-maker-1013',authDomain:'minutes-maker-1013.firebaseapp.com'};
const results=[];const clients=[];const ids=[];
async function check(label,fn){try{await fn();results.push({label,passed:true});}catch(e){results.push({label,passed:false,error:e.message});}}
async function call(c,path,method='GET',body){const r=await fetch(`http://127.0.0.1:3001/api/access/${path}`,{method,headers:{Authorization:`Bearer ${await c.auth.currentUser.getIdToken()}`,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};}
try{
 for(const a of accounts.filter(a=>a.role==='super_admin'||a.role==='admin'||a.email.includes('team1.')||a.email.includes('team2.lead'))){const app=clientApp(cfg,a.uid);const auth=getAuth(app);await signInWithEmailAndPassword(auth,a.email,a.password);clients.push({...a,app,auth,db:getFirestore(app)});}
 const lead=clients.find(a=>a.role==='team_lead'&&a.teamId==='team-1');const sa=clients.find(a=>a.role==='super_admin');const admin=clients.find(a=>a.role==='admin');const member=clients.find(a=>a.role==='member');const other=clients.find(a=>a.role==='team_lead'&&a.teamId==='team-2');
 const created=await call(lead,'meetings','POST',{title:'Meeting-path verification',scope:'team',teamId:'team-1'});assert.equal(created.status,200);const id=created.data.id;ids.push(id);
 const board=await call(sa,'meetings','POST',{title:'Board query verification',scope:'board'});assert.equal(board.status,200);ids.push(board.data.id);
 for(const c of clients){
  await check(`${c.name}: meeting-list query`,async()=>{let q=collection(c.db,'meeting_rooms');if(!['super_admin','admin'].includes(c.role)){const groups=c.role==='team_lead'?['board',`team:${c.teamId}`]:[`team:${c.teamId}`];q=query(q,where('audienceIds','array-contains-any',groups));}const s=await getDocs(q);assert.equal(s.docs.some(d=>d.id===id),c.role!=='team_lead'||c.teamId==='team-1');});
  if(c.role!=='member')await check(`${c.name}: confidential minutes-list query`,async()=>{let q=collection(c.db,'meetings');if(c.role==='team_lead')q=query(q,where('audienceIds','array-contains-any',['board',`team:${c.teamId}`]));else if(c.role==='admin')q=query(q,where('scope','==','board'));const s=await getDocs(q);assert.equal(s.docs.some(d=>d.id===id),c.role==='super_admin'||c.teamId==='team-1');});
 }
 for(const c of [lead,member,admin])await check(`${c.name}: authorized presence and attendance`,async()=>{await setDoc(doc(c.db,`meetings/${id}/peers/test-${c.uid}`),{uid:c.uid,peerId:`test-${c.uid}`,displayName:c.name});await setDoc(doc(c.db,`meetings/${id}/attendance/test-${c.uid}`),{uid:c.uid,displayName:c.name,joinedAt:new Date()});});
 await check('Other team lead cannot inject presence',async()=>{await assert.rejects(setDoc(doc(other.db,`meetings/${id}/peers/forbidden`),{uid:other.uid}));});
 await check('Member cannot forge another participant identity',async()=>{await assert.rejects(setDoc(doc(member.db,`meetings/${id}/peers/forged`),{uid:lead.uid}));});
 await check('Authorized member can send chat and whiteboard stroke',async()=>{await setDoc(doc(member.db,`meetings/${id}/chats/test`),{authorUid:member.uid,sender:member.name,text:'Access check',timestamp:new Date()});await setDoc(doc(member.db,`meetings/${id}/whiteboard/test`),{authorUid:member.uid,points:[],at:Date.now()});});
 await check('Cross-team transcript read denied',async()=>{await assert.rejects(getDocs(collection(other.db,`meetings/${id}/transcript_segments`)));});
 await check('Member cannot change meeting scope or ownership',async()=>{assert.equal((await call(member,`meetings/${id}`,'PATCH',{teamId:'team-2'})).status,403);});
 await check('Host cannot transfer scope through API',async()=>{assert.equal((await call(lead,`meetings/${id}`,'PATCH',{teamId:'team-2'})).status,400);});
 await check('Admin joins locked team while members cannot bypass lock',async()=>{assert.equal((await call(lead,`meetings/${id}`,'PATCH',{'controls.locked':true})).status,200);await setDoc(doc(admin.db,`meetings/${id}/peers/admin-locked`),{uid:admin.uid});await assert.rejects(setDoc(doc(member.db,`meetings/${id}/peers/member-locked`),{uid:member.uid}));await call(lead,`meetings/${id}`,'PATCH',{'controls.locked':false});});
 await check('Host completes meeting through protected server finalizer',async()=>{assert.equal((await call(lead,`meetings/${id}`,'PATCH',{status:'processing'})).status,200);assert.equal((await call(lead,`finalize/${id}`,'POST',{autoMinutes:false})).status,200);const stored=(await db.doc(`meetings/${id}`).get()).data();assert.equal(stored.status,'completed');assert.equal((await call(admin,`minutes/${id}`)).status,403);});
 await check('Completed transcript denied to ordinary member',async()=>{await assert.rejects(getDocs(collection(member.db,`meetings/${id}/transcript_segments`)));});
}finally{
 for(const id of ids){await db.recursiveDelete(db.doc(`meetings/${id}`));await db.doc(`meeting_rooms/${id}`).delete();}
 for(const c of clients){await terminate(c.db);await deleteApp(c.app);}
 const report={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};fs.writeFileSync(`${root}/meeting-test-results.json`,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({passed:report.passed,failed:report.failed,failures:results.filter(r=>!r.passed)}));
}
