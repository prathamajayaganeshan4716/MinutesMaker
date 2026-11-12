"use client";
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { access } from './access-client';
import { isStaff } from './permissions';
const AuthContext = createContext({ user: null, profile: null, loading: true, accessError: '' });
let currentProfile = null;
export const getCurrentProfile = () => currentProfile;
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true, accessError: '' });
  useEffect(() => {
    let unsubscribeProfile = () => {}; let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const turn = ++generation; unsubscribeProfile(); currentProfile = null;
      if (!user) { setState({ user: null, profile: null, loading: false, accessError: '' }); return; }
      setState({ user, profile: null, loading: true, accessError: '' });
      try {
        await access('account', { method: 'POST' });
      } catch (error) {
        console.warn('Account bootstrap check warning:', error?.message);
      }
      if (generation !== turn) return;
      unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), snap => {
        if (generation !== turn) return;
        currentProfile = snap.exists() ? snap.data() : null;
        setState({ user, profile: currentProfile, loading: false, accessError: currentProfile ? (currentProfile?.isActive === true ? '' : 'This account is temporarily disabled.') : '' });
      }, () => setState({ user, profile: null, loading: false, accessError: 'This account does not currently have access.' }));
    });
    return () => { generation++; unsubscribe(); unsubscribeProfile(); };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
export const displayName = (user, profile) => profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Guest';
export const isAdmin = (user, profile) => !!user && isStaff(profile);
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try { return await signInWithPopup(auth, provider); }
  catch (error) { if (error.code === 'auth/popup-blocked') return signInWithRedirect(auth, provider); throw error; }
}
export const signInWithEmail = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export async function registerWithEmail(name, email, password) {
  const mode = await fetch('/api/access/status', { cache: 'no-store' }).then(r => r.json());
  if (mode.testMode) throw new Error('Registration is paused during testing. Use a demo account.');
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name) await updateProfile(result.user, { displayName: name });
  return result;
}
export const signOut = () => fbSignOut(auth);
