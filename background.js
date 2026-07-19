importScripts("shared/core.js");

const {
  MARKETPLACES,
  DEFAULT_SETTINGS,
  mergeSettings,
  normalizeNumber,
  normalizeDecimal,
  calculatorUrl,
} = RizPointCore;
const marketById = Object.values(MARKETPLACES).reduce(
  (all, market) => ({ ...all, [market.id]: market }),
  {},
);

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get("settings");
  const currentVersion = Number(stored.settings?.settingsVersion || 0);
  const next = mergeSettings(stored.settings);
  if (currentVersion < 2) {
    next.includeStorageFee = true;
    next.settingsVersion = 2;
  }
  await chrome.storage.sync.set({ settings: next });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_SETTINGS") {
    chrome.storage.sync
      .get("settings")
      .then(({ settings }) =>
        sendResponse({ ok: true, settings: mergeSettings(settings) }),
      );
    return true;
  }
  if (message?.type === "SAVE_SETTINGS") {
    chrome.storage.sync
      .set({ settings: mergeSettings(message.settings) })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "GET_OFFICIAL_FEES") {
    getOfficialFees(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "OPEN_CALCULATOR") {
    const market = marketById[message.marketplaceId];
    if (market) chrome.tabs.create({ url: calculatorUrl(market) });
    sendResponse({ ok: Boolean(market) });
    return false;
  }
  if (message?.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  if (!response.ok)
    throw new Error(
      `Amazon Revenue Calculator returned HTTP ${response.status}`,
    );
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json"))
    throw new Error("Amazon Revenue Calculator did not return JSON");
  const data = await response.json();
  if (data?.succeed === false)
    throw new Error(
      data?.message || "Amazon Revenue Calculator rejected the request",
    );
  return data;
}

function findMatchedProduct(data, asin) {
  const body = data?.data || {};
  const groups = [
    body.products,
    body.otherProducts?.products,
    body.matchingProducts?.products,
    body.productMatches,
  ];
  const products = groups.flatMap((group) =>
    Array.isArray(group) ? group : [],
  );
  return (
    products.find(
      (product) => String(product.asin || "").toUpperCase() === asin,
    ) ||
    products[0] ||
    null
  );
}

async function getOfficialFees(payload) {
  const market = marketById[payload?.marketplaceId];
  const asin = String(payload?.asin || "").toUpperCase();
  const price = normalizeDecimal(payload?.price);
  if (!market || !/^[A-Z0-9]{10}$/.test(asin) || !(normalizeNumber(price) > 0))
    return { ok: false, error: "Marketplace, ASIN, or price is invalid" };

  const base = `https://${market.sellerCentral}/rcpublic`;
  const matchUrl = `${base}/productmatch?searchKey=${encodeURIComponent(asin)}&countryCode=${market.countryCode}&locale=${market.locale}`;
  const matchData = await requestJson(matchUrl);
  const product = findMatchedProduct(matchData, asin);
  if (!product)
    throw new Error("ASIN was not found by Amazon Revenue Calculator");
  const gl = product.gl || product.glProductGroupName;
  if (!gl)
    throw new Error("Amazon did not return the fee category (product group)");

  const body = {
    countryCode: market.countryCode,
    itemInfo: {
      asin,
      glProductGroupName: gl,
      packageLength: "0",
      packageWidth: "0",
      packageHeight: "0",
      dimensionUnit: "",
      packageWeight: "0",
      weightUnit: "",
      afnPriceStr: String(price),
      mfnPriceStr: String(price),
      mfnShippingPriceStr: "0",
      currency: market.currency,
      isNewDefined: "false",
    },
    programIdList: ["Core#0", "MFN#1"],
    programParamMap: {},
  };
  const feeData = await requestJson(
    `${base}/getfees?countryCode=${market.countryCode}&locale=${market.locale}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const parsedFees = RizPointCore.parseAmazonFeeResult(feeData);
  if (!parsedFees)
    throw new Error(
      "Amazon returned no FBA fee result for this ASIN and price",
    );
  return {
    ok: true,
    source: "Amazon Revenue Calculator",
    sourceUrl: calculatorUrl(market),
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    calculatedAtPrice: String(price),
    productGroup: gl,
    officialProduct: {
      title: product.title || null,
      salesRank: product.salesRank || null,
      salesRankCategory: product.salesRankContextName || null,
    },
    fees: parsedFees,
  };
}
