"use client";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Public web config of the existing Minutes Maker Firebase project (same data as the mobile app).
const firebaseConfig = {
  apiKey: "AIzaSyAICwfXkfBfwFJinlVZWBqScnAHuCEmdkg",
  appId: "1:10573771159:web:9674dfd16279ebdc2454d2",
  messagingSenderId: "10573771159",
  projectId: "minutes-maker-1013",
  authDomain: "minutes-maker-1013.firebaseapp.com",
  storageBucket: "minutes-maker-1013.firebasestorage.app",
  measurementId: "G-EJ22MHHPLK",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
