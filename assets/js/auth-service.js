/**
 * MOTO NAVAR – Authentication service.
 * Real Firebase Authentication for Google, Facebook, Microsoft, Apple and
 * Email/Password, with persistence, redirect fallback, account linking and
 * Firestore customer-profile sync. No simulated logins anywhere.
 */
import {
  auth,
  db,
  siteSettings,
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
  linkWithCredential,
  linkWithPopup,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "./firebase.js";

/* ------------------------------------------------------------------ */
/* Providers                                                          */
/* ------------------------------------------------------------------ */

export const PROVIDERS = {
  "google.com": {
    label: "Google",
    create() {
      const p = new GoogleAuthProvider();
      p.addScope("email");
      p.addScope("profile");
      p.setCustomParameters({ prompt: "select_account" });
      return p;
    },
    credentialFromError: (e) => GoogleAuthProvider.credentialFromError(e),
  },
  "facebook.com": {
    label: "Facebook",
    create() {
      const p = new FacebookAuthProvider();
      p.addScope("email");
      p.addScope("public_profile");
      return p;
    },
    credentialFromError: (e) => FacebookAuthProvider.credentialFromError(e),
  },
  "microsoft.com": {
    label: "Microsoft",
    create() {
      const p = new OAuthProvider("microsoft.com");
      p.addScope("openid");
      p.addScope("email");
      p.addScope("profile");
      // "common" = work/school accounts AND personal accounts
      // (Hotmail, Outlook.com, Live, MSN).
      p.setCustomParameters({ prompt: "select_account", tenant: "common" });
      return p;
    },
    // Firebase cannot re-use Microsoft credentials (linkWithCredential is
    // not supported for microsoft.com), so linking uses linkWithPopup.
    credentialFromError: () => null,
  },
  "apple.com": {
    label: "Apple",
    create() {
      const p = new OAuthProvider("apple.com");
      p.addScope("email");
      p.addScope("name");
      return p;
    },
    credentialFromError: (e) => OAuthProvider.credentialFromError(e),
  },
  password: {
    label: "Email & password",
    create: null,
    credentialFromError: () => null,
  },
};

export const providerLabel = (id) => PROVIDERS[id]?.label || id;

/* ------------------------------------------------------------------ */
/* Small storage helpers (wrapped: storage can be unavailable)         */
/* ------------------------------------------------------------------ */

const store = {
  get(area, key) {
    try { return JSON.parse(window[area].getItem(key)); } catch { return null; }
  },
  set(area, key, value) {
    try { window[area].setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(area, key) {
    try { window[area].removeItem(key); } catch { /* ignore */ }
  },
};

const REMEMBER_KEY = "mn.rememberMe";
const PENDING_LINK_KEY = "mn.pendingLink";
const PENDING_REDIRECT_KEY = "mn.pendingRedirect";
const PENDING_LINK_TTL = 15 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Persistence ("Remember me")                                        */
/* ------------------------------------------------------------------ */

export function getRememberPreference() {
  const v = store.get("localStorage", REMEMBER_KEY);
  return v === null ? true : !!v;
}

export async function applyPersistence(remember) {
  store.set("localStorage", REMEMBER_KEY, !!remember);
  // local   → stays signed in after the browser is closed
  // session → signed out when the tab/browser is closed
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

/* ------------------------------------------------------------------ */
/* Account linking (same email, different provider)                    */
/* ------------------------------------------------------------------ */

export function getPendingLink() {
  const p = store.get("sessionStorage", PENDING_LINK_KEY);
  if (!p) return null;
  if (Date.now() - p.createdAt > PENDING_LINK_TTL) {
    clearPendingLink();
    return null;
  }
  return p;
}

export function clearPendingLink() {
  store.remove("sessionStorage", PENDING_LINK_KEY);
}

function savePendingLink(providerId, error) {
  const cred = PROVIDERS[providerId]?.credentialFromError(error) || null;
  const pending = {
    providerId,
    email: error.customData?.email || "",
    credential: cred ? cred.toJSON() : null,
    createdAt: Date.now(),
  };
  store.set("sessionStorage", PENDING_LINK_KEY, pending);
  return pending;
}

/**
 * After the customer signs in with their ORIGINAL method, attach the new
 * provider. Returns { linked, linkNeeded } where linkNeeded means a popup
 * (user click) is required, e.g. for Microsoft.
 */
async function resolvePendingLink(user) {
  const pending = getPendingLink();
  if (!pending) return { linked: null, linkNeeded: null };

  const alreadyLinked = user.providerData.some((p) => p.providerId === pending.providerId);
  if (alreadyLinked) {
    clearPendingLink();
    return { linked: null, linkNeeded: null };
  }
  if (pending.email && user.email && pending.email.toLowerCase() !== user.email.toLowerCase()) {
    // Signed in to a different account: do not link silently.
    clearPendingLink();
    return { linked: null, linkNeeded: null };
  }

  if (pending.credential) {
    try {
      const credential = OAuthCredential.fromJSON(pending.credential);
      await linkWithCredential(user, credential);
      clearPendingLink();
      return { linked: pending.providerId, linkNeeded: null };
    } catch (err) {
      if (["auth/provider-already-linked", "auth/credential-already-in-use"].includes(err.code)) {
        clearPendingLink();
        return { linked: null, linkNeeded: null };
      }
      // Credential expired etc. → fall back to an explicit popup link.
    }
  }
  return { linked: null, linkNeeded: pending.providerId };
}

/** Explicit, user-initiated linking (must be called from a click). */
export async function linkProvider(providerId) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Not signed in"), { code: "auth/no-current-user" });
  const result = await linkWithPopup(user, PROVIDERS[providerId].create());
  if (getPendingLink()?.providerId === providerId) clearPendingLink();
  await upsertUserProfile(result.user);
  return result.user;
}

/* ------------------------------------------------------------------ */
/* Sign-in flows                                                      */
/* ------------------------------------------------------------------ */

function prefersRedirect() {
  if (siteSettings.forceRedirectFlow) return true;
  // In-app browsers (Facebook/Instagram/etc.) cannot open popups reliably.
  return /FBAN|FBAV|Instagram|Line\/|Twitter/i.test(navigator.userAgent);
}

function primaryProviderOf(user, fallback) {
  return fallback || user.providerData[0]?.providerId || "password";
}

async function finalizeSignIn(result, providerId) {
  const user = result.user;
  const linkState = await resolvePendingLink(user);
  await upsertUserProfile(user, { provider: primaryProviderOf(user, providerId) });
  return { user, ...linkState };
}

function decorateError(err, providerId) {
  if (err?.code === "auth/account-exists-with-different-credential") {
    err.pendingLink = savePendingLink(providerId, err);
  }
  err.providerId = providerId;
  return err;
}

export async function signInWithProvider(providerId, { remember = true } = {}) {
  await applyPersistence(remember);
  const provider = PROVIDERS[providerId].create();

  if (prefersRedirect()) {
    store.set("sessionStorage", PENDING_REDIRECT_KEY, providerId);
    await signInWithRedirect(auth, provider);
    return { redirecting: true };
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return await finalizeSignIn(result, providerId);
  } catch (err) {
    if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      store.set("sessionStorage", PENDING_REDIRECT_KEY, providerId);
      await signInWithRedirect(auth, provider);
      return { redirecting: true };
    }
    throw decorateError(err, providerId);
  }
}

/** Call once on page load to finish a redirect sign-in (if any). */
export async function completeRedirectSignIn() {
  const providerId = store.get("sessionStorage", PENDING_REDIRECT_KEY);
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    return await finalizeSignIn(result, providerId || undefined);
  } catch (err) {
    throw decorateError(err, providerId);
  } finally {
    store.remove("sessionStorage", PENDING_REDIRECT_KEY);
  }
}

export async function signInWithEmail(email, password, { remember = true } = {}) {
  await applyPersistence(remember);
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return finalizeSignIn(result, "password");
}

export async function registerWithEmail({ fullName, email, phone, password }) {
  await applyPersistence(true);
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = result.user;
  await updateProfile(user, { displayName: fullName.trim() });
  try {
    await sendEmailVerification(user, { url: new URL(siteSettings.accountUrl, location.href).href });
  } catch {
    // If the continue URL's domain is not authorized, send without it.
    try { await sendEmailVerification(user); } catch { /* reported on account page */ }
  }
  await upsertUserProfile(user, { fullName: fullName.trim(), phone: (phone || "").trim(), provider: "password" });
  return { user };
}

export async function requestPasswordReset(email) {
  await sendPasswordResetEmail(auth, email.trim(), {
    url: new URL(siteSettings.loginUrl, location.href).href,
  }).catch(async (err) => {
    if (err.code === "auth/unauthorized-continue-uri" || err.code === "auth/invalid-continue-uri") {
      return sendPasswordResetEmail(auth, email.trim());
    }
    throw err;
  });
}

export async function logout() {
  clearPendingLink();
  await signOut(auth);
}

export { EmailAuthProvider };

/* ------------------------------------------------------------------ */
/* Firestore customer profile                                          */
/* ------------------------------------------------------------------ */

/**
 * Creates users/{uid} on first sign-in. On later sign-ins it only updates
 * lastLogin / providers and fills fields that are still EMPTY – it never
 * overwrites information the customer has already saved.
 * The role is always "customer"; Security Rules reject anything else.
 */
export async function upsertUserProfile(user, extras = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const providers = user.providerData.map((p) => p.providerId);
  const providerPhoto = user.photoURL || user.providerData.find((p) => p.photoURL)?.photoURL || "";
  const providerName = user.displayName || user.providerData.find((p) => p.displayName)?.displayName || "";

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      fullName: extras.fullName || providerName || "",
      email: user.email || "",
      phone: extras.phone || user.phoneNumber || "",
      photoURL: providerPhoto,
      provider: extras.provider || providers[0] || "password",
      providers,
      role: "customer",
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
    return;
  }

  const data = snap.data();
  const updates = { lastLogin: serverTimestamp(), providers };
  if (!data.fullName && (extras.fullName || providerName)) updates.fullName = extras.fullName || providerName;
  if (!data.phone && (extras.phone || user.phoneNumber)) updates.phone = extras.phone || user.phoneNumber;
  if (!data.photoURL && providerPhoto) updates.photoURL = providerPhoto;
  if (!data.email && user.email) updates.email = user.email;
  await updateDoc(ref, updates);
}
