(async function () {
  const app = document.getElementById("app");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let data = await readPage();

  if (!data?.ok) {
    app.innerHTML = `<button class="settings" id="settings">⚙</button><div class="empty"><h2>Open an Amazon product page</h2><p>Supported now: USA, UK, UAE and Saudi Arabia.</p></div>`;
    document.getElementById("settings").onclick = () =>
      chrome.runtime.openOptionsPage();
    return;
  }

  render();

  async function readPage() {
    try {
      return await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_DATA" });
    } catch (_) {
      return null;
    }
  }

  function render() {
    const { marketplace: market, product, calculation: calc } = data;
    const listing = RizPointCore.categoryIntelligence(
      product.breadcrumbs || [],
      product.ranks?.length
        ? product.ranks
        : product.official?.salesRank
          ? [
              {
                rank: product.official.salesRank,
                category: product.official.salesRankCategory || "",
              },
            ]
          : [],
    );
    const official = data.feesStatus === "official";
    const profitClass =
      calc.profitSign > 0 ? "positive" : calc.profitSign < 0 ? "negative" : "";
    app.innerHTML = `<header><button class="settings" id="settings">⚙</button><small>RIZPOINT</small><h1>FBA Research</h1><span class="market">${market.flag} ${market.label} · ${market.currency}</span></header><div class="body">
      <div class="product">${escapeHtml(product.title)}</div>
      <div class="grid"><div class="metric"><span>BUY BOX</span><b>${RizPointCore.money(data.inputs.salePrice, market)}</b></div><div class="metric"><span>NET PROFIT</span><b class="${profitClass}">${official ? RizPointCore.money(calc.profit, market) : "—"}</b></div><div class="metric"><span>ROI</span><b class="${profitClass}">${official && calc.roi !== null ? `${calc.roi}%` : "—"}</b></div><div class="metric"><span>MARGIN</span><b class="${profitClass}">${official && calc.margin !== null ? `${calc.margin}%` : "—"}</b></div></div>
      <div class="cost"><label><span>PRODUCT COST (${market.currency})</span><input id="product-cost" inputmode="decimal" value="${escapeAttribute(data.inputs.productCost)}" placeholder="0.00"></label><button id="save-cost">Update</button></div>
      <div class="status ${official ? "good" : data.feesStatus === "error" ? "bad" : ""}">${official ? "● Fees returned by Amazon Revenue Calculator" : data.feesStatus === "loading" ? "Checking official Amazon fees…" : escapeHtml(data.feeError || "Official fees not loaded")}</div>
      <div class="mini">${infoRow("ASIN", product.asin, true)}${infoRow("Parent category", listing.parentCategory || "Unavailable", Boolean(listing.parentCategory))}${infoRow("Parent category BSR", listing.parentBsr ? `#${Number(listing.parentBsr).toLocaleString()}` : "Unavailable", Boolean(listing.parentBsr))}</div>
      <div class="actions"><button class="primary" id="open">Open full analysis</button></div></div>`;

    document.getElementById("open").onclick = async () => {
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" });
      window.close();
    };
    document.getElementById("save-cost").onclick = saveCost;
    document.getElementById("product-cost").onkeydown = (event) => {
      if (event.key === "Enter") saveCost();
    };
    document.getElementById("settings").onclick = () =>
      chrome.runtime.openOptionsPage();
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.onclick = async () => {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = "✓";
      };
    });
  }

  async function saveCost() {
    const button = document.getElementById("save-cost");
    const productCost = document.getElementById("product-cost").value;
    button.textContent = "Saving…";
    button.classList.add("saving");
    data = await chrome.tabs.sendMessage(tab.id, {
      type: "UPDATE_INPUTS",
      inputs: { productCost },
    });
    render();
  }

  function infoRow(label, value, copy) {
    return `<div><span>${label}</span><b>${escapeHtml(value)}${copy ? `<button class="copy" data-copy="${escapeAttribute(value)}" title="Copy ${escapeAttribute(label)}">⧉</button>` : ""}</b></div>`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(
      /[&<>]/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character],
    );
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }
})();
