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

### Arc length and the scale factor

For a sphere of radius `R`, the great-circle (arc) distance between two
points separated by a central angle `θ` (radians) is:

```
distance = R * θ
```

To keep `distance` constant while `R` changes from `sourceRadius` to
`targetRadius`, the angle must change by the inverse ratio:

```
k = sourceRadius / targetRadius
θ_target = θ_source * k
```

`k` is computed once per run and reused for every vertex in the file. If
`targetRadius` is smaller than `sourceRadius` (e.g. Mars vs. Earth), `k >
1` and every angular span grows, so the shape spans more degrees but the
same physical distance.

### The anchor point

Because scaling changes angular spans, one point has to be picked as a
fixed reference that does *not* move - every other vertex is scaled
relative to it. This is the anchor. By default the anchor is the
north-west (upper-left) corner of the shape's bounding box, but it can be
overridden with `--anchor`.

### Latitude (north/south) axis

A meridian (a line of constant longitude) is itself a great circle. That
means the great-circle central angle between the anchor and a point's
*latitude* is simply the latitude difference, converted to radians - no
haversine formula is needed for this axis:

```
sourceLatAngle = toRadians(lat - anchor.lat)
targetLatAngle = sourceLatAngle * k
newLat = anchor.lat + toDegrees(targetLatAngle)
```

### Longitude (east/west) axis

Moving along a line of constant latitude (a "parallel") is **not** a great
circle in general (except at the equator), so the tool uses the
[`haversine-distance`](https://www.npmjs.com/package/haversine-distance)
npm package to measure the actual great-circle distance between the
anchor and a point at the anchor's latitude, offset by the point's
longitude difference:

1. Normalize the raw `lon - anchor.lon` difference into `(-180, 180]`.
   This is what makes shapes that cross the antimeridian (the 180°/-180°
   line) work correctly without any special-case logic - the difference
   is always taken as the *shortest* signed angular distance.
2. Measure the source central angle for that longitude offset with
   `haversine-distance`, dividing its result (meters) by the constant
   equatorial radius the library always uses internally (6,378,137 m) to
   recover the angle in radians (the angle itself doesn't depend on which
   radius was used to measure it).
3. Scale that central angle by `k`, exactly like the latitude axis.
4. Invert the haversine relation for two points that share a latitude,

   ```
   a = cos²(lat) * sin²(Δlon / 2)
   centralAngle = 2 * asin(sqrt(a))
   ```

   to solve for the new longitude offset given the scaled central angle:

   ```
   Δlon_target = 2 * asin( sin(centralAngle_target / 2) / cos(anchor.lat) )
   ```

   `cos(anchor.lat)` is used as a single, fixed reference for every vertex
   in the shape (rather than each point's own latitude). This keeps the
   math simple and gives one consistent horizontal scale across the whole
   shape, anchored at the point that stays fixed.

Latitude and longitude are rescaled independently for every vertex, then
added back to the anchor to produce the new coordinate. Altitude (a third
`lon,lat,altitude` value), if present, is left untouched - only the
horizontal position is rescaled.

### Handling the equator and the antimeridian

- **Equator crossings** need no special handling: latitude is a plain
  signed value (negative south of the equator, positive north), and the
  scaling formula above works the same on either side.
- **Antimeridian crossings** (shapes spanning across ±180° longitude) are
  handled by always taking the *shortest signed* longitude difference from
  the anchor (step 1 above), so a point at -179° and a point at +179° are
  treated as 2° apart, not 358° apart. The default anchor's bounding-box
  calculation applies the same kind of correction when picking the
  west-most longitude, so the default anchor lands in the right place even
  for antimeridian-crossing shapes.

### Default anchor: the north-west bounding box corner

When `--anchor` isn't supplied, the tool scans every coordinate in the
file to find:

- `maxLat` - the northernmost latitude (a plain numeric maximum; latitude
  never wraps around).
- The western-most longitude. If the naive `max(lon) - min(lon)` span
  is greater than 180°, the shape is assumed to cross the antimeridian;
  in that case negative longitudes are shifted by +360° to make the shape
  contiguous, the minimum is taken in that shifted space, and the result
  is normalized back into `(-180, 180]`.

The default anchor is `{ lat: maxLat, lon: westMostLon }`.

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
| `--anchor "<lat>,<lon>"` | The point that stays fixed while every other coordinate is rescaled around it, e.g. `--anchor "40,-100"`. Defaults to the north-west (upper-left) corner of the shape's bounding box. |
| `-h`, `--help` | Print usage information and exit. |

All radii are in **meters**. Latitude/longitude values are in decimal
degrees.

### Examples

Scale a KML outline of the continental United States from Earth to Mars,
using Mars's mean radius (3,389.5 km) and the default anchor (north-west
corner of the shape):

```
node scale-kml.js --input usa.kml --output usa-on-mars.kml --target-radius 3389500
```

Same, but pin a specific point (e.g. Washington, D.C.) as the anchor so it
doesn't move:

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
| `lib/scale.js` | Core math: `scaleCoordinate` (per-vertex latitude/longitude scaling) and `computeDefaultAnchor` (bounding-box based default anchor). |
| `lib/geojson-walk.js` | Recursive helper that visits every `[lon, lat]`/`[lon, lat, alt]` coordinate in a GeoJSON `FeatureCollection`, across all geometry types. |
| `lib/write-kml.js` | Minimal, dependency-free GeoJSON → KML serializer. |
| `test/fixtures/*.kml` | Sample KML files used for manual verification (a plain rectangle, an antimeridian-crossing shape, an equator-crossing shape). |
| `test/verify.js` | Ad hoc script that checks great-circle width/height is preserved between an Earth input and its Mars-scaled output. |

## Notes and limitations

- Only latitude and longitude are rescaled; altitude values pass through
  unchanged.
- KML is read and written via a GeoJSON round-trip
  (`@tmcw/togeojson` in, a small hand-written serializer out). Basic
  shapes (`Point`, `LineString`, `Polygon` with holes, and their `Multi*`
  variants) and each placemark's `name`/`description` are preserved;
  other KML-specific extras (styles, extended data, folders, etc.) are
  not currently carried through.
- The longitude scaling formula uses the anchor's latitude as a fixed
  reference for the whole shape (rather than recomputing a reference per
  point), which keeps the math simple. This is a good approximation for
  shapes that don't span an extreme range of latitudes.
