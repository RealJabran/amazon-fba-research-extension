const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../shared/core.js");

test("detects all supported marketplaces including subdomains", () => {
  assert.equal(Core.marketplaceFromHost("www.amazon.com").id, "US");
  assert.equal(Core.marketplaceFromHost("smile.amazon.co.uk").id, "UK");
  assert.equal(Core.marketplaceFromHost("amazon.ae").id, "AE");
  assert.equal(Core.marketplaceFromHost("www.amazon.sa").id, "SA");
  assert.equal(Core.marketplaceFromHost("example.com"), null);
});

test("extracts ASIN only from valid product identifiers", () => {
  assert.equal(
    Core.parseAsin("https://www.amazon.com/dp/B00RDFSQPQ?th=1"),
    "B00RDFSQPQ",
  );
  assert.equal(
    Core.parseAsin("https://amazon.ae/gp/product/B012345678/"),
    "B012345678",
  );
  assert.equal(Core.parseAsin("B00RDFSQPQ"), "B00RDFSQPQ");
  assert.equal(Core.parseAsin("not-an-asin"), null);
});

test("builds a clean product URL without seller or referral context", () => {
  const sellerUrl =
    "https://www.amazon.ae/Example/dp/B019OAWUZ4/ref=sr_1_1?m=A123&seller=A123&th=1";
  assert.equal(
    Core.canonicalProductUrl(sellerUrl),
    "https://www.amazon.ae/dp/B019OAWUZ4/",
  );
  assert.equal(Core.shouldCanonicalizeProductUrl(sellerUrl), true);
  assert.equal(Core.shouldCanonicalizeProductUrl(sellerUrl, true), false);
  assert.equal(
    Core.shouldCanonicalizeProductUrl("https://www.amazon.ae/dp/B019OAWUZ4/"),
    false,
  );
  assert.equal(
    Core.canonicalProductUrl("https://www.amazon.ae/stores/x"),
    null,
  );
});

test("uses Amazon's dedicated lazy-load route for every later offer page", () => {
  assert.deepEqual(Core.amazonOfferPageUrls("B07MX7KPF2", 1).slice(0, 1), [
    "/gp/aod/ajax/ref=auto_load_aod?asin=B07MX7KPF2&pc=dp&experienceId=aodAjaxMain",
  ]);
  const secondPage = Core.amazonOfferPageUrls("B07MX7KPF2", 2);
  assert.match(secondPage[0], /\/ref=aod_page_2\?/);
  assert.match(secondPage[0], /(?:\?|&)pageno=2(?:&|$)/);
  assert.equal(
    secondPage.some((url) => url.includes("auto_load_aod")),
    false,
  );
});

test("builds Amazon's Prime offer-filter request from inspected markup", () => {
  const urls = Core.amazonOfferFilterUrls("B07MX7KPF2", "primeEligible");
  assert.match(urls[0], /\/ref=aod_f_primeEligible\?/);
  assert.match(
    urls[0],
    /filters=%257B%2522all%2522%253Atrue%252C%2522primeEligible%2522%253Atrue%257D/,
  );
  assert.match(urls[0], /(?:\?|&)pageno=1(?:&|$)/);
  assert.deepEqual(Core.amazonOfferFilterUrls("invalid", "primeEligible"), []);
});

test("parses only explicit Amazon fee fields and ignores response metadata", () => {
  const fees = Core.parseAmazonFeeResult({
    data: {
      programFeeResultMap: {
        "Core#0": {
          otherFeeInfoMap: {
            ReferralFee: { total: { amount: "2.02" } },
            FulfillmentFee: { total: { amount: "8.20" } },
            PerItemFee: { total: { amount: "0.00" } },
            VariableClosingFee: { total: { amount: "0.00" } },
            ReferralFeePercentage: { total: { amount: "2.60" } },
          },
          perUnitNonPeakStorageFee: { amount: "0.05" },
        },
      },
    },
  });
  assert.equal(fees.referralFee, "2.02");
  assert.equal(fees.fulfillmentFee, "8.2");
  assert.equal(fees.perItemFee, "0");
  assert.equal(fees.otherAmazonFee, "0");
  assert.equal(fees.storageFee, "0.05");
  assert.deepEqual(fees.ignoredFeeNames, ["ReferralFeePercentage"]);
});

test("matches the official UAE calculator fee total in the supplied example", () => {
  const result = Core.calculateProfit({
    salePrice: "25.19",
    productCost: "0",
    feeComponents: {
      referralFee: "2.02",
      fulfillmentFee: "8.20",
      perItemFee: "0",
      closingFee: "0",
      storageFee: "0.05",
    },
    includeStorageFee: true,
  });
  assert.equal(result.amazonFees, "10.27");
  assert.equal(result.profit, "14.92");
});

test("includes Amazon's per-item fee when one is returned", () => {
  const result = Core.calculateProfit({
    salePrice: "20",
    feeComponents: { referralFee: "3", perItemFee: "0.99" },
  });
  assert.equal(result.amazonFees, "3.99");
});

test("normalizes common marketplace number formats", () => {
  assert.equal(Core.normalizeNumber("$1,234.56"), 1234.56);
  assert.equal(Core.normalizeNumber("£1.234,56"), 1234.56);
  assert.equal(Core.normalizeNumber("AED 89.00"), 89);
});

