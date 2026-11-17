/**
 * MOTO NAVAR – product catalogue (Firestore collection "products").
 * Anyone can read; only admins can write – see firestore.rules.
 *
 * products/{id}: name, category, brand, model, price, oldPrice, currency,
 *                stock, condition, description, images[] (resized JPEG data
 *                URLs), specs{...}, active, featured, createdAt, updatedAt
 */
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp,
} from "./firebase.js";

export const CATEGORIES = [
  { id: "Motorcycles", label: "Motorcycles", icon: "🏍️" },
  { id: "Scooters", label: "Scooters", icon: "🛵" },
  { id: "Helmets", label: "Helmets", icon: "⛑️" },
  { id: "Riding gear", label: "Riding gear", icon: "🧥" },
  { id: "Parts", label: "Parts", icon: "⚙️" },
  { id: "Accessories", label: "Accessories", icon: "🧰" },
];
export const VEHICLE_CATEGORIES = ["Motorcycles", "Scooters"];

/** Motorcycle / scooter specifications (all optional). */
export const SPEC_FIELDS = [
  { key: "engineCc", label: "Engine", unit: "cc", type: "number" },
  { key: "powerHp", label: "Power", unit: "hp", type: "number" },
  { key: "torqueNm", label: "Torque", unit: "Nm", type: "number" },
  { key: "year", label: "Year", type: "number" },
  { key: "mileageKm", label: "Mileage", unit: "km", type: "number" },
  { key: "fuel", label: "Fuel", type: "select", options: ["Petrol", "Electric", "Hybrid"] },
  { key: "transmission", label: "Transmission", type: "select", options: ["Manual", "Automatic", "Semi-automatic", "CVT"] },
  { key: "gears", label: "Gears", type: "number" },
  { key: "topSpeed", label: "Top speed", unit: "km/h", type: "number" },
  { key: "tankL", label: "Fuel tank", unit: "L", type: "number" },
  { key: "weightKg", label: "Weight", unit: "kg", type: "number" },
  { key: "seatHeightMm", label: "Seat height", unit: "mm", type: "number" },
  { key: "brakes", label: "Brakes", type: "text" },
  { key: "abs", label: "ABS", type: "select", options: ["Yes", "No"] },
  { key: "color", label: "Color", type: "text" },
  { key: "license", label: "Licence", type: "select", options: ["None (≤50cc)", "A1", "A2", "A"] },
  { key: "warranty", label: "Warranty", type: "text" },
];

export const CONDITIONS = ["New", "Used", "Refurbished"];

const ms = (t) => (t?.toMillis ? t.toMillis() : 0);

export async function listProducts({ activeOnly = true } = {}) {
  const col = collection(db, "products");
  const snap = await getDocs(activeOnly ? query(col, where("active", "==", true)) : col);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || ms(b.createdAt) - ms(a.createdAt));
}

export async function getProduct(id) {
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveProduct(data, id = null) {
  const ref = id ? doc(db, "products", id) : doc(collection(db, "products"));
  const specs = {};
  for (const f of SPEC_FIELDS) {
    const v = data.specs?.[f.key];
    if (v === undefined || v === null || v === "") continue;
    specs[f.key] = f.type === "number" ? Number(v) : String(v).trim();
  }
  const clean = {
    name: String(data.name || "").trim(),
    category: String(data.category || "").trim(),
    brand: String(data.brand || "").trim(),
    model: String(data.model || "").trim(),
    condition: CONDITIONS.includes(data.condition) ? data.condition : "New",
    price: Number(data.price) || 0,
    oldPrice: Number(data.oldPrice) || 0,
    currency: "TND",
    stock: Math.max(0, parseInt(data.stock, 10) || 0),
    sku: String(data.sku || "").trim(),
    description: String(data.description || "").trim(),
    images: Array.isArray(data.images) ? data.images.slice(0, 4) : [],
    specs,
    active: !!data.active,
    featured: !!data.featured,
    updatedAt: serverTimestamp(),
  };
  if (!id) clean.createdAt = serverTimestamp();
  await setDoc(ref, clean, { merge: !!id });
  return ref.id;
}

export async function setProductActive(id, active) {
  await updateDoc(doc(db, "products", id), { active: !!active, updatedAt: serverTimestamp() });
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, "products", id));
}

/** Resize an image file in the browser to a JPEG data URL (no Storage needed). */
export function resizeImage(file, max = 900, quality = 0.8, { png = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      if (!png) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image.")); };
    img.src = url;
  });
}

/** Tunisian dinar: 3 decimals, "DT". */
export function formatPrice(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString("fr-TN", { minimumFractionDigits: v % 1 ? 3 : 0, maximumFractionDigits: 3 })} DT`;
}

export function specValue(f, v) {
  return f.unit ? `${Number(v).toLocaleString("fr-TN")} ${f.unit}` : String(v);
}
