(function () {
  "use strict";
  const Core = RizPointCore;
  const marketplace = Core.marketplaceFromHost(location.hostname);
  if (!marketplace) return;

  let settings = Core.mergeSettings();
  let product = null;
  let fees = null;
  let feesStatus = "idle";
  let feeError = "";
  let offers = {
    status: "idle",
    fba: null,
    fbm: null,
    amazon: null,
    total: null,
    sellers: [],
  };
  let inputs = {
    salePrice: "",
    productCost: "",
    prepFee: "",
    inboundShipping: "",
    otherCost: "",
  };
  let host;
  let shadow;
  let lastFingerprint = "";
  let refreshTimer;

  const text = (selector) =>
    document.querySelector(selector)?.textContent?.trim() || "";
  const firstText = (selectors) => selectors.map(text).find(Boolean) || "";
  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  function parseRanks(bodyText) {
    const matches = [
      ...bodyText.matchAll(/#([\d,\.]+)\s+(?:in|en|dans|في)\s+([^\n\r(]+)/gi),
    ];
    const seen = new Set();
    return matches
      .map((match) => ({
        rank: Number(match[1].replace(/[,\.]/g, "")),
        category: clean(match[2]),
      }))
      .filter(
        (rank) =>
          rank.rank > 0 &&
          rank.category &&
          !seen.has(`${rank.rank}:${rank.category}`) &&
          seen.add(`${rank.rank}:${rank.category}`),
      );
  }

  function detailText() {
    return [
      "#detailBullets_feature_div",
      "#productDetails_detailBullets_sections1",
      "#productDetails_techSpec_section_1",
      "#prodDetails",
    ]
      .map((selector) => text(selector))
      .filter(Boolean)
      .join("\n");
  }

  function labeledDetail(labelPattern) {
    const raw = detailText();
    const match = raw.match(
      new RegExp(`${labelPattern}\\s*[:：]?\\s*([^\\n]+)`, "i"),
    );
    return clean(match?.[1] || "");
  }

  function extractProduct() {
    const asin =
      Core.parseAsin(location.href) ||
      document.querySelector('[data-asin]:not([data-asin=""])')?.dataset
        ?.asin ||
      labeledDetail("ASIN")
        .match(/[A-Z0-9]{10}/i)?.[0]
        ?.toUpperCase() ||
      null;
    const priceText = firstText([
      "#corePrice_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      "#price_inside_buybox",
      "#newBuyBoxPrice",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#buybox .a-price .a-offscreen",
      "#kindle-price",
    ]);
    const breadcrumbs = [
      ...document.querySelectorAll(
        "#wayfinding-breadcrumbs_feature_div a, #wayfinding-breadcrumbs_container a",
      ),
    ]
      .map((node) => clean(node.textContent))
      .filter(Boolean);
    const ranks = parseRanks(detailText());
    return {
      asin,
      title: firstText(["#productTitle", "#title", "h1.a-size-large"]),
      price: Core.normalizeDecimal(priceText),
      priceText,
      category: breadcrumbs.at(-1) || ranks[0]?.category || "",
      breadcrumbs,
      ranks,
      packageDimensions: labeledDetail(
        "Package Dimensions|Product Dimensions|Parcel Dimensions",
      ),
      weight: labeledDetail("Item Weight|Package Weight|Shipping Weight"),
      url: location.href,
      image: document.querySelector("#landingImage, #imgBlkFront")?.src || "",
      observedAt: new Date().toISOString(),
    };
  }

  async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    settings = Core.mergeSettings(response?.settings);
  }

  function currentTaxRate() {
    return settings.taxRateOverride === ""
      ? marketplace.vatRate
      : Core.normalizeNumber(settings.taxRateOverride) || 0;
  }

  function calculation() {
    return Core.calculateProfit({
      ...inputs,
      feeComponents: fees || {},
      includeStorageFee: settings.includeStorageFee,
      includeTaxReserve: settings.includeTaxReserve,
      taxRate: currentTaxRate(),
    });
  }

  async function loadFees(force = false) {
    if (!product?.asin || !(Core.normalizeNumber(inputs.salePrice) > 0)) return;
    const fingerprint = `${marketplace.id}:${product.asin}:${inputs.salePrice}`;
    if (!force && fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    feesStatus = "loading";
    feeError = "";
    render();
    const response = await chrome.runtime.sendMessage({
      type: "GET_OFFICIAL_FEES",
      payload: {
        marketplaceId: marketplace.id,
        asin: product.asin,
        price: inputs.salePrice,
      },
    });
    if (response?.ok) {
      fees = response.fees;
      feesStatus = "official";
      product.official = response.officialProduct;
      product.productGroup = response.productGroup;
      product.feesFetchedAt = response.fetchedAt;
    } else {
      fees = null;
      feesStatus = "error";
      feeError = response?.error || "Official fee lookup failed";
    }
    render();
  }

  function classifyOffer(node) {
    const shipsFrom = clean(
      node.querySelector("#aod-offer-shipsFrom, [id*='shipsFrom']")
        ?.textContent,
    );
    const soldByNode = node.querySelector(
      "#aod-offer-soldBy a, [id*='soldBy'] a",
    );
    const soldBy = clean(
      soldByNode?.textContent ||
        node.querySelector("#aod-offer-soldBy, [id*='soldBy']")?.textContent,
    )
      .replace(/^Sold by:?/i, "")
      .trim();
    const sellerId =
      new URL(soldByNode?.href || location.href).searchParams.get("seller") ||
      soldBy;
    const amazonNames = /amazon(?:\.com|\.co\.uk|\.ae|\.sa)?\b/i;
    const isAmazon = amazonNames.test(soldBy);
    const isFba = /amazon/i.test(shipsFrom);
    return {
      name: soldBy || "Unknown seller",
      sellerId,
      fulfillment: isAmazon ? "Amazon" : isFba ? "FBA" : "FBM",
      shipsFrom,
    };
  }

  async function loadOffers(force = false) {
    if (!product?.asin || (offers.status === "loading" && !force)) return;
    offers = { ...offers, status: "loading" };
    render();
    try {
      const url = `/gp/aod/ajax/ref=auto_load_aod?asin=${encodeURIComponent(product.asin)}&pc=dp&experienceId=aodAjaxMain`;
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "text/html" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const nodes = [...doc.querySelectorAll("#aod-offer, .aod-offer")];
      const unique = new Map();
      nodes
        .map(classifyOffer)
        .forEach((seller) =>
          unique.set(
            seller.sellerId || `${seller.name}:${seller.fulfillment}`,
            seller,
          ),
        );
      const sellers = [...unique.values()];
      offers = {
        status: sellers.length ? "observed" : "unavailable",
        sellers,
        total: sellers.length,
        fba: sellers.filter((seller) => seller.fulfillment === "FBA").length,
        fbm: sellers.filter((seller) => seller.fulfillment === "FBM").length,
        amazon: sellers.filter((seller) => seller.fulfillment === "Amazon")
          .length,
        observedAt: new Date().toISOString(),
      };
      if (!sellers.length)
        Object.assign(offers, {
          fba: null,
          fbm: null,
          amazon: null,
          total: null,
        });
    } catch (error) {
      offers = {
        status: "error",
        error: error.message,
        fba: null,
        fbm: null,
        amazon: null,
        total: null,
        sellers: [],
      };
    }
    render();
  }

  function copyButton(value, label = "Copy") {
    return `<button class="rp-copy" data-copy="${escapeHtml(value)}" title="${label}">⧉</button>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>'"]/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[char],
    );
  }

  function feeStateHtml() {
    if (feesStatus === "loading")
      return `<span class="rp-status pending">Checking Amazon…</span>`;
    if (feesStatus === "official")
      return `<span class="rp-status good">● Official Amazon result</span>`;
    if (feesStatus === "error")
      return `<span class="rp-status bad">Official fee unavailable</span><small>${escapeHtml(feeError)}</small>`;
    return `<span class="rp-status">Not checked</span>`;
  }

  function metric(label, value, className = "") {
    return `<div class="rp-metric ${className}"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function render() {
    if (!shadow || !product?.asin) return;
    const calc = calculation();
    const profitClass =
      calc.profitSign > 0 ? "positive" : calc.profitSign < 0 ? "negative" : "";
    const rank =
      product.ranks[0] ||
      (product.official?.salesRank
        ? {
            rank: product.official.salesRank,
            category: product.official.salesRankCategory,
          }
        : null);
    const visible = settings.visible;
    shadow.innerHTML = `<style>${styles()}</style>
      ${
        settings.showFloatingWidget
          ? `<button id="rp-float" aria-label="Open RizPoint FBA analysis">
        <span class="rp-market">${marketplace.flag} ${marketplace.id}</span>
        <b>${Core.money(inputs.salePrice, marketplace)}</b>
        <span class="${profitClass}">${fees ? `${Core.money(calc.profit, marketplace)} profit` : "Check fees"}</span>
        <small>${rank ? `BSR #${Number(rank.rank).toLocaleString()}` : "BSR unavailable"} · ${offers.status === "observed" ? `${offers.fba} FBA / ${offers.fbm} FBM` : "offers…"}</small>
      </button>`
          : ""
      }
      <div id="rp-overlay" class="rp-hidden" role="dialog" aria-modal="true" aria-label="RizPoint FBA Research">
        <div class="rp-backdrop" data-close></div>
        <section class="rp-panel">
          <header><div><span class="rp-brand">RIZPOINT</span><h2>FBA Research</h2></div><div class="rp-header-actions"><span class="rp-market-pill">${marketplace.flag} ${marketplace.label} · ${marketplace.currency}</span><button data-close aria-label="Close">×</button></div></header>
          <div class="rp-content">
            <div class="rp-product">
              ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : ""}
              <div><h3>${escapeHtml(product.title || "Amazon product")}</h3><div class="rp-tags"><span>ASIN ${escapeHtml(product.asin)}</span>${copyButton(product.asin)}<span>${escapeHtml(product.category || product.productGroup || "Category unavailable")}</span>${copyButton(product.category || product.productGroup || "")}</div></div>
            </div>
            <div class="rp-grid top">
              ${visible.buyBox ? metric("Selling price", Core.money(inputs.salePrice, marketplace)) : ""}
              ${visible.profit ? metric("Net profit", fees ? Core.money(calc.profit, marketplace) : "Waiting for Amazon", profitClass) : ""}
              ${visible.roi ? metric("ROI", fees && calc.roi !== null ? `${calc.roi}%` : "—", profitClass) : ""}
              ${visible.margin ? metric("Margin", fees && calc.margin !== null ? `${calc.margin}%` : "—", profitClass) : ""}
            </div>
            <div class="rp-columns">
              <div class="rp-card">
                <div class="rp-card-title"><h4>Profit inputs</h4>${feeStateHtml()}</div>
                <div class="rp-form-grid">
                  ${inputHtml("salePrice", "Selling price", inputs.salePrice)}
                  ${inputHtml("productCost", "Product cost", inputs.productCost)}
                  ${inputHtml("prepFee", "Prep / labeling", inputs.prepFee)}
                  ${inputHtml("inboundShipping", "Inbound shipping", inputs.inboundShipping)}
                  ${inputHtml("otherCost", "Other cost", inputs.otherCost)}
                </div>
                <div class="rp-actions"><button id="rp-refresh-fees" class="primary">Refresh official fees</button><button id="rp-calculator">Open Amazon Calculator ↗</button></div>
                ${settings.includeTaxReserve ? `<p class="rp-note">Tax reserve enabled at ${currentTaxRate()}%. This is a planning reserve, not tax advice.</p>` : ""}
              </div>
              <div class="rp-card">
                <div class="rp-card-title"><h4>Amazon fees</h4><span>${feesStatus === "official" ? escapeHtml(product.productGroup || "") : ""}</span></div>
                ${
                  fees
                    ? `<div class="rp-lines">
                  ${feeLine("Referral fee", fees.referralFee)}${feeLine("FBA fulfilment", fees.fulfillmentFee)}${feeLine("Closing fees", fees.closingFee)}${feeLine("Digital services", fees.digitalServicesFee)}${feeLine("Other Amazon fees", fees.otherAmazonFee)}${settings.includeStorageFee ? feeLine("Monthly storage estimate", fees.storageFee) : ""}
                  <div class="total"><span>Total Amazon fees</span><b>${Core.money(calc.amazonFees, marketplace)}</b></div>
                  <div><span>Estimated payout</span><b>${Core.money(calc.netPayout, marketplace)}</b></div>
                </div>`
                    : `<div class="rp-empty">Amazon’s official fee result is required before profit is shown. No guessed fee table is used.</div>`
                }
              </div>
              ${
                visible.offers
                  ? `<div class="rp-card">
                <div class="rp-card-title"><h4>Observed offers</h4><button id="rp-refresh-offers" class="link">Refresh</button></div>
                <div class="rp-grid offers">${metric("FBA", offers.fba ?? "—")}${metric("FBM", offers.fbm ?? "—")}${metric("Amazon", offers.amazon ?? "—")}${metric("Total loaded", offers.total ?? "—")}</div>
                <p class="rp-note">Counts are unique offers Amazon returned to this browser. Hidden, paginated, location-ineligible, or suppressed offers may not be included.</p>
                <div class="rp-sellers">${
                  offers.sellers
                    .slice(0, 12)
                    .map(
                      (seller) =>
                        `<div><span>${escapeHtml(seller.name)}</span><b class="${seller.fulfillment.toLowerCase()}">${seller.fulfillment}</b></div>`,
                    )
                    .join("") ||
                  `<div class="rp-empty">${offers.status === "loading" ? "Loading offers…" : "Offers unavailable"}</div>`
                }</div>
              </div>`
                  : ""
              }
              <div class="rp-card">
                <div class="rp-card-title"><h4>Listing intelligence</h4><button id="rp-copy-row" class="link">Copy row for sheet</button></div>
                <div class="rp-lines">
                  ${visible.asin ? detailLine("ASIN", product.asin, true) : ""}
                  ${visible.category ? detailLine("Category", product.category || product.productGroup, true) : ""}
                  ${visible.bsr ? detailLine("Best Sellers Rank", rank ? `#${Number(rank.rank).toLocaleString()} in ${rank.category || "Unknown"}` : "Unavailable", true) : ""}
                  ${visible.dimensions ? detailLine("Package dimensions", product.packageDimensions || "Unavailable") + detailLine("Weight", product.weight || "Unavailable") : ""}
                </div>
                ${product.ranks.length > 1 ? `<div class="rp-ranks">${product.ranks.map((item) => `<span>#${Number(item.rank).toLocaleString()} ${escapeHtml(item.category)}</span>`).join("")}</div>` : ""}
              </div>
            </div>
          </div>
          <footer><span>Fee source: ${feesStatus === "official" ? `Amazon Revenue Calculator · ${new Date(product.feesFetchedAt).toLocaleString()}` : "not available"}</span><button id="rp-settings">Settings</button></footer>
        </section>
      </div>`;
    wireEvents();
  }

  function inputHtml(name, label, value) {
    return `<label><span>${label} (${marketplace.currency})</span><input data-input="${name}" inputmode="decimal" value="${escapeHtml(value)}" placeholder="0.00"></label>`;
  }
  function feeLine(label, value) {
    return `<div><span>${label}</span><b>${Core.money(value, marketplace)}</b></div>`;
  }
  function detailLine(label, value, copy = false) {
    return `<div><span>${label}</span><b>${escapeHtml(value || "Unavailable")} ${copy && value ? copyButton(value) : ""}</b></div>`;
  }

  function sheetRow() {
    const calc = calculation();
    const rank = product.ranks[0];
    return [
      product.asin,
      product.title,
      marketplace.id,
      product.category || product.productGroup || "",
      rank?.rank || "",
      inputs.salePrice,
      inputs.productCost,
      fees?.referralFee ?? "",
      fees?.fulfillmentFee ?? "",
      calc.amazonFees,
      calc.profit,
      calc.roi ?? "",
      calc.margin ?? "",
      offers.fba,
      offers.fbm,
      offers.amazon,
      product.url,
    ].join("\t");
  }

  function wireEvents() {
    shadow.getElementById("rp-float")?.addEventListener("click", openPanel);
    shadow
      .querySelectorAll("[data-close]")
      .forEach((node) => node.addEventListener("click", closePanel));
    shadow.querySelectorAll("[data-copy]").forEach((node) =>
      node.addEventListener("click", async () => {
        await navigator.clipboard.writeText(node.dataset.copy);
        const old = node.textContent;
        node.textContent = "✓";
        setTimeout(() => {
          node.textContent = old;
        }, 900);
      }),
    );
    shadow.querySelectorAll("[data-input]").forEach((node) =>
      node.addEventListener("change", () => {
        inputs[node.dataset.input] = node.value;
        if (node.dataset.input === "salePrice") loadFees(true);
        else {
          render();
          openPanel();
        }
      }),
    );
    shadow
      .getElementById("rp-refresh-fees")
      ?.addEventListener("click", () => loadFees(true));
    shadow
      .getElementById("rp-refresh-offers")
      ?.addEventListener("click", () => loadOffers(true));
    shadow.getElementById("rp-calculator")?.addEventListener("click", () =>
      chrome.runtime.sendMessage({
        type: "OPEN_CALCULATOR",
        marketplaceId: marketplace.id,
      }),
    );
    shadow
      .getElementById("rp-settings")
      ?.addEventListener("click", () => chrome.runtime.openOptionsPage());
    shadow
      .getElementById("rp-copy-row")
      ?.addEventListener("click", async (event) => {
        await navigator.clipboard.writeText(sheetRow());
        event.currentTarget.textContent = "Copied ✓";
      });
  }

  function openPanel() {
    shadow.getElementById("rp-overlay")?.classList.remove("rp-hidden");
  }
  function closePanel() {
    shadow.getElementById("rp-overlay")?.classList.add("rp-hidden");
  }

  function styles() {
    return `
    :host{all:initial;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17231d}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}
    #rp-float{position:fixed;right:0;top:38%;z-index:2147483645;width:178px;padding:12px 14px;border:0;border-radius:14px 0 0 14px;background:#102a20;color:#fff;box-shadow:0 12px 34px #102a2040;text-align:left;display:grid;gap:4px}#rp-float b{font-size:17px}#rp-float small{color:#b8cdc3;line-height:1.35}.rp-market{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9de2b7}.positive{color:#148447!important}.negative{color:#c83f49!important}#rp-float .positive{color:#74e5a0!important}#rp-float .negative{color:#ff9fa7!important}
    .rp-hidden{display:none!important}#rp-overlay{position:fixed;inset:0;z-index:2147483646}.rp-backdrop{position:absolute;inset:0;background:#07120db8;backdrop-filter:blur(4px)}.rp-panel{position:absolute;inset:3vh 3vw;background:#f5f8f6;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 28px 90px #0008}.rp-panel header,.rp-panel footer{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:16px 22px;border-bottom:1px solid #dce5df}.rp-panel footer{border:0;border-top:1px solid #dce5df;font-size:12px;color:#617068}.rp-panel footer button{border:0;background:none;color:#176e42;font-weight:700}.rp-brand{font-size:10px;letter-spacing:.15em;color:#197547;font-weight:800}.rp-panel h2{font-size:20px;margin:0}.rp-header-actions{display:flex;align-items:center;gap:12px}.rp-header-actions>button{border:0;background:#edf3ef;border-radius:50%;width:34px;height:34px;font-size:24px}.rp-market-pill{background:#e7f6ec;color:#126239;padding:8px 11px;border-radius:999px;font-size:12px;font-weight:700}.rp-content{padding:20px 22px;overflow:auto}.rp-product{display:flex;align-items:center;gap:14px;margin-bottom:16px}.rp-product img{width:56px;height:56px;object-fit:contain;background:#fff;border-radius:10px}.rp-product h3{font-size:15px;margin:0 0 7px;max-width:900px}.rp-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rp-tags span,.rp-ranks span{font-size:11px;background:#e8eeea;padding:5px 8px;border-radius:7px;color:#526259}.rp-copy{border:0;background:#dce8e0;color:#176e42;border-radius:6px;padding:3px 7px}.rp-grid{display:grid;gap:10px}.rp-grid.top{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px}.rp-metric{background:#fff;border:1px solid #dce5df;border-radius:12px;padding:12px;display:grid;gap:4px}.rp-metric span{font-size:11px;color:#697970}.rp-metric strong{font-size:18px}.rp-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.rp-card{background:#fff;border:1px solid #dce5df;border-radius:14px;padding:15px;min-width:0}.rp-card-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.rp-card h4{font-size:14px;margin:0}.rp-card-title>span{font-size:10px;color:#6d7b73}.rp-status{font-size:11px;color:#6d7b73}.rp-status.good{color:#147642}.rp-status.bad{color:#b82f3a}.rp-status.pending{color:#9d650d}.rp-card-title small{display:block}.rp-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rp-form-grid label{display:grid;gap:5px}.rp-form-grid label span{font-size:11px;color:#5e6d65}.rp-form-grid input{width:100%;border:1px solid #cbd8d0;border-radius:9px;padding:9px 10px;color:#17231d;background:#fbfdfc;outline:none}.rp-form-grid input:focus{border-color:#258b55;box-shadow:0 0 0 3px #258b5520}.rp-actions{display:flex;gap:8px;margin-top:12px}.rp-actions button{border:1px solid #cbd8d0;background:#fff;border-radius:9px;padding:9px 11px;font-size:11px;font-weight:700}.rp-actions .primary{background:#176e42;border-color:#176e42;color:#fff}.rp-lines{display:grid;gap:8px}.rp-lines>div{display:flex;justify-content:space-between;align-items:start;gap:12px;font-size:12px}.rp-lines>div span{color:#68776f}.rp-lines .total{border-top:1px solid #e2e9e4;padding-top:9px;margin-top:2px}.rp-lines .total b{font-size:15px}.rp-empty{padding:20px;background:#f3f6f4;color:#6a7870;border-radius:10px;font-size:12px;line-height:1.5}.offers{grid-template-columns:repeat(4,1fr)}.offers .rp-metric{background:#f6f9f7;padding:9px}.offers .rp-metric strong{font-size:16px}.rp-note{font-size:10px;color:#78857e;line-height:1.45;margin:10px 0}.rp-sellers{max-height:120px;overflow:auto;display:grid;gap:5px}.rp-sellers>div{display:flex;justify-content:space-between;font-size:11px;border-top:1px solid #edf1ee;padding-top:5px}.rp-sellers b{font-size:9px;padding:3px 6px;border-radius:5px;background:#e8eeea}.rp-sellers .fba{background:#e1f6e8;color:#13733f}.rp-sellers .fbm{background:#fff1dc;color:#955d09}.rp-sellers .amazon{background:#e5effd;color:#1b5aa2}.link{border:0;background:none;color:#176e42;font-size:11px;font-weight:700}.rp-ranks{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}
    @media(max-width:850px){.rp-panel{inset:1vh 1vw}.rp-columns{grid-template-columns:1fr}.rp-grid.top{grid-template-columns:repeat(2,1fr)}}
  `;
  }

  async function refresh() {
    const next = extractProduct();
    if (!next.asin) {
      host?.remove();
      return;
    }
    const changedProduct = !product || next.asin !== product.asin;
    product = next;
    if (changedProduct) {
      fees = null;
      feesStatus = "idle";
      offers = {
        status: "idle",
        fba: null,
        fbm: null,
        amazon: null,
        total: null,
        sellers: [],
      };
      lastFingerprint = "";
      inputs = {
        salePrice: product.price ?? "",
        productCost: settings.defaultProductCost,
        prepFee: settings.defaultPrepFee,
        inboundShipping: settings.defaultInboundShipping,
        otherCost: settings.defaultOtherCost,
      };
    } else if (!inputs.salePrice && product.price)
      inputs.salePrice = product.price;
    if (!host) {
      host = document.createElement("div");
      host.id = "rizpoint-fba-research-root";
      shadow = host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    render();
    if (changedProduct && settings.autoLoadOfficialFees) loadFees();
    if (changedProduct && settings.autoLoadOffers) loadOffers();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_DATA") {
      sendResponse({
        ok: Boolean(product?.asin),
        marketplace,
        product,
        fees,
        feesStatus,
        feeError,
        offers,
        inputs,
        calculation: calculation(),
      });
      return false;
    }
    if (message?.type === "OPEN_PANEL") {
      openPanel();
      sendResponse({ ok: true });
      return false;
    }
  });

  (async () => {
    await loadSettings();
    await refresh();
    let previousUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== previousUrl) {
        previousUrl = location.href;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 350);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  })();
})();
