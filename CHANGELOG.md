# Changelog

All notable changes to Scrawl are documented here. The project follows semantic versioning.

## [Unreleased]

## [0.1.0] - 2026-08-13

### Added

- Local-first canvas editing with precise and sketch rendering.
- Shapes, connectors, freehand drawing, text, notes, local images, reusable templates, and shape
  packs.
- Multi-page documents, layers, grouping, arrangement, rotation, resizing, smart guides, and grid
  snapping.
- IndexedDB autosave with a previous valid recovery copy.
- Portable `.scrawl` files, editable draw.io import, and SVG, PNG, PDF, and print output.
- Installable offline application with no account, backend, telemetry, or mandatory remote service.
- Unit, security, recovery, performance, browser workflow, offline, and accessibility release gates.

### Security

- Untrusted imports reject entity declarations, decompression bombs, excessive nesting, unsafe
  embedded assets, extreme geometry, and unsupported remote images.
- Invalid document saves and imports cannot replace the latest valid document.
