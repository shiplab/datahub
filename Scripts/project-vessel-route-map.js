/*
  This file displays a vessel route on an OpenStreetMap map.
  It can read latitude/longitude time series from the main JSON, or a linked
  GeoJSON file such as raw_GPS_data_ALMI_ATLAS.json.

  To add a route to another project, use series named latitude and longitude,
  or add one JSON entry whose name contains "gps" and whose Link points to a
  GeoJSON FeatureCollection. No project-specific JavaScript is required.
*/
window.ProjectVesselRouteMap = (function () {
  function cleanName(name) {
    return String(name || "").toLowerCase().replace(/[^a-z]/g, "");
  }

  function validCoordinate(latitude, longitude) {
    return Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  function pointsFromTimeSeries(data) {
    const latitudes = data.series.filter(function (series) {
      return cleanName(series.name).includes("latitude") && series.timeSeries;
    });
    const longitudes = data.series.filter(function (series) {
      return cleanName(series.name).includes("longitude") && series.timeSeries;
    });

    for (let latitudeIndex = 0; latitudeIndex < latitudes.length; latitudeIndex += 1) {
      const latitudeSeries = latitudes[latitudeIndex];
      const longitudeSeries = longitudes.find(function (candidate) {
        return candidate.timeSeries.time_axis === latitudeSeries.timeSeries.time_axis &&
          candidate.timeSeries.values.length === latitudeSeries.timeSeries.values.length &&
          candidate.link === latitudeSeries.link;
      });

      if (!longitudeSeries) {
        continue;
      }

      const points = [];
      latitudeSeries.timeSeries.values.forEach(function (latitudeValue, index) {
        const latitude = Number(latitudeValue);
        const longitude = Number(longitudeSeries.timeSeries.values[index]);

        if (validCoordinate(latitude, longitude)) {
          points.push([latitude, longitude]);
        }
      });

      if (points.length > 1) {
        return points;
      }
    }

    return [];
  }

  async function pointsFromLinkedGps(data) {
    const gpsSeries = data.series.find(function (series) {
      return cleanName(series.name).includes("gps") && series.sourceUrl;
    });

    if (!gpsSeries) {
      return [];
    }

    const response = await fetch(gpsSeries.sourceUrl);

    if (!response.ok) {
      return [];
    }

    const geoJson = await response.json();
    return (geoJson.features || []).map(function (feature) {
      const coordinates = feature.geometry && feature.geometry.coordinates || [];
      return [Number(coordinates[1]), Number(coordinates[0])];
    }).filter(function (point) {
      return validCoordinate(point[0], point[1]);
    });
  }

  function reducePoints(points) {
    const maximumPoints = 3000;
    const step = Math.max(1, Math.ceil(points.length / maximumPoints));
    const reduced = points.filter(function (point, index) {
      return index % step === 0;
    });

    if (reduced[reduced.length - 1] !== points[points.length - 1]) {
      reduced.push(points[points.length - 1]);
    }

    return reduced;
  }

  async function render(container, data) {
    if (!window.L) {
      return false;
    }

    let points = pointsFromTimeSeries(data);

    if (points.length < 2) {
      points = await pointsFromLinkedGps(data);
    }

    if (points.length < 2) {
      return false;
    }

    const card = document.createElement("section");
    card.className = "graph-card ship-map-card";
    card.innerHTML =
      "<div class='graph-heading'><div><h3>Vessel route</h3>" +
      "<p>Route built from the project GPS data.</p></div></div>" +
      "<div class='map-legend'><span style='border-color:#27833c'>Start</span>" +
      "<span style='border-color:#b73737'>End</span></div>";

    const mapElement = document.createElement("div");
    mapElement.className = "ship-map";
    card.appendChild(mapElement);
    container.appendChild(card);

    const displayedPoints = reducePoints(points);
    const map = window.L.map(mapElement);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const route = window.L.polyline(displayedPoints, {
      color: "#1479a8",
      weight: 4,
      opacity: 0.9
    }).addTo(map);
    window.L.circleMarker(displayedPoints[0], { color: "#27833c", radius: 7 }).addTo(map);
    window.L.circleMarker(displayedPoints[displayedPoints.length - 1], {
      color: "#b73737",
      radius: 7
    }).addTo(map);
    map.fitBounds(route.getBounds(), { padding: [20, 20] });
    window.setTimeout(function () { map.invalidateSize(); }, 100);
    return true;
  }

  return { render: render };
}());
