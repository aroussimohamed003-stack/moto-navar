/**
 * MOTO NAVAR – Firebase web configuration
 * ------------------------------------------------------------------
 * Paste the values from: Firebase Console → Project settings → General
 * → "Your apps" → Web app → SDK setup and configuration → Config.
 *
 * These values are PUBLIC identifiers (they ship to every browser).
 * They are NOT secrets. Never put OAuth client secrets, Apple private
 * keys or service-account JSON in this file or anywhere in the website.
 * Secrets belong only in the Firebase Console (see AUTH-SETUP-GUIDE.md).
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/** Site navigation settings used by the auth pages. */
export const siteSettings = {
  homeUrl: "index.html",
  loginUrl: "login.html",
  accountUrl: "account.html",
  // Where to send a customer after sign-in when no ?next= is given.
  afterLoginUrl: "account.html",
  // true  → always use full-page redirect for social sign-in
  // false → use popups, falling back to redirect if the popup is blocked
  forceRedirectFlow: false,
};
