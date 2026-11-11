import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AccessError, accessResponse, adminServices, requireAccount } from '@/lib/server-access';
import { ROLES, SUPER_ADMIN_UIDS, canCreate, canJoin, canReadMinutes, canEditMinutes, canManage, isStaff, isSuper, isBoard, roomData, audience } from '@/lib/permissions';
import { POST as generateSummary } from '@/app/api/summarize/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const clean = (value, max = 120) => String(value || '').trim().slice(0, max);
const validTeamId = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
const response = (data) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
const publicUser = (d) => { const p = d.data(); const email = String(p.email || '').toLowerCase(); const role = p.role === 'team_lead' || (p.role === 'super_admin' && !['prathamaj@karunya.edu.in', 'matrixkarunya@gmail.com'].includes(email)) ? 'admin' : p.role || 'guest'; return { id: d.id, name: p.name || '', email: p.email || '', role, teamId: p.teamId || '', isActive: p.isActive === true, isDemo: p.isDemo === true, isTeamHead: p.isTeamHead === true || p.role === 'team_lead', isDocumentLead: p.isDocumentLead === true }; };
async function data(request) {
  const maxBytes = request.method === 'PUT' && new URL(request.url).pathname.includes('/transcripts/') ? 900000 : 65536;
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new AccessError('Request is too large.', 413);
  try { const b = await request.json(); if (JSON.stringify(b).length > maxBytes) throw new Error(); return b; }
  catch { throw new AccessError('Invalid request.', 400); }
}
async function meeting(ctx, id) {
  if (!id || id.includes('/')) throw new AccessError('Invalid meeting.', 400);
  const snap = await ctx.db.doc(`meetings/${id}`).get();
  if (!snap.exists) throw new AccessError('Meeting not found.', 404);
  return { id, ...snap.data() };
}
async function docTeam(ctx) {
  const teams = await ctx.db.collection('teams').get();
  return teams.docs.find(d => d.data()?.isDocumentation === true || String(d.data()?.name || '').trim().toLowerCase() === 'documentation') || null;
}
async function isDocumentLead(ctx) {
  const team = await docTeam(ctx);
  return !!team && team.data()?.leadUid === ctx.user.uid;
}
async function isAssignedTeamLead(ctx, teamId, uid = ctx.user.uid) {
  if (!teamId) return false;
  const snap = await ctx.db.doc(`teams/${teamId}`).get();
  return snap.exists && snap.data()?.leadUid === uid;
}
async function canManageMeeting(ctx, m) {
  if (isSuper(ctx.profile)) return true;
  if (!isStaff(ctx.profile)) return false;
  if (m.hostUid === ctx.user.uid) return true;
  return m.scope === 'team' && await isAssignedTeamLead(ctx, m.teamId);
}
async function finishMeeting(ctx, id, autoMinutes, authorization) {
  const { db, user } = ctx;
  const m = await meeting(ctx, id);
  if (['pending', 'published'].includes(m.transcriptStatus)) {
    await db.doc(`meeting_rooms/${id}`).set({ status: 'completed', endedAt: m.endedAt || FieldValue.serverTimestamp() }, { merge: true });
    return { id, alreadyFinalized: true };
  }
  const roomRef = db.doc(`meeting_rooms/${id}`);
  const endedAt = m.endedAt || FieldValue.serverTimestamp();
  await roomRef.set({ status: 'processing', endedAt }, { merge: true });
  const segments = await db.collection(`meetings/${id}/transcript_segments`).orderBy('sequenceNumber').get();
  const transcript = segments.docs.map(d => `${d.data().speakerName || 'Speaker'}: ${d.data().text || ''}`).join('\n') || (typeof m.transcript === 'string' ? m.transcript : '');
  let report = { summary: '', decisions: '', actionItems: '', conclusion: '', source: 'none' };
  if (autoMinutes && transcript.trim()) {
    try {
      const result = await generateSummary(new Request('http://localhost/api/summarize', {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      }));
      if (result.ok) report = await result.json();
    } catch (error) {
      console.warn('Minutes summary generation failed; transcript review will continue.', error?.code || error?.name || 'unknown');
    }
  }
  const meetingRef = db.doc(`meetings/${id}`);
  const privateTranscript = db.doc(`meetings/${id}/private_transcript/current`);
  const pendingPatch = {
    summary: report.summary || '', decisions: report.decisions || '', actionItems: report.actionItems || '', conclusion: report.conclusion || '', summarySource: report.source || 'auto',
    transcriptStatus: 'pending', transcriptPublished: false, status: 'completed', endedAt,
    transcript: FieldValue.delete(),
  };
  const roomPatch = {
    status: 'completed', endedAt, transcriptStatus: 'pending', transcriptPublished: false,
    transcript: FieldValue.delete(), summary: FieldValue.delete(), decisions: FieldValue.delete(), actionItems: FieldValue.delete(), conclusion: FieldValue.delete(),
  };
  const batch = db.batch();
  batch.set(privateTranscript, { text: transcript, editedText: transcript, updatedAt: FieldValue.serverTimestamp(), generatedAt: FieldValue.serverTimestamp(), generatedBy: user.uid });
  batch.update(meetingRef, pendingPatch);
  batch.set(roomRef, roomPatch, { merge: true });
  for (const uid of SUPER_ADMIN_UIDS) batch.set(db.doc(`notifications/${uid}/items/${id}`), {
    type: 'transcript_review', meetingId: id, title: m.title || 'Meeting', meetingCode: m.meetingCode || '', scope: m.scope || '', teamId: m.teamId || '',
    hostName: m.hostName || '', endedAt, createdAt: FieldValue.serverTimestamp(), status: 'pending',
  });
  await batch.commit();
  return { id, alreadyFinalized: false };
}
async function changeUser(ctx, uid, body) {
  const { db, auth, user: actor, profile: actorProfile } = ctx;
  if (!isSuper(actorProfile)) throw new AccessError('Only Super Admins can change user roles or team access.');
  if (!uid || uid.includes('/')) throw new AccessError('Invalid account.', 400);
  let target;
  const updated = await db.runTransaction(async tx => {
    const ref = db.doc(`users/${uid}`); const snap = await tx.get(ref);
    if (!snap.exists) throw new AccessError('Account not found.', 404);
    target = snap.data();
    if (isSuper(target) || SUPER_ADMIN_UIDS.includes(uid)) throw new AccessError('The two protected Super Admin accounts cannot be changed here.');
    const role = body.role === undefined ? (target.role === 'team_lead' || target.role === 'super_admin' ? 'admin' : target.role) : body.role;
    if (!ROLES.includes(role)) throw new AccessError('Select a valid role.', 400);
    if (role === 'super_admin') throw new AccessError('Super Admin assignment is restricted to the two designated accounts.');
    const oldTeam = validTeamId(target.teamId) ? await tx.get(db.doc(`teams/${target.teamId}`)) : null;
    const currentLead = oldTeam?.exists && oldTeam.data()?.leadUid === uid;
    const teamId = body.teamId === undefined ? (['member', 'guest'].includes(role) || (role === 'admin' && currentLead) ? (target.teamId || '') : '') : clean(body.teamId);
    const retainedHead = currentLead && role === 'admin' && teamId === target.teamId && body.isActive !== false;
    if (role === 'member' && !validTeamId(teamId)) throw new AccessError('Select a team for this member.', 400);
    if (teamId && !validTeamId(teamId)) throw new AccessError('Select an existing team.', 400);
    const dest = teamId ? await tx.get(db.doc(`teams/${teamId}`)) : null;
    if (teamId && !dest?.exists) throw new AccessError('That team no longer exists. Refresh and choose another team.', 409);
    const isActive = body.isActive === undefined ? target.isActive === true : body.isActive === true;
    if (!isActive && currentLead) tx.update(oldTeam.ref, { leadUid: '' });
    const isTeamHeadNow = retainedHead && isActive;
    const isDocumentLeadNow = isTeamHeadNow && (dest?.data()?.isDocumentation === true || String(dest?.data()?.name || '').trim().toLowerCase() === 'documentation');
    const patch = { role, teamId, isActive, isGuest: role === 'guest', isTeamHead: isTeamHeadNow, isDocumentLead: isDocumentLeadNow, documentLeadTeamId: isDocumentLeadNow ? teamId : '', permissions: [], accessUpdatedBy: actor.uid, accessUpdatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) patch.name = clean(body.name);
    if (currentLead && !isTeamHeadNow) tx.update(oldTeam.ref, { leadUid: '' });
    tx.update(ref, patch);
    if (isActive && role === 'admin') tx.set(db.doc(`board_members/${uid}`), { uid, email: target.email, name: patch.name || target.name, role, teamId, isHead: isTeamHeadNow });
    else tx.delete(db.doc(`board_members/${uid}`));
    return { ...target, ...patch };
  });
  if (target.isActive !== updated.isActive) await auth.updateUser(uid, { disabled: !updated.isActive });
  if (target.role !== updated.role || !updated.isActive) await auth.revokeRefreshTokens(uid);
  return response({ ok: true });
}
async function handler(request, context) {
  try {
    const { path: parts } = await context.params; const [kind, id] = parts;
    if (kind === 'status' && request.method === 'GET') {
      const snap = await adminServices().db.doc('app_config/access').get();
      return response({ testMode: snap.data()?.testMode === true });
    }
    const ctx = await requireAccount(request, { bootstrap: kind === 'account' });
    const { db, auth, user, profile } = ctx;
    if (kind === 'account' && request.method === 'POST') {
      if (!profile) await db.doc(`users/${user.uid}`).create({ name: clean(user.name || user.email?.split('@')[0] || 'Guest'), email: user.email || '', role: 'guest', teamId: '', isGuest: true, isActive: true, permissions: [], createdAt: FieldValue.serverTimestamp() });
      return response({ ok: true });
    }
    if (kind === 'organization' && request.method === 'GET') {
      if (!isStaff(profile)) throw new AccessError('Admin access is required.');
      const [teams, users, settings] = await Promise.all([db.collection('teams').get(), db.collection('users').get(), db.doc('app_config/board').get()]);
      const allUsers = users.docs.map(publicUser);
      const currentTeam = validTeamId(profile.teamId) ? teams.docs.find(d => d.id === profile.teamId) : null;
      const leadsOwnTeam = !isSuper(profile) && currentTeam?.data()?.leadUid === user.uid;
      const list = leadsOwnTeam ? allUsers.filter(p => p.id === user.uid || p.teamId === profile.teamId) : allUsers;
      const visibleTeams = leadsOwnTeam ? teams.docs.filter(d => d.id === profile.teamId) : teams.docs;
      const board = leadsOwnTeam ? [] : allUsers.filter(p => p.isActive && ['super_admin', 'admin', 'team_lead'].includes(p.role));
      return response({ teams: visibleTeams.map(d => ({ id: d.id, ...d.data() })), users: list, board, boardName: settings.data()?.name || 'Board members' });
    }
    if (kind === 'notifications' && request.method === 'GET') {
      if (!isSuper(profile)) throw new AccessError('Only Super Admins can review transcript notifications.');
      const pending = new Map();
      for (const uid of SUPER_ADMIN_UIDS) {
        const items = await db.collection(`notifications/${uid}/items`).where('status', '==', 'pending').get();
        for (const item of items.docs) {
          const meetingId = item.data().meetingId || item.id;
          if (pending.has(meetingId)) continue;
          const m = await meeting(ctx, meetingId);
          const transcript = await db.doc(`meetings/${m.id}/private_transcript/current`).get();
          pending.set(meetingId, { id: m.id, title: m.title || 'Meeting', meetingCode: m.meetingCode || '', scope: m.scope || '', teamId: m.teamId || '', hostName: m.hostName || '', createdAt: m.createdAt || null, endedAt: m.endedAt || null, transcript: transcript.data()?.editedText || transcript.data()?.text || '' });
        }
      }
      return response({ notifications: [...pending.values()] });
    }
    if (kind === 'teams' && request.method === 'GET') {
      if (!isStaff(profile)) throw new AccessError('Admin access is required.');
      const teams = await db.collection('teams').get();
      const currentTeam = validTeamId(profile.teamId) ? teams.docs.find(d => d.id === profile.teamId) : null;
      const rows = !isSuper(profile) && currentTeam?.data()?.leadUid === user.uid ? teams.docs.filter(d => d.id === profile.teamId) : teams.docs;
      return response({ teams: rows.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)) });
    }
    if (kind === 'teams' && request.method === 'POST') {
      if (!isSuper(profile)) throw new AccessError('Only super admins can create teams.');
      const body = await data(request); const name = clean(body.name, 64);
      if (name.length < 2) throw new AccessError('Enter a team name with at least 2 characters.', 400);
      const existing = await db.collection('teams').get();
      if (existing.docs.some(d => clean(d.data().name, 64).toLocaleLowerCase() === name.toLocaleLowerCase())) throw new AccessError('A team with that name already exists.', 409);
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'team';
      const id = `team-${slug}-${randomBytes(3).toString('hex')}`;
      const isDocumentation = name.toLowerCase() === 'documentation';
      if (isDocumentation && existing.docs.some(d => d.data()?.isDocumentation === true || String(d.data()?.name || '').trim().toLowerCase() === 'documentation')) throw new AccessError('The Documentation Team already exists.', 409);
      const teamData = { name, leadUid: '', isDocumentation, createdBy: user.uid, createdAt: FieldValue.serverTimestamp() };
      await db.collection('teams').doc(id).create(teamData);
      return response({ ok: true, team: { id, name, leadUid: '', isDocumentation } });
    }
    if (kind === 'teams' && id && request.method === 'PATCH') {
      if (!isSuper(profile)) throw new AccessError('Only Super Admins can assign team leads.');
      if (!validTeamId(id)) throw new AccessError('Invalid team.', 400);
      const body = await data(request);
      if (body.leadUid === undefined) throw new AccessError('Choose a team lead or select No team lead.', 400);
      const leadUid = clean(body.leadUid, 128);
      if (body.leadUid !== undefined && body.leadUid !== '' && !leadUid) throw new AccessError('Invalid team lead.', 400);
      await db.runTransaction(async tx => {
        const teamRef = db.doc(`teams/${id}`); const teamSnap = await tx.get(teamRef);
        if (!teamSnap.exists) throw new AccessError('Team not found.', 404);
        const team = teamSnap.data(); const oldUid = team.leadUid || '';
        const oldRef = oldUid ? db.doc(`users/${oldUid}`) : null;
        const newRef = leadUid ? db.doc(`users/${leadUid}`) : null;
        const [oldSnap, newSnap, assignments] = await Promise.all([
          oldRef ? tx.get(oldRef) : Promise.resolve(null),
          newRef ? tx.get(newRef) : Promise.resolve(null),
          leadUid ? tx.get(db.collection('teams').where('leadUid', '==', leadUid)) : Promise.resolve(null),
        ]);
        if (leadUid && (!newSnap?.exists || newSnap.data()?.isActive !== true || !['admin', 'team_lead'].includes(newSnap.data()?.role))) throw new AccessError('Choose an active Admin account as the team lead.', 409);
        if (leadUid && assignments?.docs.some(d => d.id !== id)) throw new AccessError('This Admin already leads another team.', 409);
        const isDocumentation = team.isDocumentation === true || String(team.name || '').trim().toLowerCase() === 'documentation';
        if (oldUid && oldUid !== leadUid && oldSnap?.exists) tx.update(oldRef, { isTeamHead: false, isDocumentLead: false, documentLeadTeamId: '', teamId: '', accessUpdatedBy: user.uid, accessUpdatedAt: FieldValue.serverTimestamp() });
        tx.update(teamRef, { leadUid, isDocumentation });
        if (leadUid && newSnap?.exists) {
          tx.update(newRef, { role: 'admin', teamId: id, isTeamHead: true, isDocumentLead: isDocumentation, documentLeadTeamId: isDocumentation ? id : '', isGuest: false, permissions: [], accessUpdatedBy: user.uid, accessUpdatedAt: FieldValue.serverTimestamp() });
          tx.set(db.doc(`board_members/${leadUid}`), { uid: leadUid, email: newSnap.data()?.email || '', name: newSnap.data()?.name || '', role: 'admin', teamId: id, isHead: true });
        }
      });
      return response({ ok: true });
    }
    if (kind === 'teams' && request.method === 'DELETE') {
      if (!isSuper(profile)) throw new AccessError('Only super admins can delete teams.');
      if (!id || !validTeamId(id)) throw new AccessError('Invalid team.', 400);
      await db.runTransaction(async tx => {
        const ref = db.doc(`teams/${id}`); const team = await tx.get(ref);
        if (!team.exists) throw new AccessError('Team not found.', 404);
        const [users, meetings, rooms] = await Promise.all([
          tx.get(db.collection('users').where('teamId', '==', id).limit(1)),
          tx.get(db.collection('meetings').where('teamId', '==', id).limit(1)),
          tx.get(db.collection('meeting_rooms').where('teamId', '==', id).limit(1)),
        ]);
        if (team.data()?.leadUid || !users.empty || !meetings.empty || !rooms.empty) throw new AccessError('Move all members and keep or remove this team’s meetings before deleting the team.', 409);
        tx.delete(ref);
      });
      return response({ ok: true });
    }
    if (kind === 'board' && request.method === 'PATCH') {
      if (!isStaff(profile)) throw new AccessError('Admin access is required.');
      const body = await data(request); const name = clean(body.name);
      if (!name) throw new AccessError('Enter a board name.', 400);
      await db.doc('app_config/board').set({ name, updatedBy: user.uid }, { merge: true });
      return response({ ok: true });
    }
    if (kind === 'users' && request.method === 'PATCH') return await changeUser(ctx, id, await data(request));
    if (kind === 'users' && request.method === 'POST') {
      if (!isSuper(profile)) throw new AccessError('Only super admins can create member accounts.');
      const body = await data(request); const email = clean(body.email, 254).toLowerCase(); const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) throw new AccessError('Enter a valid email and a password of at least 10 characters.', 400);
      const role = body.role || 'member';
      if (!['member', 'guest', 'admin'].includes(role)) throw new AccessError('Choose Admin, Member or Guest.', 400);
      if (role === 'member' && !validTeamId(body.teamId)) throw new AccessError('Select a team for this member.', 400);
      if (body.teamId && !validTeamId(body.teamId)) throw new AccessError('Select an existing team.', 400);
      const created = await auth.createUser({ email, password, displayName: clean(body.name || email.split('@')[0]) });
      try {
        await db.doc(`users/${created.uid}`).set({ email, name: created.displayName, role: 'guest', teamId: '', isGuest: true, isActive: true, isDemo: ctx.mode.testMode === true, permissions: [], createdAt: FieldValue.serverTimestamp() });
        await changeUser(ctx, created.uid, { role, teamId: body.teamId });
        if (ctx.mode.testMode) await db.doc('app_config/access').update({ allowedTestUids: FieldValue.arrayUnion(created.uid) });
      } catch (error) {
        await auth.deleteUser(created.uid).catch(() => {});
        await db.doc(`users/${created.uid}`).delete().catch(() => {});
        await db.doc(`board_members/${created.uid}`).delete().catch(() => {});
        if (ctx.mode.testMode) await db.doc('app_config/access').update({ allowedTestUids: FieldValue.arrayRemove(created.uid) }).catch(() => {});
        throw error;
      }
      return response({ ok: true, uid: created.uid });
    }
    if (kind === 'users' && request.method === 'DELETE') {
      if (!isSuper(profile)) throw new AccessError('Only super admins can delete member accounts.');
      if (!id || id.includes('/')) throw new AccessError('Invalid account.', 400);
      if (id === user.uid || SUPER_ADMIN_UIDS.includes(id)) throw new AccessError('You cannot delete your own account or either protected super admin.');
      const ref = db.doc(`users/${id}`); const snap = await ref.get();
      if (!snap.exists) throw new AccessError('Account not found.', 404);
      const target = snap.data();
      if (isSuper(target) || SUPER_ADMIN_UIDS.includes(id)) throw new AccessError('Super admin accounts cannot be deleted.');
      const teamRef = validTeamId(target.teamId) ? db.doc(`teams/${target.teamId}`) : null;
      const team = teamRef ? await teamRef.get() : null;
      const batch = db.batch();
      batch.update(ref, { role: 'guest', teamId: '', isActive: false, isGuest: true, isTeamHead: false, permissions: [], removedBy: user.uid, removedAt: FieldValue.serverTimestamp() });
      batch.delete(db.doc(`board_members/${id}`));
      if (team?.exists && team.data()?.leadUid === id) batch.update(teamRef, { leadUid: '' });
      await batch.commit();
      try {
        await auth.updateUser(id, { disabled: true });
        await auth.revokeRefreshTokens(id);
        await auth.deleteUser(id);
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw new AccessError('The account has been disabled, but Firebase identity cleanup did not finish. Retry deletion or contact a super admin.', 503);
      }
      await ref.delete();
      if (ctx.mode.testMode) await db.doc('app_config/access').update({ allowedTestUids: FieldValue.arrayRemove(id) });
      return response({ ok: true });
    }
    if (kind === 'lookup' && request.method === 'POST') {
      const body = await data(request); const key = clean(body.key);
      let snap = await db.doc(`meeting_rooms/${key}`).get();
      if (!snap.exists) { const found = await db.collection('meeting_rooms').where('meetingCode', '==', key).limit(1).get(); snap = found.docs[0]; }
      if (!snap?.exists || !canJoin(profile, snap.data())) throw new AccessError('You do not have access to this meeting.');
      return response({ meeting: { id: snap.id, ...snap.data() } });
    }
    if (kind === 'meetings' && request.method === 'POST') {
      if (!canCreate(profile)) throw new AccessError('Only Admins and Super Admins can create meetings.');
      const body = await data(request); const scope = body.scope === 'board' ? 'board' : 'team'; const teamId = scope === 'team' ? clean(body.teamId || profile.teamId) : '';
      const leadsOwnTeam = await isAssignedTeamLead(ctx, profile.teamId);
      if (scope === 'board' && (!isStaff(profile) || leadsOwnTeam)) throw new AccessError('Only non-team-lead Admins and Super Admins can create board meetings.');
      if (scope === 'team' && (!validTeamId(teamId) || (leadsOwnTeam && teamId !== profile.teamId))) throw new AccessError('Team leads may create meetings for their own team only.');
      if (scope === 'team' && !(await db.doc(`teams/${teamId}`).get()).exists) throw new AccessError('That team no longer exists. Refresh and choose another team.', 409);
      const ref = db.collection('meetings').doc(); const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (scheduledAt && !Number.isFinite(scheduledAt.getTime())) throw new AccessError('Invalid meeting time.', 400);
      const m = { meetingCode: `cnt-${randomBytes(6).toString('hex')}`, title: clean(body.title) || 'Untitled meeting', agenda: clean(body.agenda, 10000), participants: clean(body.participants, 2000), scope, teamId, audienceIds: audience(scope, teamId), hostUid: user.uid, hostEmail: user.email || '', hostName: profile.name || 'Host', createdAt: FieldValue.serverTimestamp(), scheduledAt: scheduledAt ? Timestamp.fromDate(scheduledAt) : null, status: scheduledAt ? 'scheduled' : 'waiting', meetingType: scheduledAt ? 'scheduled' : 'instant', attendanceTracked: true, controls: { waitingRoom: false, aiSummary: true }, source: 'web', ...(ctx.mode.testMode ? { testRunId: ctx.mode.testRunId } : {}) };
      if (body.parentId) {
        const parent = await meeting(ctx, clean(body.parentId));
        if (!await canManageMeeting(ctx, parent)) throw new AccessError('Only an Admin with meeting access may create breakout rooms.');
        Object.assign(m, { parentId: parent.id, scope: parent.scope, teamId: parent.teamId, audienceIds: parent.audienceIds, meetingType: 'breakout' });
      }
      const batch = db.batch(); batch.create(ref, m); batch.create(db.doc(`meeting_rooms/${ref.id}`), roomData(m)); await batch.commit();
      return response({ id: ref.id, code: m.meetingCode });
    }
    if (kind === 'finalize' && request.method === 'POST') {
      const m = await meeting(ctx, id);
      if (!await canManageMeeting(ctx, m)) throw new AccessError('Only this meeting’s host, its Team Lead, or a Super Admin can end the meeting.');
      const body = await data(request);
      const autoMinutes = body.autoMinutes !== false;
      const breakoutIds = Array.isArray(m.breakouts) ? m.breakouts.map(room => typeof room === 'string' ? room : room?.id).filter(Boolean) : [];
      const authorizedRooms = [id];
      for (const childId of breakoutIds) {
        try {
          const child = await meeting(ctx, clean(childId, 128));
          if (child.hostUid === user.uid) authorizedRooms.push(child.id);
        } catch (error) { console.warn('Could not load a breakout room while ending the meeting.', error?.code || error?.name || 'unknown'); }
      }
      const results = await Promise.allSettled(authorizedRooms.map(roomId => finishMeeting(ctx, roomId, autoMinutes, request.headers.get('authorization'))));
      const mainResult = results[0];
      if (mainResult.status === 'rejected') throw mainResult.reason;
      for (const result of results.slice(1)) if (result.status === 'rejected') console.warn('A breakout transcript could not be finalized.', result.reason?.code || result.reason?.name || 'unknown');
      return response({ ok: true });
    }
    if (kind === 'transcripts' && id && ['GET', 'PUT', 'POST', 'DELETE'].includes(request.method)) {
      const m = await meeting(ctx, id);
      const docLead = await isDocumentLead(ctx);
      const canRead = isSuper(profile) || docLead || (m.transcriptPublished === true && isBoard(profile));
      if (request.method === 'GET') {
        if (!canRead) throw new AccessError('This transcript is awaiting Documentation review and Super Admin approval.');
        const snap = await db.doc(`meetings/${id}/private_transcript/current`).get();
        return response({ transcript: snap.data()?.editedText || snap.data()?.text || '', canEdit: isSuper(profile) || (docLead && m.transcriptPublished !== true) });
      }
      if (request.method === 'PUT') {
        if (!isSuper(profile) && (!docLead || m.transcriptPublished === true)) throw new AccessError('Only the Document Lead may edit an unpublished transcript.');
        const body = await data(request);
        await db.doc(`meetings/${id}/private_transcript/current`).set({ editedText: clean(body.transcript, 500000), updatedAt: FieldValue.serverTimestamp(), editedBy: user.uid }, { merge: true });
        return response({ ok: true });
      }
      if (request.method === 'POST') {
        if (!isSuper(profile)) throw new AccessError('Only a Super Admin may publish transcripts.');
        const transcriptRef = db.doc(`meetings/${id}/private_transcript/current`);
        const transcriptSnap = await transcriptRef.get();
        if (!transcriptSnap.exists || !String(transcriptSnap.data()?.editedText || transcriptSnap.data()?.text || '').trim()) throw new AccessError('This meeting has no transcript text to publish.', 409);
        const batch = db.batch();
        batch.update(db.doc(`meetings/${id}`), { transcriptPublished: true, transcriptStatus: 'published', publishedBy: user.uid, publishedAt: FieldValue.serverTimestamp() });
        batch.set(db.doc(`meeting_rooms/${id}`), { transcriptPublished: true, transcriptStatus: 'published' }, { merge: true });
        for (const uid of SUPER_ADMIN_UIDS) batch.set(db.doc(`notifications/${uid}/items/${id}`), { status: 'published', publishedAt: FieldValue.serverTimestamp() }, { merge: true });
        await batch.commit();
        return response({ ok: true });
      }
      if (!await canManageMeeting(ctx, m) && !(docLead && m.transcriptPublished !== true)) throw new AccessError('You cannot delete this meeting transcript.');
      await db.recursiveDelete(db.doc(`meetings/${id}/transcript_segments`));
      await db.doc(`meetings/${id}/private_transcript/current`).delete().catch(() => {});
      const batch = db.batch();
      batch.update(db.doc(`meetings/${id}`), { transcript: FieldValue.delete(), transcriptPublished: false, transcriptStatus: 'deleted' });
      batch.set(db.doc(`meeting_rooms/${id}`), { transcript: FieldValue.delete(), transcriptPublished: false, transcriptStatus: 'deleted' }, { merge: true });
      for (const uid of SUPER_ADMIN_UIDS) batch.set(db.doc(`notifications/${uid}/items/${id}`), { status: 'deleted' }, { merge: true });
      await batch.commit();
      return response({ ok: true });
    }
    if (kind === 'minutes' && ['GET', 'PUT'].includes(request.method)) {
      const m = await meeting(ctx, id);
      if (request.method === 'GET') {
        if (!canReadMinutes(profile, m)) throw new AccessError('Only Admins and Super Admins may view meeting minutes.');
        delete m.transcript;
        return response({ meeting: m });
      }
      if (!canEditMinutes(profile, m)) throw new AccessError('Only the team lead for this team or a super admin can edit these minutes.');
      if (!isSuper(profile) && !await isAssignedTeamLead(ctx, m.teamId)) throw new AccessError('Only this team’s assigned lead can edit its minutes.');
      const body = await data(request); const patch = {};
      for (const k of ['summary', 'decisions', 'actionItems', 'conclusion', 'summarySource']) if (body[k] !== undefined) patch[k] = clean(body[k], 50000);
      patch.status = 'completed'; const batch = db.batch(); batch.update(db.doc(`meetings/${id}`), patch); batch.update(db.doc(`meeting_rooms/${id}`), { status: 'completed' }); await batch.commit();
      return response({ ok: true });
    }
    if (kind === 'meetings' && ['PATCH', 'DELETE'].includes(request.method)) {
      const m = await meeting(ctx, id);
      if (!await canManageMeeting(ctx, m)) throw new AccessError('Only this meeting’s host, its Team Lead, or a Super Admin can change it.');
      if (request.method === 'DELETE') { await db.recursiveDelete(db.doc(`meetings/${id}`)); await db.doc(`meeting_rooms/${id}`).delete(); return response({ ok: true }); }
      const body = await data(request); const patch = {};
      const keys = ['title', 'agenda', 'participants', 'scheduledAt', 'status', 'controls', 'removed', 'breakouts', 'breakoutsOpen', 'breakoutClosed', 'recording', 'whiteboard'];
      if (Object.keys(body).some(k => !keys.includes(k) && !k.startsWith('controls.'))) throw new AccessError('Meeting scope and ownership cannot be changed.', 400);
      const transcriptPause = body.controls?.transcriptPaused ?? body['controls.transcriptPaused'];
      if (transcriptPause !== undefined && m.hostUid !== user.uid) throw new AccessError('Only the meeting host can pause or resume the transcript.');
      for (const [k, v] of Object.entries(body)) patch[k] = v;
      if (body.scheduledAt) { const date = new Date(body.scheduledAt); if (!Number.isFinite(date.getTime())) throw new AccessError('Invalid date.', 400); patch.scheduledAt = Timestamp.fromDate(date); }
      if (body.status && !['scheduled', 'waiting', 'recording'].includes(body.status)) throw new AccessError('Use the End Meeting action to close a meeting.', 400);
      if (body.status === 'recording' && !m.startedAt) patch.startedAt = FieldValue.serverTimestamp();
      if (body.status === 'processing' && !m.endedAt) patch.endedAt = FieldValue.serverTimestamp();
      const batch = db.batch(); batch.update(db.doc(`meetings/${id}`), patch);
      const publicPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => k in roomData({ ...m, ...patch }) || k.startsWith('controls.')));
      if (Object.keys(publicPatch).length) batch.update(db.doc(`meeting_rooms/${id}`), publicPatch);
      await batch.commit(); return response({ ok: true });
    }
    throw new AccessError('Not found.', 404);
  } catch (error) { return accessResponse(error); }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
