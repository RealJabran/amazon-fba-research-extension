(async function () {
  const app = document.getElementById("app");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_DATA" });
  } catch (_) {
    data = null;
  }
  if (!data?.ok) {
    app.innerHTML = `<button class="settings" id="settings">⚙</button><div class="empty"><h2>Open an Amazon product page</h2><p>Supported now: USA, UK, UAE and Saudi Arabia.</p></div>`;
    document.getElementById("settings").onclick = () =>
      chrome.runtime.openOptionsPage();
    return;
  }
  const { marketplace: market, product, offers, calculation: calc } = data;
  const official = data.feesStatus === "official";
  const profitClass =
    calc.profitSign > 0 ? "positive" : calc.profitSign < 0 ? "negative" : "";
  app.innerHTML = `<header><button class="settings" id="settings">⚙</button><small>RIZPOINT</small><h1>FBA Research</h1><span class="market">${market.flag} ${market.label} · ${market.currency}</span></header><div class="body">
    <div class="product">${escapeHtml(product.title)}</div>
    <div class="grid"><div class="metric"><span>BUY BOX</span><b>${RizPointCore.money(data.inputs.salePrice, market)}</b></div><div class="metric"><span>NET PROFIT</span><b class="${profitClass}">${official ? RizPointCore.money(calc.profit, market) : "—"}</b></div><div class="metric"><span>ROI</span><b class="${profitClass}">${official && calc.roi !== null ? `${calc.roi}%` : "—"}</b></div><div class="metric"><span>BSR</span><b>${product.ranks[0] ? `#${Number(product.ranks[0].rank).toLocaleString()}` : "—"}</b></div></div>
    <div class="status ${official ? "good" : data.feesStatus === "error" ? "bad" : ""}">${official ? "● Fees returned by Amazon Revenue Calculator" : data.feesStatus === "loading" ? "Checking official Amazon fees…" : data.feeError || "Official fees not loaded"}</div>
    <div class="mini"><span>ASIN: ${product.asin}</span><span>${offers.fba ?? "—"} FBA · ${offers.fbm ?? "—"} FBM · ${offers.amazon ?? "—"} Amazon</span></div>
    <div class="actions"><button class="primary" id="open">Open full analysis</button><button id="copy">Copy ASIN</button></div></div>`;
  document.getElementById("open").onclick = async () => {
    await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
    window.close();
  };
  document.getElementById("copy").onclick = () =>
    navigator.clipboard.writeText(product.asin);
  document.getElementById("settings").onclick = () =>
    chrome.runtime.openOptionsPage();
  function escapeHtml(value) {
    return String(value || "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  }
})();
