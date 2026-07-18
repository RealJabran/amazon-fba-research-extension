# Changelog

All notable changes will be documented here.

## [Unreleased]

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
