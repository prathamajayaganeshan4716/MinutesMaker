import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
const root = '/home/ubuntu/.local/share/minutes-maker-rbac/team-demo-20261103';
const key = JSON.parse(fs.readFileSync('/home/ubuntu/Minutes_maker/Minutes_maker/laptop_processor/firebase-adminsdk.json','utf8'));
const app = initializeApp({ credential: cert(key), projectId: 'minutes-maker-1013' });
const rules = getSecurityRules(app);
if (!fs.existsSync(`${root}/previous-ruleset.json`)) {
  const old = await rules.getFirestoreRuleset();
  fs.writeFileSync(`${root}/previous-ruleset.json`,JSON.stringify(old,null,2),{mode:0o600});
}
const updated = await rules.releaseFirestoreRulesetFromSource(fs.readFileSync(`${root}/firestore.team.rules`,'utf8'));
fs.writeFileSync(`${root}/deployed-ruleset.json`,JSON.stringify({name:updated.name},null,2),{mode:0o600});
console.log(JSON.stringify({rulesDeployed:true,ruleset:updated.name}));
