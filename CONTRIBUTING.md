# Contributing to Scrawl

Thank you for helping improve Scrawl. By participating, you agree to follow the
[code of conduct](./CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues before opening a new one.
- Keep changes focused and explain the user problem they solve.
- Discuss large document-format or architecture changes before implementation.

## Local setup

```bash
pnpm install
pnpm dev
```

Before submitting a change, run the commands documented in the README. New behavior should
include tests at the lowest useful level. Document-format changes require a migration test.
Changes to a critical workflow must include regression coverage and pass `pnpm release:check`.

Prefer small modules with explicit state boundaries. Comments should explain a constraint or a
non-obvious decision; avoid comments that merely repeat the code. Keep browser-only features
usable without an account, environment variable, or remote service.

By contributing, you agree that your contribution is licensed under the MIT License.
