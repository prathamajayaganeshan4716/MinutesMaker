"use client";
import { auth } from './firebase';
import { getCurrentProfile } from './auth';
import { isSuper } from './permissions';
export { SUPER_ADMINS } from './permissions';
export const SUPER_ADMIN = 'prathamaj@karunya.edu.in, matrixkarunya@gmail.com';
export const isSuperAdmin = (email) => !!email && email.toLowerCase() === auth.currentUser?.email?.toLowerCase() && isSuper(getCurrentProfile());
