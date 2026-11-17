/**
 * MOTO NAVAR – private page guard.
 *
 *   import { requireAuth } from "./assets/js/auth-guard.js";
 *   const user = await requireAuth();
 *
 * Hides the page until Firebase has restored the session. Visitors who are
 * not signed in are sent to login.html?next=<this page>.
 *
 * NOTE: a client-side guard only controls what the browser shows. The real
 * protection of customer data is in firestore.rules, which Firebase enforces
 * on its servers for every read and write.
 */
import { auth, onAuthStateChanged, siteSettings } from "./firebase.js";

export function requireAuth() {
  document.documentElement.classList.add("auth-pending");
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      if (!user) {
        const next = location.pathname.split("/").pop() + location.search + location.hash;
        location.replace(`${siteSettings.loginUrl}?next=${encodeURIComponent(next)}`);
        return;
      }
      document.documentElement.classList.remove("auth-pending");
      resolve(user);
    });
  });
}

/** Re-checks on every change (e.g. sign-out in another tab). */
export function watchSignOut() {
  onAuthStateChanged(auth, (user) => {
    if (!user) location.replace(siteSettings.loginUrl);
  });
}
