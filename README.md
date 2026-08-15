# RizPoint FBA Research

> A fast, marketplace-aware Amazon FBA research companion for Chrome, Brave, and Microsoft Edge.

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-176e42)](manifest.json)
[![Marketplaces](https://img.shields.io/badge/marketplaces-US%20%7C%20UK%20%7C%20UAE%20%7C%20KSA-102a20)](#supported-marketplaces)
[![License: MIT](https://img.shields.io/badge/license-MIT-176e42.svg)](LICENSE)

RizPoint FBA Research turns an Amazon product page into a focused wholesale-research workspace. It identifies the marketplace, reads the listing, requests current fee components from that marketplace's Amazon Revenue Calculator, and calculates profit using editable per-unit costs.

It does **not** silently invent fees or claim that a partial seller sample represents the entire marketplace.

## Highlights

- Automatic USA, UK, UAE, and Saudi marketplace detection.
- Marketplace and currency always visible.
- ASIN, Buy Box price, title, category, BSR, dimensions, and weight extraction.
- Current fee request through the matching Amazon Revenue Calculator endpoint.
- Referral, fulfilment, closing, digital-services, other Amazon, and optional storage fees.
- Product cost, preparation, inbound shipping, and other per-unit cost inputs.
- Net payout, profit, ROI, and margin using deterministic fixed-point money math.
- Observed FBA, FBM, and Amazon Retail offer classification.
- Storefront and search-page research bar with instant title/ASIN search, highest/lowest price sorting, monthly-units sorting, and a minimum monthly-units filter.
- At-a-glance price and Amazon-displayed “bought last month” badges on every detected product card.
- Compact page-side widget, full research panel, toolbar popup, and settings page.
- Per-field copy buttons and tab-separated **Copy row for sheet** export.
- Configurable fields, automatic requests, storage treatment, and optional VAT planning reserve.
- No analytics, advertising, tracking, or RizPoint server connection.

## Install in under two minutes

### Download from GitHub

1. Click **Code → Download ZIP** on this repository.
2. Extract the downloaded ZIP.
3. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted folder that directly contains `manifest.json`.
7. Open a supported Amazon product page. The RizPoint panel appears on the right.

See [INSTALLATION.md](INSTALLATION.md) for screenshots-independent browser instructions, updating, and removal.

## How it works

1. The extension detects the active Amazon domain.
2. It extracts point-in-time listing data from the product page.
3. It asks the matching Seller Central Revenue Calculator for fee components for that ASIN and selling price.
4. You enter the unit cost and any preparation, freight, or other expenses.
5. Fixed-point calculations produce payout, profit, ROI, and margin.
6. Copy any individual value or export one tab-separated row into Excel or Google Sheets.

### Research a storefront or search result

Visit an Amazon seller storefront, brand store, category, or search-results page. The **Store Research** bar appears at the bottom when product cards are detected. Use **Most bought last month** to surface demand, **Highest price** to find premium opportunities, enter a minimum units threshold, or search by title/ASIN. Monthly units are shown only when Amazon publishes that signal on the card; the extension does not estimate missing sales.

## Supported marketplaces

| Amazon store   | Marketplace  | Currency | Revenue Calculator host      |
| -------------- | ------------ | -------: | ---------------------------- |
| `amazon.com`   | USA          |      USD | `sellercentral.amazon.com`   |
| `amazon.co.uk` | UK           |      GBP | `sellercentral.amazon.co.uk` |
| `amazon.ae`    | UAE          |      AED | `sellercentral.amazon.ae`    |
| `amazon.sa`    | Saudi Arabia |      SAR | `sellercentral.amazon.sa`    |

## Accuracy contract

The green **Official Amazon result** state is displayed only when Amazon returns fee components for the detected marketplace, exact ASIN, and displayed or entered selling price.

No browser extension can guarantee that every Amazon value will always be available. Amazon controls its page markup, catalog dimensions, product group, fee programs, Revenue Calculator, delivery-location filtering, and offer pagination. Therefore:

- A failed official fee request stays unavailable; it is never replaced with a guessed fee table.
- Seller counts are labelled **observed offers** because Amazon may omit paginated, suppressed, location-ineligible, unavailable, or login-dependent offers.
- Buy Box and BSR are timestamped page observations and can change immediately.
- VAT reserve is optional planning math, not a tax return or liability calculation.

Read [docs/ACCURACY.md](docs/ACCURACY.md) before using the output for a purchase decision.

## Privacy

Product inputs and preferences remain in Chromium storage. Requests go only to the supported Amazon marketplace already being researched and its matching Seller Central Revenue Calculator. The extension sends nothing to RizPoint or another third party.

See [PRIVACY.md](PRIVACY.md) for the complete, plain-language policy.

## Development

Node.js 22 or newer is recommended.

```bash
npm ci
npm run verify
```

The extension has no runtime package dependencies. GitHub Actions validates the code and creates an installable ZIP artifact. Version tags such as `v0.1.0` can also publish that ZIP as a GitHub Release.

Architecture and contributor guidance are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Important disclaimer

This project is an independent research utility. It is not affiliated with, endorsed by, or sponsored by Amazon. Amazon, FBA, Seller Central, and related marks belong to their respective owners. Fee results are estimates returned by Amazon's calculator and are not guaranteed future charges.

## License

Released under the [MIT License](LICENSE).
