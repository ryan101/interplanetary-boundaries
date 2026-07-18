// LatLonSpherical gives us exact great-circle distance, initial bearing,
// and destination-point calculations (all standard spherical trigonometry
// formulae) - no need to hand-roll or invert the haversine formula
// ourselves.
import LatLon from "geodesy/latlon-spherical.js";

// Mean radius of Earth in meters - used as the default --source-radius.
const EARTH_MEAN_RADIUS_METERS = 6371000;

/**
 * Normalizes a longitude to the range (-180, 180].
 *
 * @param {number} lon - longitude in degrees
 * @returns {number} normalized longitude in (-180, 180]
 */
function normalizeLonDeg(lon) {
  let normalized = lon % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}

/**
 * Computes the centroid (geometric center) of all coordinates in a FeatureCollection.
 *
 * @param {Object} featureCollection - GeoJSON FeatureCollection
 * @returns {{lat: number, lon: number}} centroid coordinates
 */
function computeCentroid(featureCollection) {
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  function visitCoord(coord) {
    sumLon += coord[0];
    sumLat += coord[1];
    count++;
  }

  function visitCoords(coords) {
    if (Array.isArray(coords[0]) && typeof coords[0][0] === "number") {
      // coords is an array of coordinate pairs
      for (const coord of coords) {
        visitCoord(coord);
      }
    } else {
      // coords is nested deeper, recurse
      for (const subCoords of coords) {
        visitCoords(subCoords);
      }
    }
  }

  for (const feature of featureCollection.features || []) {
    if (feature.geometry && feature.geometry.coordinates) {
      visitCoords(feature.geometry.coordinates);
    }
  }

  if (count === 0) {
    return { lat: 0, lon: 0 };
  }

  return { lat: sumLat / count, lon: sumLon / count };
}

/**
 * Scales a single [lon, lat] coordinate so that its great-circle distance
 * and direction *from the centroid* are preserved when moving from a body of
 * `sourceRadius` to a body of `targetRadius`.
 *
 * The centroid of the polygon is computed separately and passed in. For each
 * vertex, we measure the great-circle distance and bearing from the centroid
 * to that vertex on the source body. We then place a new vertex at that same
 * scaled distance and bearing from the anchor point on the target body.
 *
 * If no explicit anchor is provided, the anchor will be the centroid itself,
 * and the polygon scales in place. If an anchor is provided, the polygon is
 * effectively translated so that its centroid moves to the anchor location.
 *
 * If the anchor crosses the equator relative to the centroid (i.e., they are
 * on opposite sides of 0° latitude), the shape is flipped by reversing all
 * bearings (adding 180° to each bearing direction).
 *
 * @param {number} lon - input longitude, degrees
 * @param {number} lat - input latitude, degrees
 * @param {{lat: number, lon: number}} centroid - centroid of the polygon
 * @param {{lat: number, lon: number}} anchor - point to treat as the new centroid location
 * @param {number} sourceRadius - radius of the body the input was measured on, meters
 * @param {number} targetRadius - radius of the destination body, meters
 * @param {boolean} flipShape - if true, reverse bearing direction by 180°
 * @returns {[number, number]} [newLon, newLat] in degrees
 */
function scaleCoordinate(lon, lat, centroid, anchor, sourceRadius, targetRadius, flipShape = false) {
  const centroidPoint = new LatLon(centroid.lat, centroid.lon);
  const vertexPoint = new LatLon(lat, lon);

  // If vertex is at the centroid, it doesn't move (relative to the new centroid).
  if (centroidPoint.equals(vertexPoint)) {
    return [anchor.lon, anchor.lat];
  }

  // Measure distance and bearing from centroid to vertex on source body.
  const distanceMeters = centroidPoint.distanceTo(vertexPoint, sourceRadius);
  let bearingDeg = centroidPoint.initialBearingTo(vertexPoint);

  // If flipping, reverse the bearing direction.
  if (flipShape) {
    bearingDeg = (bearingDeg + 180) % 360;
  }

  // Place the vertex at the same distance and bearing from the anchor on target body.
  const anchorPoint = new LatLon(anchor.lat, anchor.lon);
  const destination = anchorPoint.destinationPoint(distanceMeters, bearingDeg, targetRadius);

  // Normalize longitude to (-180, 180] to handle antimeridian crossings.
  const normalizedLon = normalizeLonDeg(destination.lon);
  return [normalizedLon, destination.lat];
}

export { EARTH_MEAN_RADIUS_METERS, scaleCoordinate, computeCentroid };
