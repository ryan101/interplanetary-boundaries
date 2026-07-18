// Quick manual verification: confirms that the great-circle distance from
// the anchor to every corner of the rectangle fixture is preserved in
// physical meters between the Earth input and the Mars-scaled output -
// including the SE corner, whose latitude differs from the anchor's (the
// case the old per-axis approach got wrong).

import LatLon from "geodesy/latlon-spherical.js";

const EARTH_RADIUS = 6371000;
const MARS_RADIUS = 3389500;

// Original (Earth) rectangle corners; anchor is the NW corner.
const srcAnchor = new LatLon(40, -100);
const srcNE = new LatLon(40, -90);
const srcSW = new LatLon(30, -100);
const srcSE = new LatLon(30, -90);

// Mars-scaled rectangle corners (from rectangle.mars.out.kml).
const tgtAnchor = new LatLon(40, -100);
const tgtNE = new LatLon(39.29460089423017, -81.29788235439167);
const tgtSW = new LatLon(21.20371736244283, -100);
const tgtSE = new LatLon(20.685414524659247, -82.80114502325219);

function report(label, srcPoint, tgtPoint) {
  const srcMeters = srcAnchor.distanceTo(srcPoint, EARTH_RADIUS);
  const tgtMeters = tgtAnchor.distanceTo(tgtPoint, MARS_RADIUS);
  console.log(`${label}: Earth=${srcMeters.toFixed(3)} m, Mars=${tgtMeters.toFixed(3)} m, diff=${Math.abs(srcMeters - tgtMeters).toExponential(3)} m`);
}

report("Anchor -> NE", srcNE, tgtNE);
report("Anchor -> SW", srcSW, tgtSW);
report("Anchor -> SE", srcSE, tgtSE);
