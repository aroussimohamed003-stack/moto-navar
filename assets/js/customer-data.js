/**
 * MOTO NAVAR – customer data API (Firestore).
 * Used by the account dashboard; product/cart pages can import it too:
 *
 *   import { addToWishlist } from "./assets/js/customer-data.js";
 *   await addToWishlist({ productId: "helmet-x1", name: "Helmet X1", price: 459, image: "...", url: "product.html?id=helmet-x1" });
 *
 * Data model
 *   users/{uid}                     profile (see auth-service.js)
 *   users/{uid}/addresses/{id}      saved addresses
 *   users/{uid}/wishlist/{productId} wishlist items
 *   orders/{orderId}                orders, field userId = owner uid
 */
import {
  auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, where, orderBy, getDocs, writeBatch, serverTimestamp,
} from "./firebase.js";

function uid() {
  const u = auth.currentUser;
  if (!u) throw Object.assign(new Error("Please sign in first."), { code: "auth/no-current-user" });
  return u.uid;
}

/* ---------------- Profile ---------------- */

export async function getProfile() {
  const snap = await getDoc(doc(db, "users", uid()));
  return snap.exists() ? snap.data() : null;
}

/** Only the editable fields; role/email/createdAt are protected by rules. */
export async function updateProfileFields({ fullName, phone, photoURL }) {
  const updates = {};
  if (fullName !== undefined) updates.fullName = fullName.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (photoURL !== undefined) updates.photoURL = photoURL;
  await updateDoc(doc(db, "users", uid()), updates);
}

/* ---------------- Orders ---------------- */

export async function listMyOrders() {
  // Filter on the server (required by Security Rules), sort in the browser
  // so no composite index is needed.
  const snap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid())));
  const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

/**
 * Creates an order in "pending" status. Rules prevent customers from setting
 * any other status or editing orders afterwards – status, tracking number
 * and payment confirmation must be set by an admin / server.
 * IMPORTANT: verify prices & totals on the server (Cloud Function or your
 * back office) before fulfilling – never trust client-side totals.
 */
export async function createOrder({ items, total, currency = "TND", shippingAddress, paymentMethod = "cash_on_delivery" }) {
  const ref = await addDoc(collection(db, "orders"), {
    userId: uid(),
    items,
    total,
    currency,
    shippingAddress,
    paymentMethod,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/* ---------------- Wishlist ---------------- */

export async function listWishlist() {
  const snap = await getDocs(query(collection(db, "users", uid(), "wishlist"), orderBy("addedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addToWishlist({ productId, name, price = 0, image = "", url = "" }) {
  await setDoc(doc(db, "users", uid(), "wishlist", String(productId)), {
    productId: String(productId), name, price: Number(price) || 0, image, url, addedAt: serverTimestamp(),
  });
}

export async function removeFromWishlist(productId) {
  await deleteDoc(doc(db, "users", uid(), "wishlist", String(productId)));
}

/* ---------------- Addresses ---------------- */

const ADDRESS_FIELDS = ["label", "fullName", "phone", "line1", "line2", "city", "region", "postalCode", "country", "isDefault"];

function cleanAddress(a) {
  const out = {};
  for (const k of ADDRESS_FIELDS) out[k] = k === "isDefault" ? !!a[k] : String(a[k] ?? "").trim();
  return out;
}

export async function listAddresses() {
  const snap = await getDocs(collection(db, "users", uid(), "addresses"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function saveAddress(address, id = null) {
  const data = { ...cleanAddress(address), updatedAt: serverTimestamp() };
  const col = collection(db, "users", uid(), "addresses");
  const ref = id ? doc(col, id) : doc(col);
  await setDoc(ref, data);
  if (data.isDefault) await setDefaultAddress(ref.id);
  return ref.id;
}

export async function deleteAddress(id) {
  await deleteDoc(doc(db, "users", uid(), "addresses", id));
}

export async function setDefaultAddress(id) {
  const list = await listAddresses();
  const batch = writeBatch(db);
  for (const a of list) {
    const shouldBe = a.id === id;
    if (a.isDefault !== shouldBe) batch.update(doc(db, "users", uid(), "addresses", a.id), { isDefault: shouldBe, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
