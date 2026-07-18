# kml-planet-scale

A small Node.js command-line tool that rescales the coordinates in a KML
file so that the **physical (great-circle) size** of its shapes is
preserved when the same file is displayed on a body with a different
radius.

## The problem

KML stores plain latitude/longitude values. Those are angular coordinates,
not physical distances - one degree of longitude covers a very different
physical distance on Earth (radius ≈ 6,371 km) than it does on Mars
(radius ≈ 3,390 km). If you take a KML outline of, say, the continental
United States and display it "as-is" on a Mars basemap, the shape will
cover the *same range of degrees* but a much *smaller physical distance*,
making it look far smaller than it should relative to the size of Mars.

This tool rewrites every coordinate so the outline instead covers the same
great-circle distance (in meters) on the target body, growing (or
shrinking) the angular span as needed.

## How the scaling works

### Arc length and the centroid

For a sphere of radius `R`, the great-circle (arc) distance between two
points separated by a central angle `θ` (radians) is:

```
distance = R * θ
```

To keep `distance` (the actual physical size, in meters) constant while
`R` changes from `sourceRadius` to `targetRadius`, the central angle simply
has to change to match - `θ = distance / R`.

Because scaling changes angular spans, a reference point is needed. This
tool always uses the polygon's **centroid** (geometric center, computed by
averaging all coordinates) as the reference. All vertices are scaled
relative to the centroid on both the source and target bodies.

### Scaling every vertex: distance and bearing from the centroid

Rather than picking an arbitrary anchor point, this tool computes the
**centroid** (geometric center) of the polygon and uses it as the reference
point for all scaling. For each vertex, the tool:

1. Measures the true great-circle **distance** (in meters) and **initial
   bearing** (compass direction) from the centroid to that vertex, on the
   source body (radius `sourceRadius`).
2. Places a new vertex at that *same physical distance* and *same bearing*
   from the anchor point, but computed on the target body (radius
   `targetRadius`).

If no `--anchor` is supplied, the anchor defaults to the centroid itself,
and the polygon scales uniformly in place around its center. If an `--anchor`
is provided, the polygon is effectively **translated** so that its centroid
moves to the anchor location while preserving all internal distances and
angles.

Since bearing (direction) doesn't depend on the sphere's radius, and
distance = radius × angle, this keeps the exact physical distance and
direction from the centroid to every vertex - the angular span simply grows
or shrinks by whatever amount is needed to keep that distance the same on
the new radius. There's no need to reason about latitude and longitude as
separate axes, no reference-latitude approximation, and equator or
antimeridian crossings need no special-case handling at all - they just
fall out of standard spherical distance/bearing/destination-point
formulas.

This is implemented with the
[`geodesy`](https://www.npmjs.com/package/geodesy) library's
`LatLonSpherical` class (`distanceTo`, `initialBearingTo`,
`destinationPoint`), which provides these as small, well-tested,
dependency-free trigonometric functions. In code, this is:

```
const distance = centroid.distanceTo(vertex, sourceRadius);
const bearing = centroid.initialBearingTo(vertex);
const newVertex = anchor.destinationPoint(distance, bearing, targetRadius);
```

Altitude (a third `lon,lat,altitude` value), if present, is left
untouched - only the horizontal position is rescaled.

### Handling the equator and the antimeridian

Because the transform above works directly with true great-circle
distance and bearing (not independent latitude/longitude offsets), the
underlying spherical trigonometry handles shapes that cross the equator
correctly on its own.

For antimeridian crossings (the 180°/-180° line), after each coordinate
is scaled using `destinationPoint`, the resulting longitude is normalized
to the (-180, 180] range to ensure correctness.

**Equator crossing and shape inversion**: If the anchor point is on the
opposite side of the equator from the centroid (e.g., centroid in the
northern hemisphere but anchor in the southern), the entire shape is
flipped by reversing all bearing directions (adding 180° to each bearing).
This ensures that shapes maintain sensible orientation when moved across
hemispheres.

### Default anchor: the centroid

The centroid (geometric center) of the polygon is always computed and used
as the reference point for rescaling. By default, the anchor point is the
centroid itself, so the polygon scales uniformly around its own center.

If `--anchor` is supplied, the polygon is translated such that its centroid
moves to the anchor location while all vertices maintain their relative
distances and angles from the centroid on the target body. This allows the
shape to be repositioned and rescaled simultaneously.

### A note on accuracy

This method is exact for the distance and direction from the centroid to
every vertex. Unlike scaling latitude/longitude as independent axes (which
introduces up to double-digit percentage errors for vertices far from a
reference latitude), measuring from a consistent centroid point avoids this
problem. It does not claim to be a perfect conformal or equal-area map
projection: distances measured *between two non-centroid vertices* are an
extremely good approximation rather than a mathematical guarantee, since
the sphere's curvature is subtly different at the two radii. For real-world
shapes (country outlines, etc.) relative to a single fixed centroid, this
difference is negligible.

## Installation

```
npm install
```

## Usage

```
node scale-kml.js --input <file.kml> --output <file.kml> --target-radius <meters> [options]
```

### Required arguments

| Argument | Description |
| --- | --- |
| `--input <path>` | Path to the source KML file to read. |
| `--output <path>` | Path to write the rescaled KML file. Must **not** be the same path as `--input` - the tool refuses to overwrite the input file. |
| `--target-radius <meters>` | Radius, in meters, of the body the shape should be scaled *to* (e.g. `3389500` for Mars). |

### Optional arguments

| Argument | Description |
| --- | --- |
| `--source-radius <meters>` | Radius, in meters, that the input coordinates were originally measured on. Defaults to Earth's mean radius, `6371000` m. |
| `--anchor "<lat>,<lon>"` | The location where the polygon's centroid should be placed after rescaling. If omitted, the centroid stays in place and the polygon scales uniformly around it. Example: `--anchor "40,-100"` moves the shape's center to that location. |
| `-h`, `--help` | Print usage information and exit. |

All radii are in **meters**. Latitude/longitude values are in decimal
degrees.

### Examples

Scale a KML outline of the continental United States from Earth to Mars,
using Mars's mean radius (3,389.5 km). The polygon scales around its own
centroid:

```
node scale-kml.js --input usa.kml --output usa-on-mars.kml --target-radius 3389500
```

Same, but move the shape's centroid to a specific location (e.g.
Washington, D.C.):

