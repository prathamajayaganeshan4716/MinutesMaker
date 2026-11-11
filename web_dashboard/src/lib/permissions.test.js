import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreate, canEditMinutes, canJoin, canManage, canReadMinutes, isStaff, roleLabel } from './permissions.js';

const teamMeeting = { scope: 'team', teamId: 'team-docs', hostUid: 'host' };
const otherTeamMeeting = { scope: 'team', teamId: 'team-tech', hostUid: 'other-host' };
const boardMeeting = { scope: 'board', teamId: '', hostUid: 'board-host' };
const member = { role: 'member', teamId: 'team-docs', isActive: true };
const guest = { role: 'guest', teamId: 'team-docs', isActive: true };
const admin = { role: 'admin', isActive: true };
const teamHead = { role: 'admin', teamId: 'team-docs', isTeamHead: true, isActive: true };
const superAdmin = { role: 'super_admin', email: 'prathamaj@karunya.edu.in', isActive: true };

test('members and guests have join-only access to their assigned team meetings', () => {
  for (const profile of [member, guest]) {
    assert.equal(canJoin(profile, teamMeeting), true);
    assert.equal(canJoin(profile, otherTeamMeeting), false);
    assert.equal(canJoin(profile, boardMeeting), false);
    assert.equal(canCreate(profile), false);
    assert.equal(canReadMinutes(profile, teamMeeting), false);
    assert.equal(canEditMinutes(profile, teamMeeting), false);
  }
  assert.equal(canJoin({ ...guest, teamId: '' }, teamMeeting), false);
});

test('admins can create, join and view all minutes but cannot edit other team minutes', () => {
  assert.equal(isStaff(admin), true);
  assert.equal(canCreate(admin), true);
  assert.equal(canJoin(admin, boardMeeting), true);
  assert.equal(canJoin(admin, otherTeamMeeting), true);
  assert.equal(canReadMinutes(admin, otherTeamMeeting), true);
  assert.equal(canEditMinutes(admin, otherTeamMeeting), false);
  assert.equal(canManage(admin, { uid: 'admin' }, { ...teamMeeting, hostUid: 'admin' }), true);
});

test('a team lead designation grants management only inside its assigned team', () => {
  assert.equal(canEditMinutes(teamHead, teamMeeting), true);
  assert.equal(canEditMinutes(teamHead, otherTeamMeeting), false);
  assert.equal(canManage(teamHead, { uid: 'head' }, teamMeeting), true);
  assert.equal(canManage(teamHead, { uid: 'head' }, otherTeamMeeting), false);
  assert.equal(canManage({ role: 'team_lead', teamId: 'team-docs', isActive: true }, { uid: 'head' }, teamMeeting), true);
});

test('super admins retain full meeting and minutes control', () => {
  assert.equal(canManage(superAdmin, { uid: 'super' }, otherTeamMeeting), true);
  assert.equal(canEditMinutes(superAdmin, teamMeeting), true);
  assert.equal(canEditMinutes(superAdmin, boardMeeting), true);
});

test('disabled accounts cannot join and legacy team leads are presented as Admins', () => {
  assert.equal(canJoin({ ...member, isActive: false }, teamMeeting), false);
  assert.equal(roleLabel({ role: 'team_lead' }), 'Admin');
});

test('an unapproved super_admin profile receives no elevated client permissions', () => {
  const unapprovedSuper = { role: 'super_admin', email: 'someone@example.com', isActive: true };
  assert.equal(isStaff(unapprovedSuper), false);
  assert.equal(canCreate(unapprovedSuper), false);
  assert.equal(canReadMinutes(unapprovedSuper, teamMeeting), false);
});
