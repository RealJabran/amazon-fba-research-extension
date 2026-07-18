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
  if (!stored.settings)
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
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

function amount(value) {
  return (
    RizPointCore.normalizeDecimal(
      value?.total?.amount ?? value?.amount ?? value,
    ) ?? "0"
  );
}

function parseFeeResult(data) {
  const core = data?.data?.programFeeResultMap?.["Core#0"];
  if (!core)
    throw new Error(
      "Amazon returned no FBA fee result for this ASIN and price",
    );
  const map = core.otherFeeInfoMap || {};
  const known = new Set([
    "ReferralFee",
    "FulfillmentFee",
    "FixedClosingFee",
    "VariableClosingFee",
    "DigitalServicesFee",
  ]);
  const otherAmazonFee = RizPointCore.sumDecimals(
    Object.entries(map)
      .filter(([key]) => !known.has(key))
      .map(([, value]) => amount(value)),
  );
  return {
    referralFee: amount(map.ReferralFee),
    fulfillmentFee: amount(map.FulfillmentFee),
    closingFee: RizPointCore.sumDecimals([
      amount(map.FixedClosingFee),
      amount(map.VariableClosingFee),
    ]),
    digitalServicesFee: amount(map.DigitalServicesFee),
    otherAmazonFee,
    storageFee: amount(core.perUnitNonPeakStorageFee),
    peakStorageFee: amount(core.perUnitPeakStorageFee),
    rawFeeNames: Object.keys(map),
  };
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
  return {
    ok: true,
    source: "Amazon Revenue Calculator",
    sourceUrl: calculatorUrl(market),
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    productGroup: gl,
    officialProduct: {
      title: product.title || null,
      salesRank: product.salesRank || null,
      salesRankCategory: product.salesRankContextName || null,
    },
    fees: parseFeeResult(feeData),
  };
}
