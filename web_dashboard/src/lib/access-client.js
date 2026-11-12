import { auth } from './firebase';
export async function access(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/access/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${token}` },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store',
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
  return body || { ok: true };
}