```
node scale-kml.js --input usa.kml --output usa-on-mars.kml --target-radius 3389500 --anchor "38.9,-77.0"
```

Scale from a body other than Earth (e.g. re-project a shape that was
originally measured on the Moon, radius ≈ 1,737,400 m, onto Earth):

```
node scale-kml.js --input moon-shape.kml --output shape-on-earth.kml --source-radius 1737400 --target-radius 6371000
```

## Project layout

| File | Purpose |
| --- | --- |
| `scale-kml.js` | CLI entry point: argument parsing/validation, orchestrates read → transform → write. |
| `lib/scale.js` | Core math: `scaleCoordinate` (per-vertex distance/bearing scaling from the polygon's centroid to each vertex, with optional bearing reversal for equator-crossing shape inversion, via the `geodesy` package), `computeCentroid` (geometric center of all coordinates), and `normalizeLonDeg` (antimeridian normalization). |
| `lib/geojson-walk.js` | Recursive helper that visits every `[lon, lat]`/`[lon, lat, alt]` coordinate in a GeoJSON `FeatureCollection`, across all geometry types. |
| `lib/write-kml.js` | Minimal, dependency-free GeoJSON → KML serializer. |
| `test/fixtures/*.kml` | Sample KML files used for manual verification (a plain rectangle, an antimeridian-crossing shape, an equator-crossing shape). |
| `test/verify.js` | Ad hoc script that checks great-circle distance from the anchor to each rectangle corner is preserved between an Earth input and its Mars-scaled output. |

This project uses native ES modules (`"type": "module"` in `package.json`).

## Notes and limitations

- Only latitude and longitude are rescaled; altitude values pass through
  unchanged.
- KML is read and written via a GeoJSON round-trip
  (`@tmcw/togeojson` in, a small hand-written serializer out). Basic
  shapes (`Point`, `LineString`, `Polygon` with holes, and their `Multi*`
  variants) and each placemark's `name`/`description` are preserved;
  other KML-specific extras (styles, extended data, folders, etc.) are
  not currently carried through.
- Distances and bearings are computed on a spherical earth model (not an
  ellipsoidal one), which is the standard simplification used for this
  kind of "how big does this look" comparison and is what the `geodesy`
  package's `latlon-spherical` module provides.
- See "A note on accuracy" above: exact from the centroid to every vertex,
  an extremely good approximation between two arbitrary non-centroid
  vertices.
- Antimeridian crossings (shapes that span ±180° longitude) are handled
  correctly: all scaled coordinates are normalized to the (-180, 180]
  range.
- When an anchor point crosses the equator relative to the polygon's
  centroid (i.e., they are on opposite sides of 0° latitude), the shape
  is automatically flipped by reversing all bearing directions.
