"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, ShieldCheck, Users, RefreshCw, Plus, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { access } from '@/lib/access-client';
import { isStaff, isSuper, isTeamHead, SUPER_ADMIN_UIDS, roleLabel } from '@/lib/permissions';
import { useToast } from './Providers';
import { Avatar, Spinner } from './ui';

export default function Organization({ management = false }) {
  const { user, profile } = useAuth(); const toast = useToast();
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const [paused, setPaused] = useState(false); const [boardName, setBoardName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [account, setAccount] = useState({ name: '', email: '', password: '', role: 'member', teamId: '' });
  const [creatingTeam, setCreatingTeam] = useState(false); const [creatingAccount, setCreatingAccount] = useState(false);
  const load = useCallback(async () => {
    try { const next = await access('organization'); setData(next); setBoardName(next.boardName); setError(''); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { if (user && profile?.isActive) load(); }, [user, profile, load]);
  if (management && !isStaff(profile)) return <div className="p-8">Admin access is required.</div>;
  if (!data) return <div className="grid h-full place-items-center p-8">{error || <Spinner />}</div>;
  const activeUsers = data.users.filter(p => p.isActive);
  const teams = Array.isArray(data.teams) ? data.teams : [];
  const createTeam = async (e) => {
    e.preventDefault(); if (!isSuper(profile) || teamName.trim().length < 2) return;
    setCreatingTeam(true);
    try { await access('teams', { method: 'POST', body: { name: teamName.trim() } }); setTeamName(''); await load(); toast('Team created', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    finally { setCreatingTeam(false); }
  };
  const deleteTeam = async (team) => {
    if (!isSuper(profile) || !confirm(`Delete ${team.name || team.id}? Teams with members or meeting records must be cleared first.`)) return;
    try { await access(`teams/${team.id}`, { method: 'DELETE' }); await load(); toast('Team deleted', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };
  const createAccount = async (e) => {
    e.preventDefault(); if (!isSuper(profile)) return;
    setCreatingAccount(true);
    try {
      await access('users', { method: 'POST', body: {
        name: account.name.trim(), email: account.email.trim(), password: account.password, role: account.role,
        teamId: ['member', 'guest'].includes(account.role) ? account.teamId || (account.role === 'member' ? teams[0]?.id || '' : '') : '',
      } });
      setAccount({ name: '', email: '', password: '', role: 'member', teamId: '' }); await load(); toast('Account created', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setCreatingAccount(false); }
  };
  return <div className="mx-auto max-w-[1240px] px-4 py-7 md:px-8 md:py-9">
    <div className="flex flex-wrap items-center gap-4">
      <div><h1 className="font-display text-3xl font-extrabold text-ink">{management ? 'Accounts & access' : 'Teams & board'}</h1>
        <p className="mt-2 text-sm text-muted">Teams and board membership follow each person’s assigned role.</p></div>
      <button className="btn btn-ghost ml-auto" onClick={load}><RefreshCw size={16} /> Refresh</button>
    </div>
    {error && <p role="alert" className="mt-4 text-rec">{error}</p>}
    {isSuper(profile) && <form onSubmit={createTeam} className="card mt-6 flex flex-wrap items-end gap-3 p-5">
      <label className="grid min-w-[220px] flex-1 gap-1 text-sm text-muted">New team name<input className="input" value={teamName} maxLength={64} onChange={e => setTeamName(e.target.value)} placeholder="Documentation" required /></label>
      <button className="btn btn-primary" type="submit" disabled={creatingTeam || teamName.trim().length < 2}>{creatingTeam ? <Spinner size={15} /> : <Plus size={16} />} Add team</button>
    </form>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[...teams].sort((a,b) => (a.name || a.id).localeCompare(b.name || b.id)).map(team => {
        const members = activeUsers.filter(p => p.teamId === team.id);
        return <TeamCard key={team.id} team={team} members={members} users={activeUsers} actor={profile} reload={load} onDelete={() => deleteTeam(team)} />;
      })}
    </div>
    <section className="card mt-6 p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-3"><Crown size={22} className="text-brand" /><h2 className="text-xl font-bold text-ink">{data.boardName}</h2><span className="text-sm text-muted">{data.board.length} active members</span></div>
      <p className="mt-2 text-sm text-muted">Admins and Super Admins are included automatically. Ordinary members and guests cannot join board meetings.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.board.map(p => <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-3"><Avatar name={p.name} size={36} /><div><div className="font-semibold text-ink">{p.name}</div><div className="text-xs text-muted">{roleLabel(p)}{p.teamId ? ` · Team ${p.teamId.slice(-1)}` : ''}</div></div></div>)}</div>
      {isStaff(profile) && <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={async e => { e.preventDefault(); try { await access('board', { method: 'PATCH', body: { name: boardName } }); await load(); toast('Board details updated', 'success'); } catch (err) { toast(err.message, 'error'); } }}>
        <label className="grid gap-1 text-sm text-muted">Board name<input className="input" value={boardName} maxLength={120} onChange={e => setBoardName(e.target.value)} required /></label><button className="btn btn-ghost" type="submit">Save board name</button>
      </form>}
    </section>
    {management && isSuper(profile) && <TranscriptApprovalQueue />}
    {management && <section className="card mt-6 p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-3"><ShieldCheck size={22} className="text-brand" /><h2 className="text-xl font-bold text-ink">User access</h2><label className="ml-auto flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} /> Show paused accounts</label></div>
      <p className="mt-2 text-sm text-muted">Only Super Admins can add accounts, change roles, assign team leads, or remove accounts. Admins can view the member directory.</p>
      {isSuper(profile) && <form className="mt-5 grid gap-3 rounded-xl border border-line bg-surface-2 p-4 md:grid-cols-2" onSubmit={createAccount}>
        <div className="md:col-span-2 flex items-center gap-2 font-semibold text-ink"><UserPlus size={18} className="text-brand" /> Add account</div>
        <label className="grid gap-1 text-sm text-muted">Name<input className="input" value={account.name} maxLength={120} onChange={e => setAccount(a => ({ ...a, name: e.target.value }))} required /></label>
        <label className="grid gap-1 text-sm text-muted">Email<input className="input" type="email" value={account.email} onChange={e => setAccount(a => ({ ...a, email: e.target.value }))} required /></label>
        <label className="grid gap-1 text-sm text-muted">Initial password<input className="input" type="password" minLength={10} value={account.password} onChange={e => setAccount(a => ({ ...a, password: e.target.value }))} autoComplete="new-password" required /><span className="text-xs">At least 10 characters; share it privately with the member.</span></label>
        <label className="grid gap-1 text-sm text-muted">Role<select className="input" value={account.role} onChange={e => setAccount(a => ({ ...a, role: e.target.value, teamId: e.target.value === 'member' ? teams[0]?.id || '' : '' }))}>{['member', 'guest', 'admin'].map(role => <option key={role} value={role}>{roleLabel({ role })}</option>)}</select></label>
        {['member', 'guest'].includes(account.role) && <label className="grid gap-1 text-sm text-muted">Team{account.role === 'guest' ? ' (optional)' : ''}<select className="input" value={account.teamId} onChange={e => setAccount(a => ({ ...a, teamId: e.target.value }))} required={account.role === 'member'}><option value="">{account.role === 'guest' ? 'No team assigned' : 'Select a team'}</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        <div className="flex items-end"><button className="btn btn-primary" type="submit" disabled={creatingAccount || (account.role === 'member' && !teams.length)}>{creatingAccount ? <Spinner size={15} /> : <Plus size={16} />} Create account</button></div>
      </form>}
      <div className="mt-4 divide-y divide-line">{data.users.filter(p => paused || p.isActive).map(p => <AccountRow key={`${p.id}-${p.role}-${p.teamId}-${p.isActive}`} person={p} teams={teams} actor={profile} reload={load} />)}</div>
    </section>}
  </div>;
}
function TeamCard({ team, members, users, actor, reload, onDelete }) {
  const toast = useToast();
  const [leadUid, setLeadUid] = useState(team.leadUid || '');
  const [memberUid, setMemberUid] = useState('');
  const [busy, setBusy] = useState('');
  const isSuperAdmin = isSuper(actor);
  const lead = users.find(person => person.id === team.leadUid);
  const candidates = users.filter(person => person.isActive && person.role === 'admin' && (!isTeamHead(person) || person.id === team.leadUid));
  const availableMembers = users.filter(person => person.isActive && ['member', 'guest'].includes(person.role) && person.teamId !== team.id);
  const teamMembers = members.filter(person => ['member', 'guest'].includes(person.role));
  const saveLead = async () => {
    setBusy('lead');
    try { await access(`teams/${team.id}`, { method: 'PATCH', body: { leadUid } }); await reload(); toast(leadUid ? 'Team lead assigned' : 'Team lead removed', 'success'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(''); }
  };
  const addMember = async () => {
    const person = availableMembers.find(item => item.id === memberUid);
    if (!person) return;
    const previous = person.teamId ? ` They will be moved from ${person.teamId}.` : '';
    if (!confirm(`Add ${person.name || person.email} as a member of ${team.name || team.id}?${previous}`)) return;
    setBusy(person.id);
    try { await access(`users/${person.id}`, { method: 'PATCH', body: { role: 'member', teamId: team.id } }); setMemberUid(''); await reload(); toast('Member added to team', 'success'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(''); }
  };
  const removeMember = async person => {
    if (!confirm(`Remove ${person.name || person.email} from ${team.name || team.id}? Their account will remain as a Guest with no team access.`)) return;
    setBusy(person.id);
    try { await access(`users/${person.id}`, { method: 'PATCH', body: { role: 'guest', teamId: '' } }); await reload(); toast('Member removed from team', 'success'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(''); }
  };
  return <section className="card p-5">
    <div className="flex items-start justify-between gap-3"><Users size={23} className="text-brand" />{isSuperAdmin && <button type="button" className="btn btn-ghost h-8 w-8 !p-0 text-rec" title="Delete empty team" aria-label={`Delete ${team.name || team.id}`} disabled={!!team.leadUid || members.length > 0} onClick={onDelete}><Trash2 size={15} /></button>}</div>
    <div className="mt-3 flex items-center gap-2"><h2 className="text-lg font-bold text-ink">{team.name || team.id}</h2>{team.isDocumentation && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">DOCUMENTS</span>}</div>
    <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Team lead</div>
    <p className="mt-1 text-sm font-medium text-ink">{lead?.name || (team.leadUid ? 'Assigned account unavailable' : 'Not assigned')}</p>
    {isSuperAdmin && <div className="mt-3 flex gap-2"><select className="input min-w-0 flex-1" value={leadUid} onChange={event => setLeadUid(event.target.value)} aria-label={`Team lead for ${team.name || team.id}`}><option value="">No team lead</option>{candidates.map(person => <option key={person.id} value={person.id}>{person.name || person.email}</option>)}</select><button className="btn btn-ghost" onClick={saveLead} disabled={busy !== '' || leadUid === (team.leadUid || '')}>{busy === 'lead' ? 'Saving…' : 'Save'}</button></div>}
    <div className="mt-4 flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wide text-muted">Members</div>{isSuperAdmin && <span className="text-xs text-muted">{teamMembers.length}</span>}</div>
    <ul className="mt-2 space-y-2 text-sm text-ink-2">{teamMembers.map(person => <li key={person.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{person.name || person.email}{person.role === 'guest' ? ' · Guest' : ''}</span>{isSuperAdmin && <button className="rounded p-1 text-rec hover:bg-rec/10" title={`Remove ${person.name || 'member'} from team`} aria-label={`Remove ${person.name || 'member'} from ${team.name || team.id}`} disabled={busy !== ''} onClick={() => removeMember(person)}><Trash2 size={14} /></button>}</li>)}</ul>
    {!teamMembers.length && <p className="mt-2 text-sm text-muted">No members to display.</p>}
    {isSuperAdmin && <div className="mt-4 flex gap-2"><select className="input min-w-0 flex-1" value={memberUid} onChange={event => setMemberUid(event.target.value)} aria-label={`Choose a member to add to ${team.name || team.id}`}><option value="">Choose account to add</option>{availableMembers.map(person => <option key={person.id} value={person.id}>{person.name || person.email}{person.teamId ? ` · from ${person.teamId}` : ''}</option>)}</select><button className="btn btn-ghost" disabled={!memberUid || busy !== ''} onClick={addMember}>{busy && busy !== 'lead' ? 'Adding…' : <><Plus size={15} /> Add</>}</button></div>}
  </section>;
}
function TranscriptApprovalQueue() {
  const [items, setItems] = useState([]); const [busy, setBusy] = useState(''); const toast = useToast();
  const load = useCallback(async () => { try { const result = await access('notifications'); setItems(result.notifications || []); } catch (error) { console.warn('Could not load transcript notifications:', error?.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const publish = async item => {
    if (!confirm(`Publish the transcript for “${item.title}”? It will become visible to Admins and Board Members.`)) return;
    setBusy(item.id);
    try { await access(`transcripts/${item.id}`, { method: 'POST', body: {} }); setItems(current => current.filter(value => value.id !== item.id)); toast('Transcript published', 'success'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(''); }
  };
  const dateLabel = value => {
    const date = value?.toDate?.() || (value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null);
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Time unavailable';
  };
  return <section className="card mt-6 p-5"><h2 className="text-xl font-bold text-ink">Transcript review</h2><p className="mt-1 text-sm text-muted">Review each transcript before publishing it to Admins and Board Members.</p>{items.length ? <div className="mt-4 space-y-4">{items.map(item => <article key={item.id} className="rounded-xl border border-line p-4"><h3 className="font-semibold text-ink">{item.title || 'Meeting'} · {item.teamId || 'Board'}</h3><p className="mt-1 text-xs text-muted">{item.scope === 'board' ? 'Board meeting' : 'Team meeting'}{item.hostName ? ` · Hosted by ${item.hostName}` : ''}{item.meetingCode ? ` · Code ${item.meetingCode}` : ''} · Ended {dateLabel(item.endedAt)}</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm text-ink-2">{item.transcript || 'No transcript text was captured.'}</pre><div className="mt-3 flex flex-wrap gap-2"><Link className="btn btn-ghost" href={`/minutes/${item.id}`}>Review meeting record</Link><button className="btn btn-primary" disabled={busy === item.id || !item.transcript?.trim()} onClick={() => publish(item)}>{busy === item.id ? 'Publishing…' : 'Publish transcript'}</button></div></article>)}</div> : <p className="mt-4 text-sm text-muted">No transcripts are awaiting approval.</p>}</section>;
}
function AccountRow({ person, teams, actor, reload }) {
  const toast = useToast(); const [role, setRole] = useState(person.role === 'team_lead' ? 'admin' : person.role); const [teamId, setTeamId] = useState(person.teamId || ''); const [busy, setBusy] = useState(false);
  const protectedAccount = SUPER_ADMIN_UIDS.includes(person.id) || person.role === 'super_admin';
  const editable = isSuper(actor) && !protectedAccount;
  const save = async () => {
    setBusy(true);
    try { await access(`users/${person.id}`, { method: 'PATCH', body: { role, teamId } }); await reload(); toast('Access updated', 'success'); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!isSuper(actor) || person.id === actor?.uid || protectedAccount) return;
    if (!confirm(`Permanently delete ${person.name || person.email}'s sign-in account? Their past meeting records will remain.`)) return;
    setBusy(true);
    try { await access(`users/${person.id}`, { method: 'DELETE' }); await reload(); toast('Account deleted', 'success'); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-center gap-3 py-4">
    <Avatar name={person.name} size={34} /><div className="min-w-0 flex-1"><div className="font-semibold text-ink">{person.name}{!person.isActive && <span className="ml-2 text-xs text-muted">Paused for testing</span>}</div><div className="break-all text-xs text-muted">{person.email}</div></div>
    <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">{roleLabel(person)}</span>
    {editable && person.isActive && <>
      <label className="sr-only" htmlFor={`role-${person.id}`}>Role for {person.name}</label><select id={`role-${person.id}`} className="input w-36" value={role} onChange={e => { const nextRole = e.target.value; setRole(nextRole); setTeamId(nextRole === 'member' ? teamId || teams[0]?.id || '' : nextRole === 'admin' && person.isTeamHead ? person.teamId || '' : ''); }}>{['admin','member','guest'].map(r => <option key={r} value={r}>{roleLabel({role:r})}</option>)}</select>
      {['member','guest'].includes(role) && <><label className="sr-only" htmlFor={`team-${person.id}`}>Team for {person.name}</label><select id={`team-${person.id}`} className="input w-32" value={teamId} onChange={e => setTeamId(e.target.value)}>{role === 'guest' && <option value="">No team</option>}{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></>}
      <button className="btn btn-ghost" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </>}
    {isSuper(actor) && person.id !== actor?.uid && !protectedAccount && <button type="button" className="btn btn-ghost text-rec" disabled={busy} onClick={remove} title="Delete member account"><Trash2 size={15} /> Delete</button>}
  </div>;
}
