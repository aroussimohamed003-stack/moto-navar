/** MOTO NAVAR – Admin: banner & store settings (admin.html#settings). */
import { getSettings, saveSettings } from "./store-settings.js";
import { resizeImage } from "./products.js";
import { toast, setLoading, authErrorMessage } from "./ui.js";

const $ = (s) => document.querySelector(s);
let bannerImage = "";

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
  for (const el of f.elements) if (el.name && s[el.name] !== undefined) el.value = s[el.name];
  bannerImage = s.bannerImage || "";
  preview();
  f.addEventListener("input", preview);

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
    const data = Object.fromEntries([...f.elements].filter((el) => el.name).map((el) => [el.name, el.value.trim()]));
    for (const k of ["bannerLink", "facebook", "instagram"]) {
      if (/^\s*javascript:/i.test(data[k] || "")) data[k] = "";
    }
    data.bannerImage = bannerImage;
    setLoading(btn, true);
    try {
      await saveSettings(data);
      toast("Settings saved. The home page is updated.", "success");
    } catch (err) {
      toast(authErrorMessage(err), "error");
    } finally {
      setLoading(btn, false);
    }
  });
}