test("parses Amazon monthly purchase signals", () => {
  assert.equal(Core.parseMonthlySales("1K+ bought in past month"), 1000);
  assert.equal(Core.parseMonthlySales("50+ sold in the last month"), 50);
  assert.equal(Core.parseMonthlySales("No recent sales text"), null);
});

test("filters and ranks storefront research items", () => {
  const items = [
    { asin: "B000000001", title: "Alpha", price: 19, monthlySales: 500 },
    { asin: "B000000002", title: "Beta", price: 80, monthlySales: 100 },
    { asin: "B000000003", title: "Gamma", price: 40, monthlySales: 1000 },
  ];
  assert.deepEqual(
    Core.rankResearchItems(items, { sort: "price-high" }).map(
      (item) => item.asin,
    ),
    ["B000000002", "B000000003", "B000000001"],
  );
  assert.deepEqual(
    Core.rankResearchItems(items, {
      sort: "sales-high",
      minimumSales: 500,
    }).map((item) => item.asin),
    ["B000000003", "B000000001"],
  );
});

test("calculates deterministic profit, margin and ROI", () => {
  const result = Core.calculateProfit({
    salePrice: 30,
    productCost: 10,
    prepFee: 1.5,
    inboundShipping: 1,
    otherCost: 0.5,
    feeComponents: { referralFee: 4.5, fulfillmentFee: 5, storageFee: 0.2 },
    includeStorageFee: false,
  });
  assert.equal(result.amazonFees, "9.50");
  assert.equal(result.landedCost, "13.00");
  assert.equal(result.profit, "7.50");
  assert.equal(result.margin, "25.00");
  assert.equal(result.roi, "57.69");
});

test("uses VAT reserve only when explicitly enabled", () => {
  const off = Core.calculateProfit({
    salePrice: 120,
    productCost: 50,
    feeComponents: {},
    includeTaxReserve: false,
    taxRate: 20,
  });
  const on = Core.calculateProfit({
    salePrice: 120,
    productCost: 50,
    feeComponents: {},
    includeTaxReserve: true,
    taxRate: 20,
  });
  assert.equal(off.taxReserve, "0.00");
  assert.equal(on.taxReserve, "20.00");
  assert.equal(on.profit, "50.00");
});

test("money arithmetic does not inherit binary floating-point errors", () => {
  const result = Core.calculateProfit({
    salePrice: "0.30",
    productCost: "0.10",
    prepFee: "0.10",
    inboundShipping: "0.00",
    otherCost: "0.00",
    feeComponents: { referralFee: "0.10" },
  });
  assert.equal(result.profit, "0.00");
  assert.equal(result.amazonFees, "0.10");
});

test("extracts parent and subcategory ranks in Amazon display order", () => {
  const ranks = Core.parseRankText(
    "Amazon Best Sellers Rank: #2,753 in Health (#1 in Cigar Cutters)",
  );
  assert.deepEqual(ranks, [
    { rank: 2753, category: "Health" },
    { rank: 1, category: "Cigar Cutters" },
  ]);
  assert.deepEqual(Core.categoryIntelligence(["Health", "Cutters"], ranks), {
    parentCategory: "Health",
    parentBsr: 2753,
    subCategory: "Cigar Cutters",
    subCategoryBsr: 1,
  });
});

test("classifies Amazon retail, FBA and FBM fulfillment", () => {
  assert.equal(Core.classifyFulfillment("Amazon.ae", "Amazon.ae"), "Amazon");
  assert.equal(Core.classifyFulfillment("Sunny Trading", "Amazon.ae"), "FBA");
  assert.equal(
    Core.classifyFulfillment("Sunny Trading", "Sunny Trading"),
    "FBM",
  );
  assert.equal(Core.classifyFulfillment("Sunny Trading", "", true), "FBA");
});

test("adds the pinned Buy Box seller to Amazon's other-options count", () => {
  assert.equal(
    Core.resolveOfferTotal({
      hiddenCount: "17",
      hiddenLabel: "17 other options",
      hasPinnedOffer: true,
    }),
    18,
  );
  assert.equal(
    Core.resolveOfferTotal({
      ingressTotal: "18",
      hiddenCount: "17",
      hiddenLabel: "17 other options",
      hasPinnedOffer: true,
    }),
    18,
  );
});

test("derives FBA and FBM totals from Amazon's Prime filter count", () => {
  assert.equal(Core.offerTotalFromFilterLabel("17 other options", true), 18);
  assert.equal(Core.offerTotalFromFilterLabel("12 other options", true), 13);
  assert.equal(Core.offerTotalFromFilterLabel("١٢ خيارًا آخر", true), 13);
  assert.deepEqual(
    Core.offerBreakdownFromPrimeFilter({
      total: 18,
      primeTotal: 13,
      amazon: 0,
    }),
    { total: 18, fba: 13, fbm: 5, amazon: 0, primeTotal: 13 },
  );
});

test("keeps Amazon Retail separate from Prime-filtered FBA sellers", () => {
  assert.deepEqual(
    Core.offerBreakdownFromPrimeFilter({
      total: 18,
      primeTotal: 13,
      amazon: 1,
    }),
    { total: 18, fba: 12, fbm: 5, amazon: 1, primeTotal: 13 },
  );
});
