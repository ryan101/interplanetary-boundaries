/**
 * Shared helper for visiting every coordinate pair/triple inside a GeoJSON
 * FeatureCollection, regardless of geometry type (Point, LineString,
 * Polygon, their Multi* variants, and GeometryCollection).
 *
 * GeoJSON nests coordinate arrays to different depths depending on the
 * geometry type (e.g. a Polygon is [ring][vertex][lon, lat]; a
 * MultiPolygon adds one more level of nesting). Rather than special-casing
 * every geometry type, we recurse until we find a "leaf" array - one whose
 * first two entries are numbers - and treat that as a single [lon, lat]
 * or [lon, lat, altitude] coordinate.
 */

function isCoordinateLeaf(value) {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

function walkCoordinateArray(coords, visit) {
  if (isCoordinateLeaf(coords)) {
    visit(coords);
    return;
  }
  for (const child of coords) {
    walkCoordinateArray(child, visit);
  }
}

function walkGeometry(geometry, visit) {
  if (!geometry) return;

  // GeometryCollection has no "coordinates" of its own - it wraps a list
  // of child geometries instead, so recurse into each of those.
  if (geometry.type === "GeometryCollection") {
    for (const subGeometry of geometry.geometries || []) {
      walkGeometry(subGeometry, visit);
    }
    return;
  }

  if (geometry.coordinates) {
    walkCoordinateArray(geometry.coordinates, visit);
  }
}

/**
 * Calls `visit(coordinateLeaf)` once for every [lon, lat] / [lon, lat, alt]
 * array found anywhere in the FeatureCollection's geometries. `visit` may
 * mutate the array in place (e.g. to rewrite lon/lat) - the same leaf array
 * reference that lives inside the GeoJSON object is passed through.
 */
function walkFeatureCollection(featureCollection, visit) {
  for (const feature of featureCollection.features || []) {
    walkGeometry(feature.geometry, visit);
  }
}

export { walkFeatureCollection };
