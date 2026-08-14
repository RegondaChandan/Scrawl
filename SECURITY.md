# Security Policy

Scrawl is local-first and does not require a server. Reports involving document parsing, unsafe
exports, cross-site scripting, or unintended network access are especially important.

## Reporting a vulnerability

Please do not report security vulnerabilities through public issues.

Use this repository's **Security** tab to open a private GitHub advisory. Include reproduction
steps, affected versions, and the expected impact. If private advisories are not enabled yet,
contact the repository owner directly.

## Import and document safety

External diagram import rejects document type and entity declarations, applies file, page, and
cell limits, and never fetches remote image URLs. A candidate import is validated as a complete
Scrawl document before the current editor document can be replaced.
