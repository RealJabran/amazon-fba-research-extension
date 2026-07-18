(async function () {
  const labels = {
    asin: "ASIN",
    category: "Parent category and subcategory",
    bsr: "Parent and subcategory BSR",
    buyBox: "Buy Box price",
    offers: "FBA / FBM offers",
    dimensions: "Dimensions and weight",
    fees: "Amazon fees",
    profit: "Profit",
    roi: "ROI",
    margin: "Margin",
  };
  const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  const settings = RizPointCore.mergeSettings(response?.settings);
  const form = document.getElementById("form");
  Object.keys(RizPointCore.DEFAULT_SETTINGS)
    .filter((key) => key !== "visible")
    .forEach((key) => {
      if (form.elements[key])
        form.elements[key].type === "checkbox"
          ? (form.elements[key].checked = Boolean(settings[key]))
          : (form.elements[key].value = settings[key] ?? "");
    });
  document.getElementById("visible").innerHTML = Object.entries(labels)
    .map(
      ([key, label]) =>
        `<label><input type="checkbox" data-visible="${key}" ${settings.visible[key] ? "checked" : ""}>${label}</label>`,
    )
    .join("");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = { ...settings };
    Object.keys(RizPointCore.DEFAULT_SETTINGS)
      .filter((key) => key !== "visible")
      .forEach((key) => {
        const field = form.elements[key];
        if (field)
          next[key] =
            field.type === "checkbox" ? field.checked : field.value.trim();
      });
    next.visible = {};
    document.querySelectorAll("[data-visible]").forEach((field) => {
      next.visible[field.dataset.visible] = field.checked;
    });
    await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: next });
    const status = document.getElementById("status");
    status.textContent = "Saved ✓";
    setTimeout(() => {
      status.textContent = "";
    }, 1800);
  });
})();
