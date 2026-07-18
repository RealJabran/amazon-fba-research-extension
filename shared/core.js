(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RizPointCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MARKETPLACES = Object.freeze({
    "amazon.com": {
      id: "US",
      label: "Amazon USA",
      flag: "🇺🇸",
      currency: "USD",
      symbol: "$",
      sellerCentral: "sellercentral.amazon.com",
      countryCode: "US",
      locale: "en-US",
      lang: "en_US",
      vatRate: 0,
    },
    "amazon.co.uk": {
      id: "UK",
      label: "Amazon UK",
      flag: "🇬🇧",
      currency: "GBP",
      symbol: "£",
      sellerCentral: "sellercentral.amazon.co.uk",
      countryCode: "GB",
      locale: "en-GB",
      lang: "en_GB",
      vatRate: 20,
    },
    "amazon.ae": {
      id: "AE",
      label: "Amazon UAE",
      flag: "🇦🇪",
      currency: "AED",
      symbol: "AED ",
      sellerCentral: "sellercentral.amazon.ae",
      countryCode: "AE",
      locale: "en-AE",
      lang: "en_AE",
      vatRate: 5,
    },
    "amazon.sa": {
      id: "SA",
      label: "Amazon Saudi Arabia",
      flag: "🇸🇦",
      currency: "SAR",
      symbol: "SAR ",
      sellerCentral: "sellercentral.amazon.sa",
      countryCode: "SA",
      locale: "en-SA",
      lang: "en_SA",
      vatRate: 15,
    },
  });

  const DEFAULT_SETTINGS = Object.freeze({
    showFloatingWidget: true,
    autoLoadOfficialFees: true,
    autoLoadOffers: true,
    includeStorageFee: false,
    includeTaxReserve: false,
    taxRateOverride: "",
    defaultProductCost: "",
    defaultPrepFee: "",
    defaultInboundShipping: "",
    defaultOtherCost: "",
    visible: {
      asin: true,
      category: true,
      bsr: true,
      buyBox: true,
      offers: true,
      dimensions: true,
      fees: true,
      profit: true,
      roi: true,
      margin: true,
    },
  });

  function marketplaceFromHost(hostname) {
    const host = String(hostname || "")
      .toLowerCase()
      .replace(/^www\./, "");
    return (
      Object.entries(MARKETPLACES).find(
        ([domain]) => host === domain || host.endsWith(`.${domain}`),
      )?.[1] || null
    );
  }

  function parseAsin(value) {
    const text = String(value || "");
    const urlMatch = text.match(
      /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/i,
    );
    if (urlMatch) return urlMatch[1].toUpperCase();
    const exact = text.trim().match(/^[A-Z0-9]{10}$/i);
    return exact ? exact[0].toUpperCase() : null;
  }

  function amazonOfferPageUrls(asin, page = 1) {
    const productAsin = parseAsin(asin);
    if (!productAsin) return [];
    const pageNumber = Math.max(1, Math.trunc(Number(page) || 1));
    const query = `asin=${encodeURIComponent(productAsin)}&pc=dp&experienceId=aodAjaxMain`;
    if (pageNumber === 1) {
      return [
        `/gp/aod/ajax/ref=auto_load_aod?${query}`,
        `/gp/aod/ajax?${query}`,
      ];
    }
    return [
      `/gp/aod/ajax/ref=aod_page_${pageNumber}?${query}&pageno=${pageNumber}`,
      `/gp/aod/ajax/ref=aod_page_${pageNumber}?asin=${encodeURIComponent(productAsin)}&pc=dp&pageno=${pageNumber}`,
      `/gp/aod/ajax?${query}&pageno=${pageNumber}`,
    ];
  }

  function amazonOfferFilterUrls(asin, filterId = "primeEligible") {
    const productAsin = parseAsin(asin);
    const normalizedFilter = String(filterId || "").trim();
    if (!productAsin || !/^[A-Za-z][A-Za-z0-9]*$/.test(normalizedFilter))
      return [];
    const filters = encodeURIComponent(
      JSON.stringify({ [normalizedFilter]: true }),
    );
    const query = `asin=${encodeURIComponent(productAsin)}&pc=dp`;
    const refMarker = `aod_f_${normalizedFilter}`;
    return [
      `/gp/aod/ajax/ref=${refMarker}?${query}&experienceId=aodAjaxMain&filters=${filters}`,
      `/gp/aod/ajax/ref=${refMarker}?${query}&filters=${filters}`,
    ];
  }

  function parseRankText(value) {
    const source = String(value || "")
      .replace(/[\u200e\u200f\u202a-\u202e]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const matches = [
      ...source.matchAll(
        /#\s*([\d,.]+)\s+(?:in|en|dans|في)\s+(.+?)(?=(?:#\s*[\d,.]+\s+(?:in|en|dans|في)\s+)|\(|$)/giu,
      ),
    ];
    const seen = new Set();
    return matches
      .map((match) => ({
        rank: Number(match[1].replace(/[,\.]/g, "")),
        category: match[2]
          .replace(/^Amazon Best Sellers Rank\s*:?\s*/i, "")
          .replace(/\s+See Top \d+.*$/i, "")
          .replace(/[)|·:;,\-]+$/g, "")
          .trim(),
      }))
      .filter((item) => {
        const key = `${item.rank}:${item.category.toLowerCase()}`;
        return (
          item.rank > 0 && item.category && !seen.has(key) && seen.add(key)
        );
      });
  }

  function categoryIntelligence(breadcrumbs = [], ranks = []) {
    const cleanBreadcrumbs = breadcrumbs
      .map((item) =>
        String(item || "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    const cleanRanks = ranks.filter(
      (item) => Number(item?.rank) > 0 && String(item?.category || "").trim(),
    );
    const parent = cleanRanks[0] || null;
    const subcategory =
      cleanRanks.find(
        (item, index) =>
          index > 0 &&
          item.category.toLowerCase() !== parent?.category?.toLowerCase(),
      ) || null;
    const parentCategory = parent?.category || cleanBreadcrumbs[0] || "";
    const subCategory =
      subcategory?.category ||
      [...cleanBreadcrumbs]
        .reverse()
        .find((item) => item.toLowerCase() !== parentCategory.toLowerCase()) ||
      "";
    return {
      parentCategory,
      parentBsr: parent?.rank || null,
      subCategory,
      subCategoryBsr: subcategory?.rank || null,
    };
  }

  function classifyFulfillment(soldBy, shipsFrom, isAmazonFulfilled = false) {
    const seller = String(soldBy || "").trim();
    const shipper = String(shipsFrom || "").trim();
    const isAmazonSeller =
      /(^|\b)amazon(?:\.(?:com|co\.uk|ae|sa))?(?:\b|$)/i.test(seller);
    if (isAmazonSeller) return "Amazon";
    if (isAmazonFulfilled) return "FBA";
    return /(^|\b)amazon(?:\.(?:com|co\.uk|ae|sa))?(?:\b|$)/i.test(shipper)
      ? "FBA"
      : "FBM";
  }

  function resolveOfferTotal({
    ingressTotal,
    hiddenCount,
    hiddenLabel,
    hasPinnedOffer,
  } = {}) {
    const candidates = [];
    const ingress = normalizeNumber(ingressTotal);
    if (ingress > 0) candidates.push(ingress);
    const hidden = normalizeNumber(hiddenCount);
    if (hidden > 0) {
      const excludesPinned =
        Boolean(hasPinnedOffer) &&
        /\bother\s+(?:options?|offers?|sellers?)\b/i.test(
          String(hiddenLabel || ""),
        );
      candidates.push(hidden + (excludesPinned ? 1 : 0));
    }
    return candidates.length ? Math.max(...candidates) : null;
  }

  function offerTotalFromFilterLabel(label, includesPinnedOffer = false) {
    const text = asciiDigits(label)
      .replace(/[\u200e\u200f\u202a-\u202e]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const match = text.match(/[0-9][0-9,.]*/);
    const otherOffers = match
      ? normalizeNumber(match[0])
      : /\b(?:no|none|zero)\b/i.test(text)
        ? 0
        : null;
    if (otherOffers === null) return null;
    return otherOffers + (includesPinnedOffer ? 1 : 0);
  }

  function offerBreakdownFromPrimeFilter({
    total,
    primeTotal,
    amazon = 0,
  } = {}) {
    const sellerTotal = normalizeNumber(total);
    const primeSellerTotal = normalizeNumber(primeTotal);
    const amazonSellers = Math.max(0, normalizeNumber(amazon) || 0);
    if (sellerTotal === null || primeSellerTotal === null) return null;
    const boundedTotal = Math.max(0, Math.trunc(sellerTotal));
    const boundedPrime = Math.min(
      boundedTotal,
      Math.max(0, Math.trunc(primeSellerTotal)),
    );
    const boundedAmazon = Math.min(boundedPrime, Math.trunc(amazonSellers));
    return {
      total: boundedTotal,
      fba: boundedPrime - boundedAmazon,
      fbm: boundedTotal - boundedPrime,
      amazon: boundedAmazon,
      primeTotal: boundedPrime,
    };
  }

  function normalizeNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let text = asciiDigits(value)
      .replace(/[^0-9,.'\-]/g, "")
      .replace(/'/g, "");
    if (!text) return null;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function asciiDigits(value) {
    return String(value ?? "")
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  }

  function normalizeDecimal(value) {
    if (value === null || value === undefined || value === "") return null;
    let text = String(value)
      .trim()
      .replace(/[^0-9,.'\-]/g, "")
      .replace(/'/g, "");
    if (!text || text === "-") return null;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
    const negative = text.startsWith("-");
    const [whole, fraction = ""] = text.replace("-", "").split(".");
    const normalized = `${negative ? "-" : ""}${BigInt(whole).toString()}${fraction ? `.${fraction.replace(/0+$/, "")}` : ""}`;
    return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
  }

  const SCALE = 10000n;
  function toScaled(value) {
    const decimal = normalizeDecimal(value) || "0";
    const negative = decimal.startsWith("-");
    const [whole, fraction = ""] = decimal.replace("-", "").split(".");
    const padded = `${fraction}00000`;
    let scaled = BigInt(whole) * SCALE + BigInt(padded.slice(0, 4));
    if ((padded[4] || "0") >= "5") scaled += 1n;
    return negative ? -scaled : scaled;
  }

  function divideHalfUp(numerator, denominator) {
    if (denominator === 0n) return null;
    const negative = numerator < 0n !== denominator < 0n;
    const a = numerator < 0n ? -numerator : numerator;
    const b = denominator < 0n ? -denominator : denominator;
    const quotient = (a + b / 2n) / b;
    return negative ? -quotient : quotient;
  }

  function scaledString(value, decimals = 2) {
    const factor = 10n ** BigInt(4 - decimals);
    const rounded = divideHalfUp(value, factor);
    const negative = rounded < 0n;
    const absolute = negative ? -rounded : rounded;
    const base = 10n ** BigInt(decimals);
    const whole = absolute / base;
    const fraction = (absolute % base).toString().padStart(decimals, "0");
    return `${negative ? "-" : ""}${whole}${decimals ? `.${fraction}` : ""}`;
  }

  function sumDecimals(values, decimals = 4) {
    return scaledString(
      values.reduce((sum, value) => sum + toScaled(value), 0n),
      decimals,
    );
  }

  function money(value, marketplace) {
    const amount = normalizeNumber(value);
    if (amount === null) return "—";
    try {
      return new Intl.NumberFormat(marketplace?.locale || "en-US", {
        style: "currency",
        currency: marketplace?.currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (_) {
      return `${marketplace?.symbol || "$"}${amount.toFixed(2)}`;
    }
  }

  function calculateProfit(input) {
    const salePrice = toScaled(input.salePrice);
    const productCost = toScaled(input.productCost);
    const prepFee = toScaled(input.prepFee);
    const inboundShipping = toScaled(input.inboundShipping);
    const otherCost = toScaled(input.otherCost);
    const feeComponents = input.feeComponents || {};
    const referralFee = toScaled(feeComponents.referralFee);
    const fulfillmentFee = toScaled(feeComponents.fulfillmentFee);
    const closingFee = toScaled(feeComponents.closingFee);
    const digitalServicesFee = toScaled(feeComponents.digitalServicesFee);
    const otherAmazonFee = toScaled(feeComponents.otherAmazonFee);
    const storageFee = input.includeStorageFee
      ? toScaled(feeComponents.storageFee)
      : 0n;
    const taxRate = input.includeTaxReserve ? toScaled(input.taxRate) : 0n;
    const taxNet =
      taxRate > 0n
        ? divideHalfUp(salePrice * 100n * SCALE, 100n * SCALE + taxRate)
        : salePrice;
    const taxReserve = salePrice - taxNet;
    const amazonFees =
      referralFee +
      fulfillmentFee +
      closingFee +
      digitalServicesFee +
      otherAmazonFee +
      storageFee;
    const landedCost = productCost + prepFee + inboundShipping + otherCost;
    const profit = salePrice - amazonFees - landedCost - taxReserve;
    const ratio = (numerator, denominator) =>
      denominator > 0n
        ? scaledString(divideHalfUp(numerator * 100n * SCALE, denominator), 2)
        : null;
    return {
      salePrice: scaledString(salePrice),
      amazonFees: scaledString(amazonFees),
      landedCost: scaledString(landedCost),
      taxReserve: scaledString(taxReserve),
      profit: scaledString(profit),
      profitSign: profit > 0n ? 1 : profit < 0n ? -1 : 0,
      margin: ratio(profit, salePrice),
      roi: ratio(profit, landedCost),
      netPayout: scaledString(salePrice - amazonFees - taxReserve),
      components: {
        referralFee: scaledString(referralFee),
        fulfillmentFee: scaledString(fulfillmentFee),
        closingFee: scaledString(closingFee),
        digitalServicesFee: scaledString(digitalServicesFee),
        otherAmazonFee: scaledString(otherAmazonFee),
        storageFee: scaledString(storageFee),
      },
    };
  }

  function calculatorUrl(marketplace) {
    return `https://${marketplace.sellerCentral}/revcalpublic?lang=${marketplace.lang}`;
  }

  function mergeSettings(stored) {
    return {
      ...DEFAULT_SETTINGS,
      ...(stored || {}),
      visible: { ...DEFAULT_SETTINGS.visible, ...(stored?.visible || {}) },
    };
  }

  return {
    MARKETPLACES,
    DEFAULT_SETTINGS,
    marketplaceFromHost,
    parseAsin,
    amazonOfferPageUrls,
    amazonOfferFilterUrls,
    parseRankText,
    categoryIntelligence,
    classifyFulfillment,
    resolveOfferTotal,
    offerTotalFromFilterLabel,
    offerBreakdownFromPrimeFilter,
    normalizeNumber,
    normalizeDecimal,
    money,
    sumDecimals,
    calculateProfit,
    calculatorUrl,
    mergeSettings,
  };
});
