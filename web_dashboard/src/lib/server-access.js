import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { active, isStaff, isSuper, SUPER_ADMIN_UIDS } from './permissions';

export class AccessError extends Error {
  constructor(message, status = 403) { super(message); this.status = status; }
}
export function adminServices() {
  let app = getApps().find(a => a.name === 'minutes-maker-server');
  if (!app) {
    const filename = process.env.FIREBASE_ADMIN_CREDENTIALS || path.resolve(process.cwd(), '../laptop_processor/firebase-adminsdk.json');
    const account = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (account.project_id !== 'minutes-maker-1013') throw new Error('Unexpected server project');
    app = initializeApp({ credential: cert(account), projectId: account.project_id }, 'minutes-maker-server');
  }
  return { auth: getAuth(app), db: getFirestore(app) };
}
export async function requireAccount(request, { bootstrap = false, staff = false, superAdmin = false } = {}) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new AccessError('Sign in to continue.', 401);
  const services = adminServices();
  let user;
  try { user = await services.auth.verifyIdToken(token, true); }
  catch { throw new AccessError('Your session is unavailable. Sign in again.', 401); }
  const [account, settings] = await Promise.all([
    services.db.doc(`users/${user.uid}`).get(), services.db.doc('app_config/access').get(),
  ]);
  const profile = account.exists ? account.data() : null;
  const mode = settings.data() || {};
  const protectedSuperAdmin = !!profile && isSuper(profile) && SUPER_ADMIN_UIDS.includes(user.uid);
  if (mode.testMode && !protectedSuperAdmin && (!profile?.isDemo || !(mode.allowedTestUids || []).includes(user.uid))) throw new AccessError('Testing is in progress. This account is not enabled for the test environment.');
  if ((profile && !active(profile)) || (!profile && !bootstrap)) throw new AccessError('This account is disabled or has not been approved.');
  if (staff && !isStaff(profile)) throw new AccessError('Admin access is required.');
  if (superAdmin && !isSuper(profile)) throw new AccessError('Only a super admin can assign roles.');
  return { ...services, user, profile, mode };
}
export function accessResponse(error) {
  const status = error instanceof AccessError ? error.status : 500;
  if (status === 500) console.error('Access operation failed:', error.code || error.name);
  return Response.json({ error: status === 500 ? 'The operation could not be completed.' : error.message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
