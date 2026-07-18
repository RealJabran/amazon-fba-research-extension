# Contributing

Thank you for improving RizPoint FBA Research.

## Development workflow

1. Fork or clone the repository.
2. Use Node.js 22 or newer.
3. Run `npm ci`.
4. Create a focused branch.
5. Make the smallest complete change.
6. Run `npm run verify`.
7. Test the unpacked extension on affected marketplaces.
8. Open a pull request describing behavior, evidence, tests, and Amazon-controlled limitations.

## Correctness rules

- Never describe a locally inferred fee as an official Amazon fee.
- Never convert unavailable seller or listing data into zero.
- Preserve the marketplace, currency, source, and observation time.
- Use fixed-point or decimal arithmetic for financial calculations.
- Treat FBA as fulfilment; do not infer Amazon Retail from FBA status.
- Do not add credentials, cookies, supplier files, exports, or personal data.

## Code style

Use the repository's pinned Prettier version and keep runtime code dependency-free unless a dependency is clearly necessary and reviewed.
