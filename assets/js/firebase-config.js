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
  apiKey: "AIzaSyCTjd75Q0kIeYXlFw8D790Oqs2DC4vRh7A",
  authDomain: "moto-navar.firebaseapp.com",
  projectId: "moto-navar",
  storageBucket: "moto-navar.firebasestorage.app",
  messagingSenderId: "861282986950",
  appId: "1:861282986950:web:a30410821d6b7bb9b1e0c7",
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
