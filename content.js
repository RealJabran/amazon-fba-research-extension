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
  let overviewHost;
  let overviewShadow;
  let lastFingerprint = "";
  let feeRequestSequence = 0;
  let offerRequestSequence = 0;
  let salePriceManuallyEdited = false;
  let refreshTimer;
  let aodRefreshTimer;
  let observedAodContainer;
  let explorerHost;
  let explorerShadow;
  let explorerItems = [];
  let explorerState = { sort: "sales-high", minimumSales: 0, query: "" };

  const text = (selector) =>
    document.querySelector(selector)?.textContent?.trim() || "";
  const firstText = (selectors) => selectors.map(text).find(Boolean) || "";
  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  function listingCards() {
    const selectors = [
      '[data-component-type="s-search-result"][data-asin]',
      ".s-result-item[data-asin]",
      '[data-testid="product-grid"] [data-asin]',
      ".ProductGridItem__itemOuter__KUtvv [data-asin]",
      ".storefront-product-card[data-asin]",
    ];
    return [...new Set(document.querySelectorAll(selectors.join(",")))].filter(
      (node) => Core.parseAsin(node.dataset.asin),
    );
  }

  function readListingCard(node) {
    const cardText = clean(node.textContent);
    const priceText = clean(
      node.querySelector('.a-price .a-offscreen, [data-a-color="price"]')
        ?.textContent || "",
    );
    return {
      node,
      asin: Core.parseAsin(node.dataset.asin),
      title: clean(
        node.querySelector("h2, h3, [data-cy='title-recipe']")?.textContent ||
          node.querySelector("img[alt]")?.alt ||
          "Amazon item",
      ),
      price: Core.normalizeNumber(priceText),
      priceText,
      monthlySales: Core.parseMonthlySales(cardText),
    };
  }

  function applyExplorer() {
    const ranked = Core.rankResearchItems(explorerItems, explorerState);
    const shown = new Set(ranked.map((item) => item.asin));
    explorerItems.forEach((item) => {
      item.node.hidden = !shown.has(item.asin);
      item.node.style.order = shown.has(item.asin)
        ? String(
            ranked.findIndex((rankedItem) => rankedItem.asin === item.asin),
          )
        : "";
      let badge = item.node.querySelector(":scope > .rizpoint-listing-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "rizpoint-listing-badge";
        badge.style.cssText =
          "margin:6px;padding:7px 9px;border-radius:8px;background:#102a20;color:#fff;font:700 12px/1.3 Arial,sans-serif;position:relative;z-index:2";
        item.node.prepend(badge);
      }
      const badgeText = `${item.priceText || "Price unavailable"} · ${item.monthlySales === null ? "Monthly sales not shown" : `${item.monthlySales.toLocaleString()}+ bought last month`}`;
      if (badge.textContent !== badgeText) badge.textContent = badgeText;
    });
    const count = explorerShadow?.getElementById("rp-explorer-count");
    if (count)
      count.textContent = `${ranked.length} of ${explorerItems.length} items`;
  }

  function renderExplorer() {
    const cards = listingCards();
    if (!cards.length) {
      explorerHost?.remove();
      explorerHost = explorerShadow = null;
      return;
    }
    explorerItems = cards.map(readListingCard);
    if (!explorerHost) {
      explorerHost = document.createElement("div");
      explorerHost.id = "rizpoint-store-research-root";
      explorerShadow = explorerHost.attachShadow({ mode: "open" });
      document.documentElement.appendChild(explorerHost);
    }
    explorerShadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}.bar{position:fixed;z-index:2147483645;left:50%;bottom:18px;transform:translateX(-50%);width:min(920px,calc(100vw - 28px));display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #327054;border-radius:14px;background:#102a20;color:#fff;box-shadow:0 16px 46px #0006;font:12px Inter,Arial,sans-serif}.brand{display:grid;min-width:138px}.brand small{color:#91dfad;font-size:8px;letter-spacing:.14em;font-weight:900}.brand b{font-size:13px}.count{color:#c8d9d0;white-space:nowrap}select,input{height:34px;border:1px solid #527360;border-radius:8px;background:#fff;color:#17231d;padding:0 9px;font:12px Arial,sans-serif}input[type=search]{flex:1;min-width:100px}.sales{width:145px}.reset{height:34px;border:1px solid #5c7e6b;border-radius:8px;background:#1c4935;color:#fff;padding:0 12px;font-weight:700;cursor:pointer}@media(max-width:720px){.brand{display:none}.bar{flex-wrap:wrap}.count{width:100%}input[type=search]{order:3}}
    </style><section class="bar" aria-label="RizPoint store and search research filters"><div class="brand"><small>RIZPOINT</small><b>Store Research</b></div><span id="rp-explorer-count" class="count"></span><input id="rp-explorer-query" type="search" placeholder="Title or ASIN" value="${escapeHtml(explorerState.query)}"><select id="rp-explorer-sort" aria-label="Sort products"><option value="sales-high">Most bought last month</option><option value="price-high">Highest price</option><option value="price-low">Lowest price</option></select><input id="rp-explorer-sales" class="sales" type="number" min="0" step="1" placeholder="Min units / month" value="${explorerState.minimumSales || ""}"><button id="rp-explorer-reset" class="reset">Reset</button></section>`;
    explorerShadow.getElementById("rp-explorer-sort").value =
      explorerState.sort;
    explorerShadow.getElementById("rp-explorer-query").oninput = (event) => {
      explorerState.query = event.currentTarget.value;
      applyExplorer();
    };
    explorerShadow.getElementById("rp-explorer-sort").onchange = (event) => {
      explorerState.sort = event.currentTarget.value;
      applyExplorer();
    };
    explorerShadow.getElementById("rp-explorer-sales").oninput = (event) => {
      explorerState.minimumSales = event.currentTarget.value;
      applyExplorer();
    };
    explorerShadow.getElementById("rp-explorer-reset").onclick = () => {
      explorerState = { sort: "sales-high", minimumSales: 0, query: "" };
      renderExplorer();
    };
    applyExplorer();
  }

  function parseRanks(bodyText) {
    const seen = new Set();
    const detailNodes = [
      ...document.querySelectorAll(
        "#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li, #productDetails_detailBullets_sections1 tr, #productDetails_db_sections tr, #prodDetails tr",
      ),
    ];
    const sources = detailNodes
      .map((node) => clean(node.textContent))
      .filter((value) => value.includes("#"));
    if (!sources.length) sources.push(bodyText);
    return sources.flatMap(Core.parseRankText).filter((item) => {
      const key = `${item.rank}:${item.category.toLowerCase()}`;
      return !seen.has(key) && seen.add(key);
    });
  }

  function detailText() {
    return [
      "#detailBullets_feature_div",
      "#productDetails_detailBullets_sections1",
      "#productDetails_techSpec_section_1",
      "#productOverview_feature_div",
      "#poExpander",
      "#prodDetails",
    ]
      .map((selector) => text(selector))
      .filter(Boolean)
      .join("\n");
  }

  function labeledDetail(labelPattern) {
    const labelRegex = new RegExp(labelPattern, "i");
    const candidates = [
      ...document.querySelectorAll(
        "#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li, #productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr, #productDetails_db_sections tr, #productOverview_feature_div tr, #poExpander tr, #prodDetails tr",
      ),
    ];
    for (const node of candidates) {
      const label = clean(
        node.querySelector("th, .a-text-bold, .prodDetSectionEntry")
          ?.textContent || "",
      ).replace(/[:：]$/, "");
      if (!labelRegex.test(label)) continue;
      const value = clean(
        node.querySelector("td, .prodDetAttrValue")?.textContent ||
          node.textContent.replace(label, ""),
      ).replace(/^[：:]\s*/, "");
      if (value) return value;
    }
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
    const category = Core.categoryIntelligence(breadcrumbs, ranks);
    return {
      asin,
      title: firstText(["#productTitle", "#title", "h1.a-size-large"]),
      price: Core.normalizeDecimal(priceText),
      priceText,
      category: category.parentCategory,
      parentCategory: category.parentCategory,
      parentBsr: category.parentBsr,
      subCategory: category.subCategory,
      subCategoryBsr: category.subCategoryBsr,
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

  function canonicalizationKey(asin = Core.parseAsin(location.href)) {
    return asin ? `rizpoint:clean-url:${marketplace.id}:${asin}` : "";
  }

  function canonicalizationAttempted(asin) {
    try {
      return sessionStorage.getItem(canonicalizationKey(asin)) === "1";
    } catch (_) {
      return false;
    }
  }

  function markCanonicalizationAttempted(asin, attempted = true) {
    const key = canonicalizationKey(asin);
    if (!key) return;
    try {
      if (attempted) sessionStorage.setItem(key, "1");
      else sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function canonicalizeCurrentProductUrl() {
    if (!settings.canonicalizeProductUrls) return false;
    const asin = Core.parseAsin(location.href);
    const canonical = Core.canonicalProductUrl(location.href);
    if (
      !asin ||
      !canonical ||
      !Core.shouldCanonicalizeProductUrl(
        location.href,
        canonicalizationAttempted(asin),
      )
    )
      return false;
    markCanonicalizationAttempted(asin);
    try {
      location.replace(canonical);
    } catch (error) {
      markCanonicalizationAttempted(asin, false);
      throw error;
    }
    return true;
  }

  async function setCanonicalizeProductUrls(enabled) {
    const previous = settings;
    settings = Core.mergeSettings({
      ...settings,
      canonicalizeProductUrls: Boolean(enabled),
    });
    render();
    const response = await chrome.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings,
    });
    if (!response?.ok) {
      settings = previous;
      render();
      return;
    }
    if (enabled) canonicalizeCurrentProductUrl();
    else markCanonicalizationAttempted(Core.parseAsin(location.href), false);
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
    const requestId = ++feeRequestSequence;
    feesStatus = "loading";
    feeError = "";
    render();
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "GET_OFFICIAL_FEES",
        payload: {
          marketplaceId: marketplace.id,
          asin: product.asin,
          price: inputs.salePrice,
        },
      });
    } catch (error) {
      response = { ok: false, error: error.message };
    }
    if (
      requestId !== feeRequestSequence ||
      fingerprint !== `${marketplace.id}:${product?.asin}:${inputs.salePrice}`
    )
      return;
    if (response?.ok) {
      fees = {
        ...response.fees,
        calculatedAtPrice: response.calculatedAtPrice || inputs.salePrice,
      };
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

  function offerFieldByLabel(node, labelPattern) {
    const labelRegex = new RegExp(`^${labelPattern}\\b`, "i");
    const rows = [...node.querySelectorAll(".a-row, .a-section, li, tr")];
    for (const row of rows) {
      const children = [...row.children].filter((child) =>
        clean(child.textContent),
      );
      const labelIndex = children.findIndex((child) =>
        labelRegex.test(clean(child.textContent).replace(/[:：]$/, "")),
      );
      if (labelIndex < 0) continue;
      const value = clean(
        children
          .slice(labelIndex + 1)
          .map((child) => child.textContent)
          .join(" "),
      );
      if (value) return value;
      const rowText = clean(row.textContent);
      const match = rowText.match(
        new RegExp(`${labelPattern}\\s*[:：]?\\s*(.+)`, "i"),
      );
      if (match?.[1]) return clean(match[1]);
    }
    const fullText = clean(node.textContent);
    const match = fullText.match(
      new RegExp(
        `${labelPattern}\\s*[:：]?\\s*(.+?)(?=\\s+(?:Sold by|Seller|Fulfilled by|Ships from|Dispatches from|Condition)\\b|$)`,
        "i",
      ),
    );
    return clean(match?.[1] || "");
  }

  function classifyOffer(node) {
    const fieldText = (selector) => {
      const field = node.querySelector(selector);
      return clean(
        field?.querySelector(
          ".a-fixed-left-grid-col.a-col-right, .a-col-right, span.a-size-small:last-child",
        )?.textContent || field?.textContent,
      );
    };
    const shipsFrom = fieldText(
      "#aod-offer-shipsFrom, [id*='shipsFrom'], [id*='ships-from']",
    )
      .replace(/^(Ships from|Dispatches from|الشحن من)\s*:?\s*/i, "")
      .trim();
    const fulfilledBy = (
      fieldText(
        "#aod-offer-fulfilledBy, [id*='fulfilledBy'], [id*='fulfillment'], [id*='fulfiller']",
      ) || offerFieldByLabel(node, "Fulfilled by|Fulfillment by|الشحن بواسطة")
    )
      .replace(/^(Fulfilled by|Fulfillment by|الشحن بواسطة)\s*:?\s*/i, "")
      .trim();
    const soldByNode = node.querySelector(
      "#aod-offer-soldBy a, [id*='soldBy'] a, [id*='sold-by'] a, a[href*='seller=']",
    );
    const soldBy = clean(
      soldByNode?.textContent ||
        fieldText("#aod-offer-soldBy, [id*='soldBy'], [id*='sold-by']") ||
        offerFieldByLabel(node, "Sold by|Seller|البائع"),
    )
      .replace(/^(Sold by|Seller|البائع)\s*:?\s*/i, "")
      .trim();
    let sellerId = soldBy;
    let isAmazonFulfilled = Boolean(
      node.querySelector("a[href*='isAmazonFulfilled=1']"),
    );
    try {
      const sellerUrl = new URL(soldByNode?.href || location.href);
      sellerId =
        sellerUrl.searchParams.get("seller") ||
        sellerUrl.searchParams.get("me") ||
        soldBy;
      isAmazonFulfilled =
        isAmazonFulfilled ||
        sellerUrl.searchParams.get("isAmazonFulfilled") === "1";
    } catch (_) {
      sellerId = soldBy;
    }
    return {
      name: soldBy || "Unknown seller",
      sellerId,
      fulfillment: Core.classifyFulfillment(
        soldBy,
        fulfilledBy || shipsFrom,
        isAmazonFulfilled,
      ),
      shipsFrom: fulfilledBy || shipsFrom,
    };
  }

  function observedOfferTotal(featured = null) {
    const source = firstText([
      "#aod-ingress-link",
      "#aod-ingress-link .a-size-small",
      "#olpLinkWidget_feature_div",
      "#mbc",
    ]);
    const match =
      source.match(/([0-9][0-9,]*)\s+other\s+(?:options?|offers?|sellers?)/i) ||
      source.match(
        /(?:New|Used|Other sellers|offers?)\s*\(?([0-9][0-9,]*)\)?|\(([0-9][0-9,]*)\)/i,
      );
    if (!match) return null;
    const count = Number((match[1] || match[2]).replace(/,/g, ""));
    const excludesFeatured = /\bother\s+(?:options?|offers?|sellers?)\b/i.test(
      source,
    );
    return count + (featured && excludesFeatured ? 1 : 0);
  }

  function offerTotalFromDocument(doc, ingressTotal = null) {
    const countNode = doc.querySelector("#aod-total-offer-count");
    const labelNode = doc.querySelector("#aod-total-offer-count-string");
    const filterLabel = clean(
      doc.querySelector("#aod-filter-offer-count-string")?.textContent || "",
    );
    return Core.resolveOfferTotal({
      ingressTotal,
      hiddenCount:
        countNode?.value || countNode?.getAttribute("value") || filterLabel,
      hiddenLabel:
        labelNode?.value || labelNode?.getAttribute("value") || filterLabel,
      hasPinnedOffer: Boolean(
        doc.querySelector("#aod-sticky-pinned-offer, #aod-pinned-offer"),
      ),
    });
  }

  function offerNodes(doc) {
    return [
      ...doc.querySelectorAll(
        "#aod-sticky-pinned-offer, #aod-pinned-offer, #aod-offer, .aod-offer",
      ),
    ];
  }

  function addObservedSeller(unique, seller) {
    if (seller.name === "Unknown seller" && !seller.shipsFrom) return false;
    const normalizedName = seller.name.toLowerCase().replace(/\s+/g, " ");
    const existing = [...unique.entries()].find(
      ([, item]) =>
        (seller.sellerId && item.sellerId === seller.sellerId) ||
        item.name.toLowerCase().replace(/\s+/g, " ") === normalizedName,
    );
    if (existing) {
      unique.set(existing[0], {
        ...existing[1],
        ...seller,
        sellerId: seller.sellerId || existing[1].sellerId,
      });
      return false;
    }
    unique.set(
      seller.sellerId || normalizedName || `seller-${unique.size + 1}`,
      seller,
    );
    return true;
  }

  function hasObservedSeller(unique, seller) {
    if (seller.name === "Unknown seller" && !seller.shipsFrom) return true;
    const normalizedName = seller.name.toLowerCase().replace(/\s+/g, " ");
    return [...unique.values()].some(
      (item) =>
        (seller.sellerId && item.sellerId === seller.sellerId) ||
        item.name.toLowerCase().replace(/\s+/g, " ") === normalizedName,
    );
  }

  function offerIngressUrls(page = 1, previousDocument = null) {
    const urls = new Set();
    const addUrl = (value) => {
      if (!value) return;
      try {
        const url = new URL(value, location.origin);
        if (!url.searchParams.get("asin"))
          url.searchParams.set("asin", product.asin);
        if (page > 1) url.searchParams.set("pageno", String(page));
        urls.add(`${url.pathname}${url.search}`);
      } catch (_) {}
    };

    if (page > 1 && previousDocument) {
      previousDocument
        .querySelectorAll(
          "#aod-pagn-next-link[href], .a-pagination .a-last:not(.a-disabled) a[href], a[href*='/gp/aod/ajax'][href*='pageno=']",
        )
        .forEach((node) => addUrl(node.getAttribute("href")));
    }

    Core.amazonOfferPageUrls(product.asin, page).forEach((url) =>
      urls.add(url),
    );

    if (page === 1) {
      document
        .querySelectorAll(
          "a[href*='/gp/aod'], a[href*='/gp/offer-listing'], #aod-ingress-link, [data-action*='show-all-offers'] a",
        )
        .forEach((node) => addUrl(node.getAttribute("href")));
    }
    return [...urls];
  }

  function featuredOffer() {
    const sellerNode = document.querySelector(
      "#sellerProfileTriggerId, #merchant-info a[href*='seller='], #merchant-info a[href*='me=']",
    );
    const merchant = clean(text("#merchant-info"));
    let soldBy = clean(sellerNode?.textContent);
    if (!soldBy) {
      soldBy = clean(
        merchant.match(/(?:Sold by|Seller|البائع)\s*:?\s*([^,.]+)/i)?.[1],
      );
    }
    if (!soldBy && /Ships from and sold by Amazon/i.test(merchant))
      soldBy = "Amazon";
    if (!soldBy) return null;
    const shipsFrom = firstText([
      "#fulfillerInfoFeature_feature_div .offer-display-feature-text",
      "#shipsFromSoldBy_feature_div .offer-display-feature-text",
      "#merchant-info",
    ]);
    let sellerId = soldBy;
    try {
      const sellerUrl = new URL(sellerNode?.href || location.href);
      sellerId =
        sellerUrl.searchParams.get("seller") ||
        sellerUrl.searchParams.get("me") ||
        soldBy;
    } catch (_) {
      sellerId = soldBy;
    }
    return {
      name: soldBy,
      sellerId,
      fulfillment: Core.classifyFulfillment(soldBy, shipsFrom),
      shipsFrom: clean(shipsFrom),
    };
  }

  async function fetchOfferDocument(
    page = 1,
    previousDocument = null,
    knownSellers = null,
  ) {
    let fallback = null;
    for (const url of offerIngressUrls(page, previousDocument)) {
      let response;
      try {
        response = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "text/html, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
          },
        });
      } catch (_) {
        continue;
      }
      if (!response.ok) continue;
      const html = await response.text();
      if (!html || /validateCaptcha|enter the characters you see/i.test(html))
        continue;
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (
        !doc.querySelector(
          "#aod-offer, .aod-offer, #aod-pinned-offer, #aod-container",
        )
      )
        continue;
      fallback ||= doc;
      if (
        !knownSellers ||
        offerNodes(doc)
          .map(classifyOffer)
          .some((seller) => !hasObservedSeller(knownSellers, seller))
      )
        return doc;
    }
    return fallback;
  }

  function primeFilterId(doc) {
    for (const node of doc?.querySelectorAll?.(
      "[data-aod-toggle-filter-checkbox]",
    ) || []) {
      try {
        const action = JSON.parse(
          node.getAttribute("data-aod-toggle-filter-checkbox") || "{}",
        );
        if (/prime/i.test(action.checkboxID || action.refMarker || ""))
          return action.checkboxID || "primeEligible";
      } catch (_) {}
    }
    return "primeEligible";
  }

  function filterCountLabel(doc) {
    const nodes = [
      doc.querySelector("#aod-filter-offer-count-string"),
      doc.querySelector("#aod-total-offer-count-string"),
      doc.querySelector("#aod-total-offer-count"),
    ];
    return clean(
      nodes
        .map(
          (node) =>
            node?.textContent ||
            node?.value ||
            node?.getAttribute?.("value") ||
            "",
        )
        .find(Boolean) || "",
    );
  }

  async function fetchPrimeOfferTotal(featured, sourceDocument = null) {
    const filterId = primeFilterId(sourceDocument);
    for (const url of Core.amazonOfferFilterUrls(product.asin, filterId)) {
      let response;
      try {
        response = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "text/html, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
          },
        });
      } catch (_) {
        continue;
      }
      if (!response.ok) continue;
      const html = await response.text();
      if (!html || /validateCaptcha|enter the characters you see/i.test(html))
        continue;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const label = filterCountLabel(doc);
      if (!label) continue;
      const filteredPinnedNode = doc.querySelector(
        "#aod-sticky-pinned-offer, #aod-pinned-offer",
      );
      const filteredPinnedIsPrime = Boolean(
        filteredPinnedNode &&
        ["FBA", "Amazon"].includes(
          classifyOffer(filteredPinnedNode).fulfillment,
        ),
      );
      const featuredIsPrime = ["FBA", "Amazon"].includes(featured?.fulfillment);
      const total = Core.offerTotalFromFilterLabel(
        label,
        filteredPinnedIsPrime || featuredIsPrime,
      );
      if (total !== null) return total;
    }
    return null;
  }

  async function loadOffers(force = false) {
    if (!product?.asin || (offers.status === "loading" && !force)) return;
    const requestId = ++offerRequestSequence;
    const requestedAsin = product.asin;
    offers = { ...offers, status: "loading" };
    render();
    try {
      const unique = new Map();
      const featured = featuredOffer();
      if (featured) addObservedSeller(unique, featured);
      let primeTotal = null;
      let advertisedTotal = observedOfferTotal(featured);
      let loadedDocument = false;
      const liveDocument = document.querySelector("#aod-container")
        ? document
        : null;
      if (liveDocument) {
        loadedDocument = true;
        advertisedTotal = offerTotalFromDocument(liveDocument, advertisedTotal);
        offerNodes(liveDocument)
          .map(classifyOffer)
          .forEach((seller) => addObservedSeller(unique, seller));
      }
      let stagnantPages = 0;
      let previousDocument = null;
      for (let page = 1; page <= 20; page += 1) {
        if (advertisedTotal && unique.size >= advertisedTotal) break;
        const doc = await fetchOfferDocument(page, previousDocument, unique);
        if (!doc) break;
        previousDocument = doc;
        loadedDocument = true;
        const before = unique.size;
        advertisedTotal = offerTotalFromDocument(doc, advertisedTotal);
        offerNodes(doc)
          .map(classifyOffer)
          .forEach((seller) => addObservedSeller(unique, seller));
        if (page === 1) {
          primeTotal = await fetchPrimeOfferTotal(featured, doc);
          const earlyBreakdown = Core.offerBreakdownFromPrimeFilter({
            total: advertisedTotal || unique.size,
            primeTotal,
            amazon: [...unique.values()].filter(
              (seller) => seller.fulfillment === "Amazon",
            ).length,
          });
          if (earlyBreakdown) break;
        }
        const hasNext = Boolean(
          doc.querySelector(
            "#aod-pagn-next-link, .a-pagination .a-last:not(.a-disabled)",
          ),
        );
        stagnantPages = unique.size === before ? stagnantPages + 1 : 0;
        if (stagnantPages >= 2) break;
        if (!advertisedTotal && !hasNext) break;
      }
      const sellers = [...unique.values()];
      const sellersComplete = Boolean(
        sellers.length &&
        (!advertisedTotal || sellers.length >= advertisedTotal),
      );
      const observedAmazon = sellers.filter(
        (seller) => seller.fulfillment === "Amazon",
      ).length;
      primeTotal ??= await fetchPrimeOfferTotal(featured, previousDocument);
      const primeBreakdown = Core.offerBreakdownFromPrimeFilter({
        total: advertisedTotal || sellers.length,
        primeTotal,
        amazon: observedAmazon,
      });
      const complete = Boolean(primeBreakdown || sellersComplete);
      if (requestId !== offerRequestSequence || product?.asin !== requestedAsin)
        return;
      offers = {
        status: complete
          ? "observed"
          : sellers.length
            ? "partial"
            : loadedDocument
              ? "unavailable"
              : "error",
        sellers,
        total: primeBreakdown?.total ?? advertisedTotal ?? sellers.length,
        loaded: sellers.length,
        complete,
        source: primeBreakdown ? "amazon-prime-filter" : "seller-cards",
        primeTotal: primeBreakdown?.primeTotal ?? null,
        fba:
          primeBreakdown?.fba ??
          sellers.filter((seller) => seller.fulfillment === "FBA").length,
        fbm:
          primeBreakdown?.fbm ??
          sellers.filter((seller) => seller.fulfillment === "FBM").length,
        amazon: primeBreakdown?.amazon ?? observedAmazon,
        observedAt: new Date().toISOString(),
        error:
          !sellers.length && !loadedDocument
            ? "Amazon did not return the offer list to this browser session"
            : !complete && advertisedTotal
              ? `Amazon reports ${advertisedTotal} sellers; ${sellers.length} have been classified so far`
              : "",
      };
      if (!sellers.length && !primeBreakdown)
        Object.assign(offers, {
          fba: null,
          fbm: null,
          amazon: null,
          total: null,
        });
    } catch (error) {
      if (requestId !== offerRequestSequence || product?.asin !== requestedAsin)
        return;
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

  function displayedOfferCount(value) {
    if (value === null || value === undefined) return "—";
    return offers.complete === false ? `${value}+` : value;
  }

  function listingInfo() {
    const fallbackRanks =
      product?.ranks?.length || !product?.official?.salesRank
        ? product?.ranks || []
        : [
            {
              rank: product.official.salesRank,
              category: product.official.salesRankCategory || "",
            },
          ];
    return Core.categoryIntelligence(product?.breadcrumbs || [], fallbackRanks);
  }

  function render() {
    if (!shadow || !product?.asin) return;
    const calc = calculation();
    const profitClass =
      calc.profitSign > 0 ? "positive" : calc.profitSign < 0 ? "negative" : "";
    const listing = listingInfo();
    const visible = settings.visible;
    renderOverview();
    shadow.innerHTML = `<style>${styles()}</style>
      <div id="rp-overlay" class="rp-hidden" role="dialog" aria-modal="true" aria-label="RizPoint FBA Research">
        <div class="rp-backdrop" data-close></div>
        <section class="rp-panel">
          <header><div><span class="rp-brand">RIZPOINT</span><h2>FBA Research</h2></div><div class="rp-header-actions"><span class="rp-market-pill">${marketplace.flag} ${marketplace.label} · ${marketplace.currency}</span><button data-close aria-label="Close">×</button></div></header>
          <div class="rp-content">
            <div class="rp-product">
              ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : ""}
              <div><h3>${escapeHtml(product.title || "Amazon product")}</h3><div class="rp-tags"><span>ASIN ${escapeHtml(product.asin)}</span>${copyButton(product.asin)}<span>${escapeHtml(listing.parentCategory || product.productGroup || "Parent category unavailable")}</span>${copyButton(listing.parentCategory || product.productGroup || "")}</div></div>
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
                  ${feeLine("Referral fee", fees.referralFee)}${feeLine("FBA fulfilment", fees.fulfillmentFee)}${feeLine("Per-item fee", fees.perItemFee)}${feeLine("Closing fees", fees.closingFee)}${feeLine("Digital services", fees.digitalServicesFee)}${Core.normalizeNumber(fees.otherAmazonFee) ? feeLine("Other Amazon fees", fees.otherAmazonFee) : ""}${settings.includeStorageFee ? feeLine("Monthly storage estimate", fees.storageFee) : ""}
                  <div class="total"><span>Total Amazon fees</span><b>${Core.money(calc.amazonFees, marketplace)}</b></div>
                  <div><span>Estimated payout</span><b>${Core.money(calc.netPayout, marketplace)}</b></div>
                </div><p class="rp-note">Calculated by Amazon at ${Core.money(fees.calculatedAtPrice || inputs.salePrice, marketplace)}. Storage is ${settings.includeStorageFee ? "included" : "excluded"} in the total.</p>`
                    : `<div class="rp-empty">Amazon’s official fee result is required before profit is shown. No guessed fee table is used.</div>`
                }
              </div>
              ${
                visible.offers
                  ? `<div class="rp-card">
                <div class="rp-card-title"><h4>Observed offers</h4><button id="rp-refresh-offers" class="link">Refresh</button></div>
                <div class="rp-grid offers">${metric("FBA", displayedOfferCount(offers.fba))}${metric("FBM", displayedOfferCount(offers.fbm))}${metric("Amazon", displayedOfferCount(offers.amazon))}${metric("Total sellers", offers.total ?? "—")}</div>
                <p class="rp-note">${offers.status === "partial" ? `${escapeHtml(offers.error)}. Use Refresh to retry Amazon’s remaining offer pages.` : offers.source === "amazon-prime-filter" ? "FBA and FBM totals use Amazon’s own total and Prime-filter counts. Amazon Retail is shown separately when detected." : "Counts are unique sellers classified automatically from Amazon’s current offer list for this browser and delivery location."}</p>
                <div class="rp-sellers">${
                  offers.sellers
                    .slice(0, 30)
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
                  ${visible.category ? detailLine("Parent category", listing.parentCategory || product.productGroup, true) + detailLine("Subcategory", listing.subCategory, true) : ""}
                  ${visible.bsr ? detailLine("Parent category BSR", listing.parentBsr ? `#${Number(listing.parentBsr).toLocaleString()}` : "Unavailable", true) + detailLine("Subcategory BSR", listing.subCategoryBsr ? `#${Number(listing.subCategoryBsr).toLocaleString()}` : "Unavailable", true) : ""}
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

  function buyBoxAnchor() {
    const direct = document.querySelector(
      "#desktop_qualifiedBuyBox, #buybox_feature_div, #desktop_buybox, #buybox",
    );
    if (direct)
      return (
        direct.closest("#desktop_qualifiedBuyBox, #buybox_feature_div") ||
        direct
      );
    return document.querySelector("#rightCol, #right-col");
  }

  function ensureOverviewHost() {
    if (!settings.showFloatingWidget) {
      overviewHost?.remove();
      overviewHost = null;
      overviewShadow = null;
      return false;
    }
    const anchor = buyBoxAnchor();
    if (!anchor) return false;
    if (!overviewHost) {
      overviewHost = document.createElement("div");
      overviewHost.id = "rizpoint-buybox-overview-root";
      overviewShadow = overviewHost.attachShadow({ mode: "open" });
    }
    if (!overviewHost.isConnected) {
      if (anchor.matches("#rightCol, #right-col"))
        anchor.insertBefore(overviewHost, anchor.firstChild);
      else anchor.parentNode?.insertBefore(overviewHost, anchor);
    }
    return overviewHost.isConnected;
  }

  function renderOverview() {
    if (!product?.asin || !ensureOverviewHost() || !overviewShadow) return;
    const calc = calculation();
    const listing = listingInfo();
    const official = feesStatus === "official";
    const profitClass =
      calc.profitSign > 0 ? "positive" : calc.profitSign < 0 ? "negative" : "";
    overviewShadow.innerHTML = `<style>${overviewStyles()}</style>
      <aside class="overview" aria-label="RizPoint product research overview">
        <div class="overview-head"><div><span>RIZPOINT</span><b>FBA overview</b></div><span class="market-pill">${marketplace.flag} ${marketplace.id}</span></div>
        <label class="clean-url"><span><b>Clean seller URL</b><small>${settings.canonicalizeProductUrls ? "ON · normal Buy Box view" : "OFF · keep current link"}</small></span><input id="rp-clean-url" type="checkbox" ${settings.canonicalizeProductUrls ? "checked" : ""} aria-label="Clean seller and store product URLs"><i aria-hidden="true"></i></label>
        <div class="price-row"><div><small>Current price</small><strong>${Core.money(inputs.salePrice, marketplace)}</strong></div><label><small>Product cost (${marketplace.currency})</small><div><input id="rp-overview-cost" inputmode="decimal" value="${escapeHtml(inputs.productCost)}" placeholder="0.00" aria-label="Product cost (${marketplace.currency})"></div></label></div>
        <div class="overview-metrics">
          <div><small>Net profit</small><b class="${profitClass}">${official ? Core.money(calc.profit, marketplace) : "—"}</b></div>
          <div><small>ROI</small><b class="${profitClass}">${official && calc.roi !== null ? `${calc.roi}%` : "—"}</b></div>
          <div><small>Margin</small><b class="${profitClass}">${official && calc.margin !== null ? `${calc.margin}%` : "—"}</b></div>
          <div><small>Amazon fees</small><b>${official ? Core.money(calc.amazonFees, marketplace) : "—"}</b></div>
        </div>
        <div class="overview-lines">
          ${overviewLine("ASIN", product.asin, true)}
          ${overviewLine("Parent category", listing.parentCategory || "Unavailable", Boolean(listing.parentCategory))}
          ${overviewLine("Parent BSR", listing.parentBsr ? `#${Number(listing.parentBsr).toLocaleString()}` : "Unavailable", Boolean(listing.parentBsr))}
          ${overviewLine("Current FBA sellers", offers.status === "loading" ? "Loading…" : offers.fba === null ? "Unavailable" : displayedOfferCount(offers.fba))}
          ${overviewLine("Current FBM sellers", offers.status === "loading" ? "Loading…" : offers.fbm === null ? "Unavailable" : displayedOfferCount(offers.fbm))}
          ${overviewLine("Total current sellers", offers.total ?? (offers.status === "loading" ? "Loading…" : "Unavailable"))}
        </div>
        <div class="overview-status ${feesStatus}">${official ? "● Official Amazon fees loaded" : feesStatus === "loading" ? "Checking Amazon fees…" : feeError || "Official fees not loaded"}</div>
        <div class="overview-actions"><button id="rp-overview-open" class="primary">Full analysis</button><button id="rp-overview-refresh">Refresh fees</button></div>
      </aside>`;
    bindCopyButtons(overviewShadow);
    let overviewCostTimer;
    overviewShadow
      .getElementById("rp-overview-cost")
      ?.addEventListener("input", (event) => {
        inputs.productCost = event.currentTarget.value;
        clearTimeout(overviewCostTimer);
        overviewCostTimer = setTimeout(async () => {
          await persistProductCost();
          render();
        }, 300);
      });
    overviewShadow
      .getElementById("rp-overview-open")
      ?.addEventListener("click", openPanel);
    overviewShadow
      .getElementById("rp-overview-refresh")
      ?.addEventListener("click", () => loadFees(true));
    overviewShadow
      .getElementById("rp-clean-url")
      ?.addEventListener("change", (event) =>
        setCanonicalizeProductUrls(event.currentTarget.checked),
      );
  }

  function overviewLine(label, value, copy = false) {
    return `<div><span>${label}</span><b>${escapeHtml(value)}${copy ? copyButton(value, `Copy ${label}`) : ""}</b></div>`;
  }

  function overviewStyles() {
    return `
      :host{all:initial;display:block;margin:0 0 14px;font-family:Inter,Arial,sans-serif;color:#17231d}*{box-sizing:border-box}button,input{font:inherit}.overview{border:1px solid #cfe0d6;border-radius:14px;background:#fff;box-shadow:0 8px 24px #153c2814;overflow:hidden}.overview-head{display:flex;align-items:center;justify-content:space-between;background:#102a20;color:#fff;padding:12px 13px}.overview-head>div{display:grid;gap:1px}.overview-head>div span{font-size:9px;letter-spacing:.14em;color:#91dfad;font-weight:800}.overview-head b{font-size:14px}.market-pill{font-size:10px;background:#1d4a36;padding:5px 7px;border-radius:999px}.clean-url{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:#edf7f1;border-bottom:1px solid #dce9e1;cursor:pointer}.clean-url>span{display:grid;gap:1px}.clean-url b{font-size:10px;color:#194b32}.clean-url small{font-size:8px;color:#6b7c72}.clean-url input{position:absolute;opacity:0;pointer-events:none}.clean-url i{position:relative;width:32px;height:18px;border-radius:99px;background:#b9c7bf;transition:.18s}.clean-url i:after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0003;transition:.18s}.clean-url input:checked+i{background:#16804a}.clean-url input:checked+i:after{transform:translateX(14px)}.clean-url input:focus-visible+i{outline:2px solid #2a8d59;outline-offset:2px}.price-row{display:grid;grid-template-columns:.8fr 1.2fr;gap:9px;padding:12px 12px 9px}.price-row>div,.price-row label{display:grid;gap:5px}.price-row small,.overview-metrics small{font-size:9px;color:#68776f}.price-row strong{font-size:19px}.price-row label>div{display:flex}.price-row input{width:100%;min-width:0;border:1px solid #cad8d0;border-radius:7px;padding:7px 8px;outline:none}.price-row input:focus{border-color:#1b7a48}.overview-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e4ebe7;border-block:1px solid #e4ebe7}.overview-metrics>div{display:grid;gap:3px;background:#f8faf9;padding:9px 12px}.overview-metrics b{font-size:14px}.positive{color:#148447}.negative{color:#c83f49}.overview-lines{padding:9px 12px;display:grid;gap:7px}.overview-lines>div{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px}.overview-lines span{color:#68776f}.overview-lines b{display:flex;align-items:center;gap:5px;max-width:62%;text-align:right}.rp-copy{border:0;background:#e2eee7;color:#176e42;border-radius:5px;padding:2px 5px;cursor:pointer}.overview-status{margin:0 12px 9px;border-radius:7px;background:#eef3f0;color:#637168;padding:7px 8px;font-size:9px}.overview-status.official{background:#e2f6e9;color:#147642}.overview-status.error{background:#fde9ea;color:#ad333b}.overview-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 12px 12px}.overview-actions button{border:1px solid #cad8d0;border-radius:8px;background:#fff;color:#176e42;padding:8px 6px;font-size:10px;font-weight:800;cursor:pointer}.overview-actions .primary{background:#176e42;color:#fff;border-color:#176e42}
    `;
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
    const listing = listingInfo();
    return [
      product.asin,
      product.title,
      marketplace.id,
      listing.parentCategory || product.productGroup || "",
      listing.parentBsr || "",
      listing.subCategory || "",
      listing.subCategoryBsr || "",
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

  function productCostStorageKey() {
    return `productCost:${marketplace.id}:${product?.asin || ""}`;
  }

  async function persistProductCost() {
    if (!product?.asin) return;
    await chrome.storage.local.set({
      [productCostStorageKey()]: inputs.productCost,
    });
  }

  async function loadProductCost() {
    if (!product?.asin) return settings.defaultProductCost;
    const key = productCostStorageKey();
    const stored = await chrome.storage.local.get(key);
    return stored[key] ?? settings.defaultProductCost;
  }

  function bindCopyButtons(root) {
    root.querySelectorAll("[data-copy]").forEach((node) =>
      node.addEventListener("click", async () => {
        await navigator.clipboard.writeText(node.dataset.copy);
        const old = node.textContent;
        node.textContent = "✓";
        setTimeout(() => {
          node.textContent = old;
        }, 900);
      }),
    );
  }

  function wireEvents() {
    shadow
      .querySelectorAll("[data-close]")
      .forEach((node) => node.addEventListener("click", closePanel));
    bindCopyButtons(shadow);
    shadow.querySelectorAll("[data-input]").forEach((node) =>
      node.addEventListener("change", async () => {
        inputs[node.dataset.input] = node.value;
        if (node.dataset.input === "salePrice") {
          salePriceManuallyEdited = true;
          loadFees(true);
        } else {
          if (node.dataset.input === "productCost") await persistProductCost();
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
      ?.addEventListener("click", () =>
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }),
      );
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
    .positive{color:#148447!important}.negative{color:#c83f49!important}
    .rp-hidden{display:none!important}#rp-overlay{position:fixed;inset:0;z-index:2147483646}.rp-backdrop{position:absolute;inset:0;background:#07120db8;backdrop-filter:blur(4px)}.rp-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1120px,calc(100vw - 40px));height:min(760px,calc(100vh - 40px));background:#f5f8f6;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 28px 90px #0008}.rp-panel header,.rp-panel footer{display:flex;align-items:center;justify-content:space-between;background:#fff;padding:14px 20px;border-bottom:1px solid #dce5df}.rp-panel footer{border:0;border-top:1px solid #dce5df;font-size:11px;color:#617068}.rp-panel footer button{border:0;background:none;color:#176e42;font-weight:700}.rp-brand{font-size:9px;letter-spacing:.15em;color:#197547;font-weight:800}.rp-panel h2{font-size:18px;margin:0}.rp-header-actions{display:flex;align-items:center;gap:10px}.rp-header-actions>button{border:0;background:#edf3ef;border-radius:50%;width:32px;height:32px;font-size:22px}.rp-market-pill{background:#e7f6ec;color:#126239;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:700}.rp-content{padding:16px 18px;overflow:auto}.rp-product{display:flex;align-items:center;gap:12px;margin-bottom:13px}.rp-product img{width:48px;height:48px;object-fit:contain;background:#fff;border-radius:9px}.rp-product h3{font-size:14px;margin:0 0 6px;max-width:850px}.rp-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.rp-tags span,.rp-ranks span{font-size:10px;background:#e8eeea;padding:4px 7px;border-radius:6px;color:#526259}.rp-copy{border:0;background:#dce8e0;color:#176e42;border-radius:6px;padding:3px 7px}.rp-grid{display:grid;gap:9px}.rp-grid.top{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:12px}.rp-metric{background:#fff;border:1px solid #dce5df;border-radius:11px;padding:10px;display:grid;gap:3px}.rp-metric span{font-size:10px;color:#697970}.rp-metric strong{font-size:17px}.rp-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rp-card{background:#fff;border:1px solid #dce5df;border-radius:12px;padding:13px;min-width:0}.rp-card-title{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:10px}.rp-card h4{font-size:13px;margin:0}.rp-card-title>span{font-size:9px;color:#6d7b73}.rp-status{font-size:10px;color:#6d7b73}.rp-status.good{color:#147642}.rp-status.bad{color:#b82f3a}.rp-status.pending{color:#9d650d}.rp-card-title small{display:block}.rp-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rp-form-grid label{display:grid;gap:4px}.rp-form-grid label span{font-size:10px;color:#5e6d65}.rp-form-grid input{width:100%;border:1px solid #cbd8d0;border-radius:8px;padding:8px 9px;color:#17231d;background:#fbfdfc;outline:none}.rp-form-grid input:focus{border-color:#258b55;box-shadow:0 0 0 3px #258b5520}.rp-actions{display:flex;gap:7px;margin-top:10px}.rp-actions button{border:1px solid #cbd8d0;background:#fff;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:700}.rp-actions .primary{background:#176e42;border-color:#176e42;color:#fff}.rp-lines{display:grid;gap:7px}.rp-lines>div{display:flex;justify-content:space-between;align-items:start;gap:10px;font-size:11px}.rp-lines>div span{color:#68776f}.rp-lines .total{border-top:1px solid #e2e9e4;padding-top:8px;margin-top:2px}.rp-lines .total b{font-size:14px}.rp-empty{padding:17px;background:#f3f6f4;color:#6a7870;border-radius:9px;font-size:11px;line-height:1.5}.offers{grid-template-columns:repeat(4,1fr)}.offers .rp-metric{background:#f6f9f7;padding:8px}.offers .rp-metric strong{font-size:15px}.rp-note{font-size:9px;color:#78857e;line-height:1.45;margin:8px 0}.rp-sellers{max-height:110px;overflow:auto;display:grid;gap:4px}.rp-sellers>div{display:flex;justify-content:space-between;font-size:10px;border-top:1px solid #edf1ee;padding-top:4px}.rp-sellers b{font-size:8px;padding:3px 5px;border-radius:5px;background:#e8eeea}.rp-sellers .fba{background:#e1f6e8;color:#13733f}.rp-sellers .fbm{background:#fff1dc;color:#955d09}.rp-sellers .amazon{background:#e5effd;color:#1b5aa2}.link{border:0;background:none;color:#176e42;font-size:10px;font-weight:700}.rp-ranks{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}
    @media(max-width:850px){.rp-panel{width:calc(100vw - 16px);height:calc(100vh - 16px)}.rp-columns{grid-template-columns:1fr}.rp-grid.top{grid-template-columns:repeat(2,1fr)}}
  `;
  }

  async function refresh() {
    renderExplorer();
    const next = extractProduct();
    if (!next.asin) {
      host?.remove();
      host = shadow = null;
      overviewHost?.remove();
      overviewHost = overviewShadow = null;
      product = null;
      return;
    }
    const changedProduct = !product || next.asin !== product.asin;
    const pagePriceChanged = Boolean(
      !changedProduct &&
      next.price &&
      Core.normalizeDecimal(next.price) !==
        Core.normalizeDecimal(product.price),
    );
    product = next;
    if (changedProduct) {
      feeRequestSequence += 1;
      offerRequestSequence += 1;
      salePriceManuallyEdited = false;
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
        productCost: await loadProductCost(),
        prepFee: settings.defaultPrepFee,
        inboundShipping: settings.defaultInboundShipping,
        otherCost: settings.defaultOtherCost,
      };
    } else if (
      product.price &&
      (!inputs.salePrice || (pagePriceChanged && !salePriceManuallyEdited))
    ) {
      inputs.salePrice = product.price;
      fees = null;
      feesStatus = "idle";
      lastFingerprint = "";
    }
    if (!host) {
      host = document.createElement("div");
      host.id = "rizpoint-fba-research-root";
      shadow = host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    render();
    if (
      (changedProduct || (pagePriceChanged && !salePriceManuallyEdited)) &&
      settings.autoLoadOfficialFees
    )
      loadFees();
    if (changedProduct && settings.autoLoadOffers) loadOffers();
  }

  function pageData() {
    return {
      ok: Boolean(product?.asin),
      marketplace,
      product,
      fees,
      feesStatus,
      feeError,
      offers,
      inputs,
      calculation: calculation(),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_PAGE_DATA") {
      sendResponse(pageData());
      return false;
    }
    if (message?.type === "UPDATE_INPUTS") {
      const allowed = [
        "salePrice",
        "productCost",
        "prepFee",
        "inboundShipping",
        "otherCost",
      ];
      Object.entries(message.inputs || {}).forEach(([key, value]) => {
        if (allowed.includes(key)) inputs[key] = String(value ?? "");
      });
      if (Object.hasOwn(message.inputs || {}, "salePrice"))
        salePriceManuallyEdited = true;
      (async () => {
        if (Object.hasOwn(message.inputs || {}, "productCost"))
          await persistProductCost();
        render();
        if (Object.hasOwn(message.inputs || {}, "salePrice"))
          await loadFees(true);
        sendResponse(pageData());
      })();
      return true;
    }
    if (message?.type === "OPEN_PANEL") {
      openPanel();
      sendResponse({ ok: true });
      return false;
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.settings?.newValue) return;
    settings = Core.mergeSettings(changes.settings.newValue);
    if (!settings.canonicalizeProductUrls)
      markCanonicalizationAttempted(Core.parseAsin(location.href), false);
    if (!canonicalizeCurrentProductUrl()) render();
  });

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[href]");
      const targetAsin = Core.parseAsin(link?.href || "");
      if (targetAsin) markCanonicalizationAttempted(targetAsin, false);
    },
    true,
  );

  (async () => {
    await loadSettings();
    if (canonicalizeCurrentProductUrl()) return;
    await refresh();
    let previousUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== previousUrl) {
        previousUrl = location.href;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 350);
      }
      if (!Core.parseAsin(location.href)) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 500);
      }
      const aodContainer = document.querySelector("#aod-container");
      if (aodContainer && aodContainer !== observedAodContainer) {
        observedAodContainer = aodContainer;
        clearTimeout(aodRefreshTimer);
        aodRefreshTimer = setTimeout(() => loadOffers(true), 600);
      } else if (!aodContainer) {
        observedAodContainer = null;
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  })();
})();
