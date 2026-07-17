"use strict";

const haversineDistance = require("haversine-distance");

// Mean radius of Earth in meters - used as the default --source-radius.
const EARTH_MEAN_RADIUS_METERS = 6371000;

// The `haversine-distance` package always computes distances using a fixed
// equatorial Earth radius baked into its own source (it has no way to pass
// a custom radius in). We only ever use it to get the *central angle*
// between two points (angle = distance / radius), which is independent of
// which radius was used to produce the distance - so we just divide its
// result by the same constant it used internally to recover the angle in
// radians.
const EARTH_RADIUS_USED_BY_HAVERSINE_LIB = 6378137;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Normalizes a longitude value (or a longitude *difference*) into the
 * range (-180, 180]. Used both to keep output longitudes in the usual
 * range, and - critically - to turn a raw "lon - anchorLon" difference
 * into the *shortest* signed angular difference. That second use is what
 * makes shapes crossing the antimeridian (e.g. coordinates jumping from
 * +179.9 to -179.9) "just work" per vertex, with no special-case branch
 * needed elsewhere in the code.
 */
function normalizeLonDeg(lonDeg) {
  let normalized = lonDeg % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}

/**
 * Scales a single [lon, lat] coordinate so that its great-circle distance
 * from the anchor point is preserved when moving from a body of
 * `sourceRadius` to a body of `targetRadius`.
 *
 * @param {number} lon - input longitude, degrees
 * @param {number} lat - input latitude, degrees
 * @param {{lat: number, lon: number}} anchor - fixed point that does not move
 * @param {number} k - scale factor = sourceRadius / targetRadius
 * @returns {[number, number]} [newLon, newLat] in degrees
 */
function scaleCoordinate(lon, lat, anchor, k) {
  // ---- Latitude axis (north/south) ----
  // A meridian (a line of constant longitude) is itself a great circle, so
  // the great-circle central angle between the anchor and this point's
  // *latitude* is simply the latitude difference converted to radians - no
  // haversine formula needed for this axis. Since arc length = radius *
  // angle, keeping the physical (great-circle) distance constant while the
  // radius changes means the angle must scale by k = sourceRadius /
  // targetRadius.
  const sourceLatAngleRad = toRadians(lat - anchor.lat);
  const targetLatAngleRad = sourceLatAngleRad * k;
  const newLat = anchor.lat + toDegrees(targetLatAngleRad);

  // ---- Longitude axis (east/west) ----
  // Moving along a line of constant latitude (a "parallel") is NOT a great
  // circle in general, so we use the haversine formula (via the npm
  // package) to measure the actual great-circle central angle between the
  // anchor and a point at the same latitude but offset in longitude.
  const lonDiffDeg = normalizeLonDeg(lon - anchor.lon);

  if (lonDiffDeg === 0) {
    return [anchor.lon, newLat];
  }

  const lonSign = Math.sign(lonDiffDeg);

  // Great-circle distance (meters, per the library's fixed Earth radius)
  // between the anchor and a point sharing the anchor's latitude, offset
  // by lonDiffDeg. Holding latitude fixed isolates the central angle
  // contributed purely by the longitude difference.
  const sourceDistanceMeters = haversineDistance({ lat: anchor.lat, lon: anchor.lon }, { lat: anchor.lat, lon: anchor.lon + lonDiffDeg });
  const sourceLonAngleRad = sourceDistanceMeters / EARTH_RADIUS_USED_BY_HAVERSINE_LIB;

  // Same arc-length-invariance scaling as the latitude axis.
  const targetLonAngleRad = sourceLonAngleRad * k;

  // Invert the haversine relation for two points that share a latitude:
  //   a = cos^2(lat) * sin^2(deltaLon / 2)
  //   centralAngle = 2 * asin(sqrt(a))
  // Solving for deltaLon given a target central angle:
  //   deltaLon = 2 * asin( sin(centralAngle / 2) / cos(lat) )
  //
  // We use cos(anchor.lat) as a single, fixed reference for every vertex
  // in the shape (rather than each point's own latitude). This keeps the
  // math simple and gives one consistent horizontal scale across the
  // whole shape, anchored at the point that stays fixed.
  const cosAnchorLat = Math.cos(toRadians(anchor.lat));

  // Guard against the anchor sitting on a pole, where longitude/cos(lat)
  // is degenerate (cos = 0) and east-west scaling has no meaning.
  const ratio = cosAnchorLat === 0 ? 0 : Math.sin(targetLonAngleRad / 2) / cosAnchorLat;
  // asin is only defined on [-1, 1]; clamp to guard tiny floating-point
  // overshoot (e.g. 1.0000000000000002) from ever throwing/NaN-ing.
  const clampedRatio = Math.max(-1, Math.min(1, ratio));
  const targetLonOffsetRad = 2 * Math.asin(clampedRatio) * lonSign;

  const newLon = normalizeLonDeg(anchor.lon + toDegrees(targetLonOffsetRad));

  return [newLon, newLat];
}

/**
 * Computes the default anchor point: the upper-left (north-west) corner of
 * the bounding box around every [lon, lat] pair provided.
 *
 * Latitude's max is a plain numeric max - latitude never wraps. Longitude
 * is trickier: a shape crossing the antimeridian (e.g. spanning +179 to
 * -179) has a naive min/max that spans nearly 360 degrees instead of a
 * few. We detect that case (span > 180 degrees) and re-derive the western
 * edge by shifting negative longitudes by +360 so the shape becomes
 * contiguous, then normalize the result back into (-180, 180].
 */
function computeDefaultAnchor(lonLatPairs) {
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const [lon, lat] of lonLatPairs) {
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  let westLon = minLon;
  if (maxLon - minLon > 180) {
    let shiftedMin = Infinity;
    for (const [lon] of lonLatPairs) {
      const shifted = lon < 0 ? lon + 360 : lon;
      if (shifted < shiftedMin) shiftedMin = shifted;
    }
    westLon = normalizeLonDeg(shiftedMin);
  }

  return { lat: maxLat, lon: westLon };
}

module.exports = {
  EARTH_MEAN_RADIUS_METERS,
  scaleCoordinate,
  computeDefaultAnchor,
  normalizeLonDeg,
};
