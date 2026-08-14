# PDF and print

The PDF and print dialog works entirely in the browser. It supports the current page or every
document page, A4 or Letter paper, portrait or landscape orientation, fit-to-page or actual-size
scaling, three margin presets, and optional canvas background or dot grid output.

## Download PDF

Scrawl renders each selected page at a bounded high resolution and assembles the page images into a
single local PDF. Rendering is capped by dimension and pixel-area limits so unusually large scenes
fail with a clear message instead of exhausting browser memory. Large multi-page exports share a
total raster budget so memory use stays bounded while every selected page remains present.

## Print or save as PDF

The browser print path uses Scrawl's SVG exporter for vector shapes, connectors, and text. In the
system print dialog, choose a printer or the browser's **Save as PDF** destination. Paper,
orientation, margins, scale, background, and grid settings come from the Scrawl export dialog.

Embedded local images remain raster assets in both paths. No export operation uploads document
content or requires a remote conversion service.
