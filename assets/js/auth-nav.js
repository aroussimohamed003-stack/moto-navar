/**
 * MOTO NAVAR – header account widget for ANY page of the shop.
 *
 * Add to your site header:
 *   <div id="mn-account-nav"></div>
 *   <script type="module" src="assets/js/auth-nav.js"></script>
 *
 * Shows "Sign in" for visitors, or the customer's avatar + name linking to
 * account.html, with a sign-out button.
 */
import { auth, db, onAuthStateChanged, doc, getDoc, siteSettings } from "./firebase.js";
import { logout } from "./auth-service.js";

const mount = document.getElementById("mn-account-nav");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

if (mount) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const next = encodeURIComponent(location.pathname.split("/").pop() || siteSettings.homeUrl);
      mount.innerHTML = `<a class="mn-nav-signin" href="${siteSettings.loginUrl}?next=${next}">Sign in</a>`;
      return;
    }
    let name = user.displayName || user.email || "My account";
    let photo = user.photoURL || "";
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        name = snap.data().fullName || name;
        photo = snap.data().photoURL || photo;
      }
    } catch { /* profile not created yet */ }
    const initial = esc((name || "?").trim().charAt(0).toUpperCase());
    mount.innerHTML = `
      <a class="mn-nav-account" href="${siteSettings.accountUrl}">
        ${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="mn-nav-initial">${initial}</span>`}
        <span>${esc(name.split(" ")[0])}</span>
      </a>
      <button type="button" class="mn-nav-signout">Sign out</button>`;
    mount.querySelector(".mn-nav-signout").onclick = async () => {
      await logout();
      location.href = siteSettings.homeUrl;
    };
  });
}
