/** MOTO NAVAR – Admin: banner & store settings (admin.html#settings). */
import { getSettings, saveSettings } from "./store-settings.js";
import { resizeImage } from "./products.js";
import { toast, setLoading, authErrorMessage } from "./ui.js";

const $ = (s) => document.querySelector(s);
let bannerImage = "";
let logoImage = "";

function logoPreview() {
  $("#logo-preview-img").src = logoImage || "assets/img/logo-mark.svg";
  $("#logo-preview-img").classList.toggle("brand__mark--custom", !!logoImage);
  $("#logo-preview-word").hidden = !$("#logo-show-name").checked;
}

function preview() {
  const f = $("#settings-form");
  $("#bp-kicker").textContent = f.bannerKicker.value;
  $("#bp-title").textContent = f.bannerTitle.value;
  $("#bp-sub").textContent = f.bannerSubtitle.value;
  $("#banner-preview").style.backgroundImage = bannerImage
    ? `linear-gradient(90deg, rgba(10,10,12,.85), rgba(10,10,12,.2)), url("${bannerImage.replace(/"/g, "%22")}")`
    : "";
}

export async function initSettings() {
  const f = $("#settings-form");
  const s = await getSettings();
  for (const el of f.elements) {
    if (!el.name || s[el.name] === undefined) continue;
    if (el.type === "checkbox") el.checked = !!s[el.name];
    else el.value = s[el.name];
  }
  bannerImage = s.bannerImage || "";
  logoImage = s.logoImage || "";
  preview();
  logoPreview();
  f.addEventListener("input", () => { preview(); logoPreview(); });

  $("#logo-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      logoImage = file.type === "image/svg+xml" && file.size < 150000
        ? await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); })
        : await resizeImage(file, 400, 0.9, { png: true });
      if (logoImage.length > 300000) logoImage = await resizeImage(file, 240, 0.9, { png: true });
      logoPreview();
      toast("Logo ready — click Save settings.", "info");
    } catch (err) { toast(err.message || "Could not read this image.", "error"); }
  });
  $("#logo-remove").addEventListener("click", () => { logoImage = ""; logoPreview(); });

  $("#banner-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      bannerImage = await resizeImage(file, 1600, 0.75);
      preview();
      toast("Banner image ready — click Save settings.", "info");
    } catch (err) { toast(err.message, "error"); }
  });
  $("#banner-remove").addEventListener("click", () => { bannerImage = ""; preview(); });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]");
    const data = Object.fromEntries([...f.elements].filter((el) => el.name).map((el) => [el.name, el.type === "checkbox" ? el.checked : el.value.trim()]));
    for (const k of ["bannerLink", "facebook", "instagram"]) {
      if (/^\s*javascript:/i.test(data[k] || "")) data[k] = "";
    }
    data.bannerImage = bannerImage;
    data.logoImage = logoImage;
    if (bannerImage.length + logoImage.length > 900000) {
      toast("Logo + banner images are too large together. Use a smaller banner image.", "error", 7000);
      return;
    }
    setLoading(btn, true);
    try {
      await saveSettings(data);
      toast("Settings saved. The shop is updated.", "success");
      import("./store-settings.js").then((m) => m.applyBrandLogo());
    } catch (err) {
      toast(authErrorMessage(err), "error");
    } finally {
      setLoading(btn, false);
    }
  });
}
