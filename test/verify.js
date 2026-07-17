"use strict";

// Quick manual verification: confirms that the great-circle width (measured
// at the anchor's latitude) and height (along the anchor's meridian) of the
// rectangle fixture are preserved in physical meters between the Earth
// input and the Mars-scaled output.

const haversineDistance = require("haversine-distance");

const EARTH_RADIUS = 6371000;
const MARS_RADIUS = 3389500;
const EARTH_RADIUS_USED_BY_HAVERSINE_LIB = 6378137;

function centralAngle(a, b) {
  return haversineDistance(a, b) / EARTH_RADIUS_USED_BY_HAVERSINE_LIB;
}

// Original (Earth) rectangle corners.
const srcNW = { lat: 40, lon: -100 };
const srcNE = { lat: 40, lon: -90 };
const srcSW = { lat: 30, lon: -100 };

// Mars-scaled rectangle corners (from rectangle.mars.out.kml).
const tgtNW = { lat: 40, lon: -100 };
const tgtNE = { lat: 40, lon: -81.1784218148175 };
const tgtSW = { lat: 21.203717362442838, lon: -100 };

const srcWidthMeters = centralAngle(srcNW, srcNE) * EARTH_RADIUS;
const tgtWidthMeters = centralAngle(tgtNW, tgtNE) * MARS_RADIUS;

const srcHeightMeters = centralAngle(srcNW, srcSW) * EARTH_RADIUS;
const tgtHeightMeters = centralAngle(tgtNW, tgtSW) * MARS_RADIUS;

console.log("Width  (Earth vs Mars, meters):", srcWidthMeters, tgtWidthMeters);
console.log("Height (Earth vs Mars, meters):", srcHeightMeters, tgtHeightMeters);
console.log("Width diff:", Math.abs(srcWidthMeters - tgtWidthMeters));
console.log("Height diff:", Math.abs(srcHeightMeters - tgtHeightMeters));
