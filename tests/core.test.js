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

test("normalizes common marketplace number formats", () => {
  assert.equal(Core.normalizeNumber("$1,234.56"), 1234.56);
  assert.equal(Core.normalizeNumber("£1.234,56"), 1234.56);
  assert.equal(Core.normalizeNumber("AED 89.00"), 89);
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
});
