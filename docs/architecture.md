# Architecture

Scrawl is a browser-only application. The default build has no backend, authentication,
telemetry, or required network service.

## Packages

- `@scrawl/schema` owns the versioned document and element contracts.
- `@scrawl/engine` owns rendering, geometry, hit-testing, bindings, and exports.
- `@scrawl/editor` owns commands, undo/redo, and editor state.
- `@scrawl/interchange` owns untrusted external-format decoding and editable conversion.
- `@scrawl/storage` owns IndexedDB persistence and recovery.
- `@scrawl/web` provides the user interface and installable PWA.

The canvas renderer never owns persisted state. All changes pass through editor commands,
which update a validated document and then notify persistence and rendering.

## State boundaries

The document contains only portable user data: pages, layers, elements, assets, and document
settings. Selection, smart guides, the active drawing layer, open panels, active tools, and the
camera are transient editor state and are not written into `.scrawl` files.

Undo and redo store complete document snapshots with a bounded history. Pointer interactions use
a transaction checkpoint, allowing many drag previews to become one undoable action.

Selection transforms, including rotation and oriented-frame resizing, arrangement, snapping,
clipboard cloning, grouping, connector waypoint editing, page operations, and reusable-content
placement are pure editor operations. Shared rotation geometry, connector binding, routing, and
parametric shape definitions stay in the engine so canvas rendering, hit-testing, SVG export, and
editing use the same geometry. Reusable shapes expose normalized cardinal anchors that the binding
engine rotates with their element.

The draw.io adapter builds a complete candidate document and compatibility report without touching
editor state. The web application calls the existing validated `loadDocument` command only after
the user confirms replacement. PDF layout and assembly live in the engine; the web layer supplies
page rasters from the existing renderer. Browser printing uses the same SVG exporter so printed
and browser-saved PDF pages retain vector geometry.

## Storage and offline behavior

IndexedDB stores the latest validated document and the previous valid save. A separate local
template repository stores validated reusable element groups without modifying the portable
document schema. Import, recovery, and saved templates always pass through the schema parser. The
service worker caches only same-origin application shell resources; document and template data
stay in IndexedDB and are never sent by the application.

## Dependency direction

`schema` has no dependency on other workspace packages. `engine` depends on `schema`, `editor`
depends on `schema` and `engine`, `interchange` depends on `schema` and `engine`, `storage` depends
on `schema`, and `web` composes those packages. This keeps rendering, state transitions,
persistence, external-format handling, and interface concerns independently testable.
