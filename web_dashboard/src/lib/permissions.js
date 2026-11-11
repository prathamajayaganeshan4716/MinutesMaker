export const SUPER_ADMINS = ['prathamaj@karunya.edu.in', 'matrixkarunya@gmail.com'];
export const SUPER_ADMIN_UIDS = ['YhEBwaC6RKUmLQBE7ykLeAL9eGu2', 'n6u1hZp9WZSHP1jV3lFJ2ETIlur2'];

// `team_lead` is accepted only as a compatibility alias while existing accounts
// are migrated. Team leadership is otherwise an assignment on the team record.
export const ROLES = ['super_admin', 'admin', 'member', 'guest'];
export const TEAMS = ['team-1', 'team-2', 'team-3', 'team-4'];
export const active = (profile) => profile?.isActive === true;
export const isSuper = (profile) => active(profile) && profile.role === 'super_admin' && SUPER_ADMINS.includes(String(profile.email || '').toLowerCase());
export const isStaff = (profile) => active(profile) && (
  ['admin', 'team_lead'].includes(profile.role) || isSuper(profile)
);
export const isAdmin = (profile) => isStaff(profile);
export const isTeamHead = (profile) => isStaff(profile) && (profile.role === 'team_lead' || profile.isTeamHead === true);
export const isDocumentLead = (profile) => isTeamHead(profile) && (profile.isDocumentLead === true || profile.documentLeadTeam === true);
export const isBoard = (profile) => isStaff(profile);
export const roleLabel = (profile) => (profile?.role === 'super_admin' && !isSuper(profile) ? 'Admin' : ({ super_admin: 'Super Admin', admin: 'Admin', team_lead: 'Admin', member: 'Member', guest: 'Guest' })[profile?.role]) || 'Guest';

export const canCreate = (profile) => isStaff(profile);

export function canJoin(profile, meeting) {
  if (!active(profile) || !meeting) return false;
  if (isStaff(profile)) return true;
  return ['member', 'guest'].includes(profile.role)
    && meeting.scope === 'team'
    && !!profile.teamId
    && profile.teamId === meeting.teamId;
}

// Admins can view meeting minutes. The transcript remains separately protected
// until publication by both the API and Firestore rules.
export function canReadMinutes(profile, meeting) {
  return active(profile) && !!meeting && isStaff(profile);
}

export function canEditMinutes(profile, meeting) {
  if (!active(profile) || !meeting) return false;
  if (isSuper(profile)) return true;
  return isTeamHead(profile) && meeting.scope === 'team' && !!profile.teamId && profile.teamId === meeting.teamId;
}

export const canManage = (profile, user, meeting) => {
  if (!isStaff(profile) || !meeting) return false;
  if (isSuper(profile) || meeting.hostUid === user?.uid) return true;
  return isTeamHead(profile) && meeting.scope === 'team' && !!profile.teamId && profile.teamId === meeting.teamId;
};

export const audience = (scope, teamId) => scope === 'board' ? ['board'] : scope === 'team' ? [`team:${teamId}`] : ['legacy'];
export const ROOM_FIELDS = ['meetingCode', 'title', 'hostUid', 'hostName', 'hostEmail', 'scope', 'teamId', 'audienceIds', 'status', 'scheduledAt', 'createdAt', 'startedAt', 'endedAt', 'controls', 'removed', 'whiteboard', 'breakouts', 'breakoutsOpen', 'parentId', 'breakoutClosed', 'recording', 'meetingType', 'attendanceTracked', 'boardStrength', 'transcriptStatus', 'transcriptPublished'];
export const roomData = (meeting) => Object.fromEntries(ROOM_FIELDS.filter((key) => meeting[key] !== undefined).map((key) => [key, meeting[key]]));
