/**
 * MOTO NAVAR – shared shop header + footer.
 * Put <header id="site-header"></header> and <footer id="site-footer"></footer>
 * in a page and load this module.
 */
import { auth, db, onAuthStateChanged, doc, getDoc } from "./firebase.js";
import { logout } from "./auth-service.js";
import { CATEGORIES } from "./products.js";
import { cartCount } from "./cart.js";
import { getSettings, isCurrentUserAdmin, applyBrandLogo } from "./store-settings.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = location.pathname.split("/").pop() || "index.html";
const params = new URLSearchParams(location.search);
const active = (cond) => (cond ? ' class="is-active"' : "");

const header = document.getElementById("site-header");
const footer = document.getElementById("site-footer");

if (header) {
  header.className = "site-header";
  header.innerHTML = `
    <div class="site-header__inner">
      <a class="brand" href="index.html" aria-label="MOTO NAVAR home">
        <img class="brand__mark" src="assets/img/logo-mark.svg" alt="">
        <span class="brand__word">Moto <b>Navar</b></span>
      </a>
      <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
      <nav class="main-nav" aria-label="Main">
        <a href="index.html"${active(page === "index.html")}>Home</a>
        <a href="shop.html?category=Motorcycles"${active(page === "shop.html" && params.get("category") === "Motorcycles")}>Motorcycles</a>
        <a href="shop.html"${active(page === "shop.html" && !params.get("category"))}>Shop</a>
        <div class="nav-drop">
          <button type="button" class="nav-drop__btn">Categories <span aria-hidden="true">▾</span></button>
          <div class="nav-drop__menu">
            ${CATEGORIES.map((c) => `<a href="shop.html?category=${encodeURIComponent(c.id)}"><span>${c.icon}</span>${esc(c.label)}</a>`).join("")}
          </div>
        </div>
        <a href="account.html#orders">Track order</a>
        <a href="index.html#contact">Contact</a>
      </nav>
      <div class="header-actions">
        <form class="header-search" action="shop.html" role="search">
          <input name="q" type="search" placeholder="Search…" aria-label="Search products" value="${esc(params.get("q") || "")}">
        </form>
        <a class="cart-link" href="cart.html" aria-label="Cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>
          <span class="cart-count" id="cart-count">0</span>
        </a>
        <div id="mn-account-nav" class="account-slot"></div>
      </div>
    </div>`;

  const toggle = header.querySelector(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  const drop = header.querySelector(".nav-drop");
  drop.querySelector(".nav-drop__btn").addEventListener("click", () => drop.classList.toggle("is-open"));
  document.addEventListener("click", (e) => { if (!drop.contains(e.target)) drop.classList.remove("is-open"); });

  const updateCount = () => {
    const n = cartCount();
    const el = document.getElementById("cart-count");
    el.textContent = n;
    el.hidden = n === 0;
  };
  updateCount();
  window.addEventListener("cart:change", updateCount);

  const slot = header.querySelector("#mn-account-nav");
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      slot.innerHTML = `<a class="mn-nav-signin" href="login.html?next=${encodeURIComponent(page + location.search)}">Sign in</a>`;
      return;
    }
    let name = user.displayName || user.email || "Account";
    let photo = user.photoURL || "";
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) { name = snap.data().fullName || name; photo = snap.data().photoURL || photo; }
    } catch { /* ignore */ }
    const admin = await isCurrentUserAdmin(user);
    slot.innerHTML = `
      <div class="acct">
        <button type="button" class="acct__btn">
          ${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="mn-nav-initial">${esc(name.trim().charAt(0).toUpperCase())}</span>`}
          <span class="acct__name">${esc(name.split(" ")[0])}</span>
        </button>
        <div class="acct__menu">
          <a href="account.html">My account</a>
          <a href="account.html#orders">My orders</a>
          <a href="account.html#wishlist">Wishlist</a>
          ${admin ? `<a href="admin.html" class="acct__admin">Admin panel</a>` : ""}
          <button type="button" data-logout>Log out</button>
        </div>
      </div>`;
    const acct = slot.querySelector(".acct");
    acct.querySelector(".acct__btn").addEventListener("click", () => acct.classList.toggle("is-open"));
    document.addEventListener("click", (e) => { if (!acct.contains(e.target)) acct.classList.remove("is-open"); });
    slot.querySelector("[data-logout]").addEventListener("click", async () => { await logout(); location.href = "index.html"; });
  });
}

if (footer) {
  const s = await getSettings();
  footer.className = "site-footer";
  footer.id = "contact";
  footer.innerHTML = `
    <div class="site-footer__inner">
      <div>
        <a class="brand" href="index.html"><img class="brand__mark" src="assets/img/logo-mark.svg" alt=""><span class="brand__word">Moto <b>Navar</b></span></a>
        <p class="muted">Motorcycles, scooters, gear and parts. Delivery across all 24 governorates, cash on delivery.</p>
      </div>
      <div>
        <h4>Shop</h4>
        ${CATEGORIES.map((c) => `<a href="shop.html?category=${encodeURIComponent(c.id)}">${esc(c.label)}</a>`).join("")}
      </div>
      <div>
        <h4>Account</h4>
        <a href="account.html">My account</a>
        <a href="account.html#orders">Track order</a>
        <a href="account.html#wishlist">Wishlist</a>
        <a href="cart.html">Cart</a>
      </div>
      <div>
        <h4>Contact</h4>
        ${s.address ? `<span>${esc(s.address)}</span>` : ""}
        ${s.phone ? `<a href="tel:${esc(s.phone.replace(/\s/g, ""))}">${esc(s.phone)}</a>` : ""}
        ${s.whatsapp ? `<a href="https://wa.me/${esc(s.whatsapp.replace(/\D/g, ""))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        ${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ""}
        ${s.facebook ? `<a href="${esc(s.facebook)}" target="_blank" rel="noopener">Facebook</a>` : ""}
        ${s.instagram ? `<a href="${esc(s.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}
      </div>
    </div>
    <div class="site-footer__bottom">© ${new Date().getFullYear()} MOTO NAVAR · Prices in Tunisian dinar (DT)</div>`;
}

applyBrandLogo();
