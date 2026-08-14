# draw.io compatibility

Scrawl imports `.drawio` and draw.io `.xml` files locally. Both standard compressed pages and
uncompressed `mxGraphModel` documents are supported. Import creates a new editable Scrawl document;
it does not keep an opaque draw.io image or upload the source file.

## Supported

- Multiple diagram pages and common draw.io layers.
- Rectangles, rounded rectangles, ellipses, diamonds, text, and HTML-formatted labels converted to
  plain editable text.
- Common flowchart, UML, cloud, network, database, document, actor, package, note, server, browser,
  mobile, user, and star shapes.
- Fill and stroke colors, opacity, stroke width, dashed or dotted lines, font size, text alignment,
  and rotation.
- Straight and orthogonal connectors, manual waypoints, connector labels, and source/target
  bindings.
- Basic draw.io groups, including nested position offsets and Scrawl group identifiers.
- Embedded PNG, JPEG, WebP, and GIF data images within Scrawl's asset-size limit.

## Approximated or skipped

- Unknown stencil shapes become editable rectangles and appear in the compatibility report.
- Two-headed connectors keep one arrowhead because the current Scrawl connector has one terminal
  arrowhead.
- Remote images become editable local placeholders and are never requested over the network.
- Unsupported or oversized embedded images become placeholders.
- Relative child ports and objects without usable geometry or connector endpoints are skipped and
  reported.
- Advanced containers, swimlane semantics, custom stencil geometry, rich HTML formatting, and
  draw.io-specific metadata are not yet preserved.

## Safety limits

- Maximum source file size: 20 MB.
- Maximum decompressed page size: 5 MB.
- Maximum pages per import: 100.
- Maximum cells per page: 10,000.
- Maximum XML nesting and parent-chain depth: 128.
- Extreme geometry is clamped, and unusually long text is truncated with a compatibility note.
- XML document type and entity declarations are rejected.
- Imported colors and embedded image types are restricted to values Scrawl can safely serialize.
- The current document is not changed until the import report is reviewed and replacement is
  confirmed.

The report lists imported, approximated, and skipped objects by page. Contributors extending the
adapter should add a focused fixture and conversion test for each newly supported draw.io feature.
