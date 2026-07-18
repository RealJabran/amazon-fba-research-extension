# Architecture

RizPoint FBA Research is a dependency-free Manifest V3 extension.

| Component        | Responsibility                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `content.js`     | Extracts listing data, observes offers, injects the Shadow DOM widget/panel, and coordinates user inputs. |
| `background.js`  | Stores settings, opens official tools, and requests Amazon Revenue Calculator product/fee results.        |
| `shared/core.js` | Marketplace mapping, localized parsing, fixed-point financial calculations, and shared defaults.          |
| `popup/`         | Compact toolbar view and entry point to the full page panel.                                              |
| `options/`       | Automation, cost defaults, tax-reserve behavior, and visible-field preferences.                           |
| `tests/`         | Deterministic marketplace, ASIN, parsing, VAT, and financial-math checks.                                 |

## Data flow

```text
Amazon product page
  → content-script observation
  → marketplace + ASIN + displayed price
  → background Revenue Calculator request
  → returned Amazon fee components
  → fixed-point local calculation
  → isolated page panel / popup / clipboard export
```

## Trust boundaries

- Amazon page markup and endpoints are external, changeable inputs.
- The extension does not trust missing data as zero.
- Revenue Calculator responses are point-in-time estimates.
- The content UI is isolated from Amazon CSS through a Shadow DOM.
- Network permissions are allowlisted to four supported Amazon families.
- No research data is sent to a RizPoint backend.
