/**
 * MOTO NAVAR – Firebase bootstrap.
 * The ONLY file that imports the Firebase SDK. To upgrade the SDK,
 * change the version number (13.4.0) in the four import URLs below.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  OAuthCredential,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  linkWithCredential,
  linkWithPopup,
  unlink,
  signOut,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js";
import { firebaseConfig, siteSettings } from "./firebase-config.js";

export const isFirebaseConfigured = !Object.values(firebaseConfig).some((v) =>
  String(v).includes("YOUR_")
);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.useDeviceLanguage();
export const db = getFirestore(app);
// Must match the region in functions/index.js
export const functions = getFunctions(app, "europe-west1");
export { siteSettings };

export {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  OAuthCredential,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  linkWithCredential,
  linkWithPopup,
  unlink,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  httpsCallable,
};
