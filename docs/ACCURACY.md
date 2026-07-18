# Accuracy and evidence model

RizPoint FBA Research distinguishes an official point-in-time result from a local page observation and from unavailable data.

## Official Amazon fee result

The extension requests product matching and FBA fee components from the Revenue Calculator belonging to the detected marketplace. A fee result is labelled official only when Amazon returns a successful response for the marketplace, ASIN, currency, and exact selling price.

The response is still an estimate. Actual charges can vary because of catalog measurements, fee-category changes, seller-program enrolment, dangerous-goods treatment, placement decisions, inventory age, storage period, promotions, returns, and later fee changes.

## Listing observations

Buy Box price, title, category, BSR, dimensions, and weight are extracted from the page visible to the current browser. Amazon can render different information by account, location, language, device, inventory state, or experiment.

## Seller observations

The extension asks Amazon's All Offers interface for offers available to the current browser session and removes duplicates by seller identity when possible.

The result is an **observed sample**, not a guaranteed whole-market count. Pagination, delivery location, login state, suppression, availability, and Amazon experiments can hide offers. Unavailable results remain unknown rather than becoming zero.

## Financial calculation

All per-unit financial operations use scaled integer arithmetic. Displayed money and percentages are rounded half-up to two decimal places.

```text
landed cost = product cost + prep + inbound shipping + other cost
Amazon fees = returned fee components + optional storage estimate
net payout = selling price - Amazon fees - optional tax reserve
profit = net payout - landed cost
ROI = profit / landed cost × 100
margin = profit / selling price × 100
```

The VAT option is a planning reserve derived from a tax-inclusive price. It does not account for registrations, input credits, import VAT, marketplace collection rules, exemptions, or return-filing details.

## Purchase decisions

Before ordering inventory, confirm pack/case quantity, product identity, restrictions, invoice eligibility, prep needs, freight, Amazon measurements, fee result, demand history, competition, and a conservative price scenario.
