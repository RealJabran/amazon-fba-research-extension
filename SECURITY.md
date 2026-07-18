# Security policy

## Reporting a vulnerability

Please do not publish an exploitable security issue before it can be reviewed. If private vulnerability reporting is enabled for this repository, use GitHub's **Report a vulnerability** option. Otherwise, open a minimal issue that asks the maintainer for a private contact method without including exploit details.

Include the affected version, browser, reproducible steps, security impact, and any suggested mitigation.

## Security design

- Manifest V3 service worker and content-script boundaries.
- No remotely hosted executable code.
- No `eval`, dynamic code execution, analytics, or third-party runtime packages.
- Host access limited to Amazon USA, UK, UAE, and Saudi Arabia families.
- User research inputs remain in Chromium storage.
- Page UI is isolated in a Shadow DOM.
- Copied and displayed page values are HTML-escaped before insertion.

## Supported versions

Security fixes are made against the latest published version. Users should update manually installed copies when a new release is available.
