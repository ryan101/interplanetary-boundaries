# kml-planet-scale

A small Node.js command-line tool that rescales the coordinates in a KML
file so that the physical size of its shapes is preserved when the same
file is displayed on a body with a different radius.

## The problem

KML stores plain latitude/longitude values. Those are angular coordinates,
not physical distances - one degree of longitude covers a very different
physical distance on Earth (radius ≈ 6,371 km) than it does on Mars
(radius ≈ 3,390 km). If you take a KML outline of, say, the continental
United States and display it "as-is" on a Mars basemap, the shape will
cover the same range of degrees but a much smaller physical distance,
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
tool always uses the polygon's centroid (geometric center, computed via
spherical geometry using n-vectors) as the reference.

### Scaling every vertex: distance and bearing from the centroid

This tool computes the centroid of the polygon and uses
it as the reference point for all scaling. For each vertex, the tool:

1. Measures the great-circle distance (in meters) and initial
   bearing (compass direction) from the centroid to that vertex, on the
   source body (radius `sourceRadius`).
2. Places a new vertex at that same physical distance and same bearing
   from the anchor point, but computed on the target body (radius
   `targetRadius`).

If no `--anchor` is supplied, the anchor defaults to the centroid itself,
and the polygon scales uniformly in place around its center. If an `--anchor`
is provided, the polygon is moved so that its centroid is the target anchor location.
This is especially useful when moving to a smaller radius body causes the polygon to
go over a pole or wrap around the entire body (e.g., USA on the moon). Moving the anchor
closer to the equator provides greater distance for the polygon to fit within.

**Equator crossing and shape inversion**: If the anchor point is on the
opposite side of the equator from the centroid (e.g., centroid in the
northern hemisphere but anchor in the southern), the entire shape is
flipped by reversing all bearing directions (adding 180° to each bearing).
This ensures that shapes maintain sensible orientation when moved across
hemispheres. This is essentially makes the south pole the north pole
and is only necessary for cosmetic reasons to keep the familiar shape
of a polygon if then anchor changes hemishpere. This feature is not
needed if you are able to arbitrarily rotate the polygon body
indepently of your target body.

Altitude (a third `lon,lat,altitude` value), if present, is left
untouched - only the horizontal position is rescaled.

This is implemented with the
[`geodesy`](https://www.npmjs.com/package/geodesy) library's
`LatLonNvectorSpherical` class (using n-vectors for centroid computation and
great-circle distance/bearing/destination calculations). The centroid is
computed using `LatLon.centreOf()`, which calculates the true spherical
geometric center via 3D vector averaging.

## Installation

``` bash
git clone https://github.com/ryan101/interplanetary-boundaries.git
npm install
```

## Usage

``` bash
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
| `--anchor "<lat>,<lon>"` | The location where the polygon's centroid should be placed after rescaling. If omitted, the centroid stays in place and the polygon scales uniformly around it. Example: `--anchor "5,-100"` moves the shape's center to that location. |
| `-h`, `--help` | Print usage information and exit. |

All radii are in meters. Latitude/longitude values are in decimal
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
| `lib/scale.js` | Core math: `scaleCoordinate` (per-vertex distance/bearing scaling from the polygon's centroid to each vertex, with optional bearing reversal for equator-crossing shape inversion), and `computeCentroid` (true spherical geometric center). |
| `lib/geojson-walk.js` | Recursive helper that visits every `[lon, lat]`/`[lon, lat, alt]` coordinate in a GeoJSON `FeatureCollection`, across all geometry types. |
| `lib/write-kml.js` | Minimal, dependency-free GeoJSON → KML serializer. |

## Notes and limitations

- Only latitude and longitude are rescaled; altitude values pass through
  unchanged.
- KML is read and written via a GeoJSON round-trip. Basic
  shapes (`Point`, `LineString`, `Polygon` with holes, and their `Multi*`
  variants) and each placemark's `name`/`description` are preserved;
  other KML-specific extras (styles, extended data, folders, etc.) are
  not carried through.
- Distances and bearings are computed on a spherical earth model (not an
  ellipsoidal one) using n-vectors.
- The centroid is computed using `LatLon.centreOf()`, which
  produces the true spherical geometric center rather than an arithmetic mean
  of angular coordinates.
- When an anchor point crosses the equator relative to the polygon's
  centroid (i.e., they are on opposite sides of 0° latitude), the shape
  is automatically flipped by reversing all bearing directions.
