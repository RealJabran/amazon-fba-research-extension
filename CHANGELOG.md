# Changelog

All notable changes will be documented here.

## [Unreleased]

## [0.2.2] - 2026-07-18

### Fixed

- Load Amazon's dedicated `aod_page_2`, `aod_page_3`, and later lazy offer pages automatically instead of repeatedly receiving the first offer batch.
- Follow Amazon-provided next-page links when present and fall back across endpoint variants if a response contains only sellers already classified.
- Continue trying alternate offer endpoints after an individual request fails.

### Changed

- Seller counts no longer depend on opening or scrolling Amazon's Other Sellers panel.

## [0.2.1] - 2026-07-18

### Fixed

- Read Amazon's hidden `aod-total-offer-count` and include the pinned Buy Box seller when Amazon labels the count as "other options".
- Use Amazon's `isAmazonFulfilled=1` seller-link signal to classify FBA offers even when the fulfillment label is hidden or localized.
- Parse only complete offer cards instead of matching nested `aod-offer-*` detail elements as sellers.
- Continue loading AOD pages until Amazon's advertised seller total is reached or no additional sellers are returned.
- Reclassify from Amazon's live All Offers panel automatically when it is opened.

### Changed

- Partial FBA, FBM, and Amazon counts are marked with `+` instead of being presented as complete totals.
- The analysis now distinguishes Amazon's total seller count from the number of seller cards classified so far.

## [0.2.0] - 2026-07-18

### Added

- Editable per-product cost in the toolbar popup and Buy Box overview.
- A detailed research overview positioned directly above Amazon's Buy Box.
- Copy controls for ASIN, parent category, parent BSR, subcategory, and subcategory BSR.
- Per-ASIN product-cost persistence in local extension storage.

### Changed

- Category intelligence now separates parent-category and subcategory ranks.
- The full analysis lightbox is smaller and more focused.
- Offer loading now includes the featured offer, uses current AOD endpoints, and follows observed pagination.

### Fixed

- Full-analysis Settings now opens reliably through the background worker.
- Observed-offer parsing now handles current Amazon seller and fulfillment markup.

## [0.1.0] - 2026-07-18

### Added

- Manifest V3 support for Chrome, Brave, and Microsoft Edge.
- Amazon USA, UK, UAE, and Saudi marketplace detection.
- Product-page ASIN, price, category, BSR, dimension, and weight extraction.
- Amazon Revenue Calculator fee retrieval and component display.
- Fixed-point profit, payout, ROI, margin, and optional VAT-reserve calculations.
- Observed FBA, FBM, and Amazon Retail offer classification.
- Page-side widget, full analysis panel, toolbar popup, settings, and copy tools.
- Privacy, security, accuracy, installation, architecture, and troubleshooting documentation.
