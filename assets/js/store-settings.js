/** MOTO NAVAR – store settings (Firestore doc settings/store) + admin check. */
import { auth, db, doc, getDoc, setDoc, serverTimestamp } from "./firebase.js";

export const DEFAULT_SETTINGS = {
  bannerKicker: "MOTO NAVAR · Tunisia",
  bannerTitle: "Ride the road ahead",
  bannerSubtitle: "New and used motorcycles, scooters, helmets and gear — delivered across Tunisia with cash on delivery.",
  bannerCta: "Browse motorcycles",
  bannerLink: "shop.html?category=Motorcycles",
  bannerImage: "",
  logoImage: "",
  logoShowName: true,
  deliveryFee: 8,
  freeDeliveryFrom: 500,
  phone: "",
  whatsapp: "",
  email: "",
  address: "Tunis, Tunisia",
  taxId: "",
  facebook: "",
  instagram: "",
};

export const GOVERNORATES = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "La Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
];

let cache;
export async function getSettings() {
  if (cache) return cache;
  try {
    const snap = await getDoc(doc(db, "settings", "store"));
    cache = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export async function saveSettings(data) {
  const clean = { ...data, logoShowName: data.logoShowName !== false && data.logoShowName !== "false", deliveryFee: Number(data.deliveryFee) || 0, freeDeliveryFrom: Number(data.freeDeliveryFrom) || 0, updatedAt: serverTimestamp() };
  await setDoc(doc(db, "settings", "store"), clean, { merge: true });
  cache = { ...DEFAULT_SETTINGS, ...clean };
}

export function deliveryFeeFor(subtotal, s) {
  if (!subtotal) return 0;
  return s.freeDeliveryFrom && subtotal >= s.freeDeliveryFrom ? 0 : Number(s.deliveryFee) || 0;
}

/**
 * Admin = UID listed in Firestore "admins" collection (added by the owner in the
 * Firebase console) or a custom claim admin:true. Security Rules check the same
 * thing on the server, so this is only for showing/hiding admin UI.
 */
export async function isCurrentUserAdmin(user = auth.currentUser) {
  if (!user) return false;
  try {
    const t = await user.getIdTokenResult();
    if (t.claims.admin === true) return true;
  } catch { /* ignore */ }
  try {
    return (await getDoc(doc(db, "admins", user.uid))).exists();
  } catch {
    return false;
  }
}

/**
 * Replace every MOTO NAVAR logo on the page (a.brand) with the logo uploaded
 * in Admin → Banner & settings. Also updates the browser tab icon.
 */
export async function applyBrandLogo(root = document) {
  const s = await getSettings();
  if (!s.logoImage) return;
  root.querySelectorAll("a.brand").forEach((a) => {
    const mark = a.querySelector(".brand__mark");
    if (mark) {
      mark.src = s.logoImage;
      mark.classList.add("brand__mark--custom");
    }
    const word = a.querySelector(".brand__word");
    if (word) word.hidden = !s.logoShowName;
  });
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
  icon.type = "image/png";
  icon.href = s.logoImage;
}
