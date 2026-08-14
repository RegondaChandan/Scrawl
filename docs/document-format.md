# Document format

Scrawl files are UTF-8 JSON documents saved with the `.scrawl` extension and the media type
`application/vnd.scrawl+json`.

The root object contains:

- `type`: always `scrawl`.
- `version`: the schema version used for migrations.
- `id` and `title`: document identity and display name.
- `activePageId`: the page to show when the document opens.
- `pages`: page records containing layers and ordered elements.
- `assets`: embedded local assets keyed by asset identifier.
- `settings`: document-wide rendering, theme, and grid preferences.

All positions and sizes are expressed in canvas units. Linear and freehand element points are
relative to the element origin. Each element references a layer on its page and carries a stable
identifier, ordering value, visual style, rotation angle, and version counter. Rotation angles use
radians and are normalized when geometry is evaluated. Selection outlines, transform handles, and
smart guides are transient editor data and are never stored in the document.

## Compatibility

The parser validates untrusted files before they reach the editor. Versions 1 and 2 are migrated
to the current multi-page, layered format. A future format change must increment the schema
version and include migration tests.

External formats are converted into a new current-version document before they enter the editor.
An imported draw.io file receives fresh page, layer, element, group, asset, and connector-binding
identifiers; the source XML is not stored inside the `.scrawl` document. Import therefore does not
change or extend the portable schema.

## Assets

Images are referenced by `assetId`; elements do not contain server URLs. Portable files may embed
asset data in the root asset map. The renderer accepts an asset resolver so browser storage can
use blob URLs without coupling the document schema to a storage implementation.

The current editor accepts PNG, JPEG, WebP, and GIF assets up to 10 MB. Imported documents must
embed image data as a matching base64 data URL; remote asset URLs and SVG image payloads are
rejected by the parser. The browser also rejects `.scrawl` files larger than 50 MB before parsing.

## Local templates

Templates saved from the editor are device-local records, not part of the `.scrawl` format. They
store validated element groups in a separate IndexedDB database and receive fresh element,
group, and connector-binding identifiers when inserted. Embedded images are excluded because
their binary assets are not copied into the template repository. Built-in templates follow the
same insertion path and do not require a document-format version change.
