# Changelog

All notable changes will be documented here.

## [Unreleased]

## [0.2.5] - 2026-07-19

### Added

- Add an optional **Clean seller URL** switch directly to the Buy Box research widget.
- Add the same persistent automation setting to the extension Settings page.

### Changed

- When enabled, seller/store/referral product links reload as the marketplace's canonical `/dp/ASIN/` URL so Amazon can resolve the normal Buy Box context.
- Apply setting changes from another extension page immediately to already-open Amazon tabs.

## [0.2.4] - 2026-07-19

### Fixed

- Stop treating unknown Revenue Calculator response fields as Amazon charges. This removes the false `Other Amazon fees` amount shown in the UAE example.
- Include Amazon's explicit per-item fee and monthly storage estimate in the profit calculation, matching the official calculator's cost-per-unit breakdown.
- Keep fee results tied to the exact ASIN and selling price that requested them so a slower, older response cannot replace current data.
- Follow Buy Box price changes automatically until the selling price is manually overridden.
- Request Amazon's Prime-filtered offer result with Amazon's double-encoded `all + primeEligible` filter state, first-page state, and filter metadata from the automatically loaded AOD response.

### Changed

- Show the exact selling price submitted to Amazon beside the fee result.
- Migrate existing installations to include Amazon's storage estimate by default.

## [0.2.3] - 2026-07-18

### Added

- Read Amazon's `primeEligible` AOD filter count automatically without opening the Other Sellers drawer.
- Derive FBA and FBM totals from Amazon's total-offer and Prime-filter counts, including the qualifying pinned Buy Box offer.

### Changed

- Keep Amazon Retail separate from the Prime/FBA count when an Amazon Retail offer is detected.
- Use individual seller-card classification as a fallback when Amazon does not return the Prime-filter count.

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
