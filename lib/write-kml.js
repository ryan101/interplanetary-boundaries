"use strict";

/**
 * Minimal, dependency-free GeoJSON FeatureCollection -> KML string
 * serializer, covering only what this tool needs: Point, LineString,
 * Polygon (with holes), their Multi* variants, GeometryCollection, and a
 * feature's `name`/`description` properties.
 *
 * (Deliberately hand-rolled instead of using the `tokml` package, whose
 * dependency tree pulls in old, vulnerable, unmaintained packages.)
 */

function escapeXmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function coordinateToString(coordinate) {
  // KML coordinates are "lon,lat" or "lon,lat,altitude", comma-separated.
  return coordinate.join(",");
}

function coordinatesToString(coordinates) {
  // A ring/line is a space-separated list of "lon,lat[,alt]" tuples.
  return coordinates.map(coordinateToString).join(" ");
}

function linearRingXml(ring) {
  return `<LinearRing><coordinates>${coordinatesToString(ring)}</coordinates></LinearRing>`;
}

function polygonXml(rings) {
  const [outerRing, ...innerRings] = rings;
  const outerXml = `<outerBoundaryIs>${linearRingXml(outerRing)}</outerBoundaryIs>`;
  const innerXml = innerRings.map((ring) => `<innerBoundaryIs>${linearRingXml(ring)}</innerBoundaryIs>`).join("");
  return `<Polygon>${outerXml}${innerXml}</Polygon>`;
}

function geometryXml(geometry) {
  switch (geometry.type) {
    case "Point":
      return `<Point><coordinates>${coordinateToString(geometry.coordinates)}</coordinates></Point>`;
    case "LineString":
      return `<LineString><coordinates>${coordinatesToString(geometry.coordinates)}</coordinates></LineString>`;
    case "Polygon":
      return polygonXml(geometry.coordinates);
    case "MultiPoint":
      return `<MultiGeometry>${geometry.coordinates
        .map((coord) => `<Point><coordinates>${coordinateToString(coord)}</coordinates></Point>`)
        .join("")}</MultiGeometry>`;
    case "MultiLineString":
      return `<MultiGeometry>${geometry.coordinates
        .map((coords) => `<LineString><coordinates>${coordinatesToString(coords)}</coordinates></LineString>`)
        .join("")}</MultiGeometry>`;
    case "MultiPolygon":
      return `<MultiGeometry>${geometry.coordinates.map(polygonXml).join("")}</MultiGeometry>`;
    case "GeometryCollection":
      return `<MultiGeometry>${geometry.geometries.map(geometryXml).join("")}</MultiGeometry>`;
    default:
      throw new Error(`Unsupported GeoJSON geometry type: ${geometry.type}`);
  }
}

function placemarkXml(feature) {
  const properties = feature.properties || {};
  let xml = "<Placemark>";
  if (properties.name) {
    xml += `<name>${escapeXmlText(properties.name)}</name>`;
  }
  if (properties.description) {
    xml += `<description>${escapeXmlText(properties.description)}</description>`;
  }
  if (feature.geometry) {
    xml += geometryXml(feature.geometry);
  }
  xml += "</Placemark>";
  return xml;
}

function featureCollectionToKml(featureCollection) {
  const placemarks = (featureCollection.features || []).map(placemarkXml).join("");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' + placemarks + "</Document></kml>";
}

module.exports = { featureCollectionToKml };
