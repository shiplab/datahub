const GUNNERUS_FOLDER = "../Projects/Gunnerus/";
const DNV_DATA_FILE = "../Data/dnv-vis-3-10a.json";
const SECTION_ORDER = ["crane", "engine", "ship", "wind"];
const CHART_COLORS = ["#1479a8", "#27833c", "#d47b16"];

let availableSections = [];
let selectedSection = "";
let selectedData = null;
let sectionCache = new Map();
let dnvItems = [];
let dnvItemsByCode = new Map();
let dnvChildrenByCode = new Map();
let measurementRecordsByCode = new Map();
let renderedRowsByCode = new Map();
let pathCache = new Map();
let visibleCharts = [];
let activeShipMap = null;

const accordionsContainer = document.getElementById("gunnerus-accordions");
const downloadButton = document.getElementById("download-gunnerus-json");
const treeContainer = document.getElementById("dnv-tree");
const treeStatus = document.getElementById("tree-status");
const treeSearch = document.getElementById("tree-search");
const treeSearchResults = document.getElementById("tree-search-results");

async function loadGunnerusSections() {
  try {
    const response = await fetch("../files.json");
    const filesData = await response.json();
    const gunnerusProject = (filesData.children || []).find(function (project) {
      return project.name === "Gunnerus";
    });

    availableSections = (gunnerusProject && gunnerusProject.children || []).filter(function (file) {
      const sectionName = file.name.toLowerCase().replace(".json", "");
      return file.type === "file" && SECTION_ORDER.includes(sectionName);
    }).map(function (file) {
      return file.name.slice(0, -5).toLowerCase();
    }).sort(function (first, second) {
      return SECTION_ORDER.indexOf(first) - SECTION_ORDER.indexOf(second);
    });

    createSectionAccordions();
    openSectionFromUrl();
  } catch (error) {
    accordionsContainer.innerHTML =
      "<p class='error-message'>The Gunnerus list could not be loaded from files.json.</p>";
  }
}

function createSectionAccordions() {
  accordionsContainer.innerHTML = "";

  availableSections.forEach(function (sectionName) {
    const details = document.createElement("details");
    details.className = "vessel-accordion gunnerus-accordion";
    details.dataset.section = sectionName;

    const summary = document.createElement("summary");
    summary.textContent = capitalize(sectionName);

    const content = document.createElement("div");
    content.className = "vessel-details gunnerus-details";
    content.innerHTML = "<p class='loading-message'>Open this group to load its graphs.</p>";

    details.appendChild(summary);
    details.appendChild(content);
    accordionsContainer.appendChild(details);

    details.addEventListener("toggle", function () {
      if (details.open) {
        closeOtherAccordions(details);
        selectSection(sectionName, content);
      } else {
        window.setTimeout(function () {
          if (!accordionsContainer.querySelector("details[open]")) {
            clearSelectedSection();
          }
        }, 0);
      }
    });
  });
}

function closeOtherAccordions(openDetails) {
  accordionsContainer.querySelectorAll("details[open]").forEach(function (details) {
    if (details !== openDetails) {
      details.open = false;
    }
  });
}

async function selectSection(sectionName, content) {
  selectedSection = sectionName;
  selectedData = null;
  visibleCharts = [];
  enableDownload(sectionName);
  content.innerHTML = "<p class='loading-message'>Loading all measurement points...</p>";
  window.history.replaceState({}, "", "?section=" + encodeURIComponent(sectionName));

  try {
    let data = sectionCache.get(sectionName);

    if (!data) {
      const response = await fetch(GUNNERUS_FOLDER + sectionName + ".json");

      if (!response.ok) {
        throw new Error("JSON file not found");
      }

      const jsonText = await response.text();
      const validJsonText = jsonText.replace(/\bNaN\b/g, "null").replace(/-?Infinity/g, "null");
      data = JSON.parse(validJsonText);
      sectionCache.set(sectionName, data);
    }

    if (selectedSection !== sectionName) {
      return;
    }

    selectedData = data;
    measurementRecordsByCode = buildMeasurementRecords(data, sectionName);
    renderSectionCharts(content, data, sectionName);
    updateRenderedTreeValues();
    updateTreeStatus();
    showFirstMappedNode();
  } catch (error) {
    content.innerHTML = "<p class='error-message'>This Gunnerus JSON could not be loaded.</p>";
  }
}

function clearSelectedSection() {
  removeActiveShipMap();
  selectedSection = "";
  selectedData = null;
  visibleCharts = [];
  measurementRecordsByCode = new Map();
  disableDownload();
  updateRenderedTreeValues();
  window.history.replaceState({}, "", window.location.pathname);

  if (dnvItems.length) {
    treeStatus.textContent = dnvItems.length + " DNV nodes loaded. Select a Gunnerus data group.";
  }
}

function enableDownload(sectionName) {
  downloadButton.href = GUNNERUS_FOLDER + sectionName + ".json";
  downloadButton.download = sectionName + ".json";
  downloadButton.classList.remove("disabled");
  downloadButton.setAttribute("aria-disabled", "false");
}

function disableDownload() {
  downloadButton.removeAttribute("href");
  downloadButton.removeAttribute("download");
  downloadButton.classList.add("disabled");
  downloadButton.setAttribute("aria-disabled", "true");
}

function buildMeasurementRecords(data, sectionName) {
  const recordsByCode = new Map();

  (data.datasets || []).forEach(function (dataset) {
    (dataset.fields || []).forEach(function (field) {
      if (!shouldUseField(field.field, sectionName)) {
        return;
      }

      const code = getLastDnvCode(field.dnv_path);

      if (!code) {
        return;
      }

      const records = recordsByCode.get(code) || [];
      records.push({
        name: formatFieldName(field.field),
        unit: field.unit || "",
        dnvPath: field.dnv_path,
        dataset: dataset.signal_group || "Gunnerus data"
      });
      recordsByCode.set(code, records);
    });
  });

  return recordsByCode;
}

function shouldUseField(fieldName, sectionName) {
  if (sectionName !== "wind") {
    return true;
  }

  return fieldName.endsWith("/Wind_Speed") || fieldName.endsWith("/Wind_Direction");
}

function getLastDnvCode(dnvPath) {
  if (!dnvPath || dnvPath.toLowerCase().includes("not found")) {
    return "";
  }

  const codes = dnvPath.split("/").filter(function (code) {
    return code.trim() !== "";
  });
  return codes[codes.length - 1] || "";
}

function renderSectionCharts(container, data, sectionName) {
  removeActiveShipMap();
  container.innerHTML = "";

  const overview = document.createElement("div");
  overview.className = "overview-box gunnerus-overview";
  const description = document.createElement("p");
  description.textContent = data.description || capitalize(sectionName) + " measurements.";
  overview.appendChild(description);
  container.appendChild(overview);

  const charts = sectionName === "engine" ? createEngineChartDefinitions(data) :
    createStandardChartDefinitions(data, sectionName);

  if (sectionName === "ship") {
    const mapCard = createShipMapCard(data);

    if (mapCard) {
      container.appendChild(mapCard);
    }
  }

  const count = document.createElement("p");
  count.className = "graph-count";
  count.textContent = sectionName === "ship" ?
    charts.length + " graphs and 1 trajectory map — every available JSON point is used." :
    charts.length + " graphs — every available JSON point is used.";
  container.appendChild(count);

  if (!charts.length) {
    container.insertAdjacentHTML("beforeend", "<p class='loading-message'>No graphable fields were found.</p>");
    return;
  }

  charts.forEach(function (chartDefinition) {
    const card = createChartCard(chartDefinition);
    container.appendChild(card);
    drawLineChart(chartDefinition.canvas, chartDefinition);
    visibleCharts.push(chartDefinition);
  });
}

function removeActiveShipMap() {
  if (activeShipMap) {
    activeShipMap.remove();
    activeShipMap = null;
  }
}

function createStandardChartDefinitions(data, sectionName) {
  const charts = [];

  (data.datasets || []).forEach(function (dataset) {
    const timestamps = dataset.timeseries && dataset.timeseries.timestamp || [];

    (dataset.fields || []).forEach(function (field) {
      if (!shouldUseField(field.field, sectionName)) {
        return;
      }

      if (sectionName === "ship" && isCoordinateField(field.field)) {
        return;
      }

      charts.push({
        title: formatFieldName(field.field),
        subtitle: dataset.signal_group || dataset.source_file || "Gunnerus data",
        unit: field.unit || "",
        dnvPath: field.dnv_path || "DNV not found",
        timestamps: timestamps,
        series: [{
          name: formatFieldName(field.field),
          values: dataset.timeseries && dataset.timeseries[field.field] || [],
          color: CHART_COLORS[0]
        }]
      });
    });
  });

  return charts;
}

function createEngineChartDefinitions(data) {
  const chartsByMeasure = new Map();

  (data.datasets || []).forEach(function (dataset) {
    const timestamps = dataset.timeseries && dataset.timeseries.timestamp || [];

    (dataset.fields || []).forEach(function (field) {
      const match = field.field.match(/Gunnerus\/Engine([123])\/(.+)$/);

      if (!match) {
        return;
      }

      const engineNumber = Number(match[1]);
      const measureName = match[2];
      let chart = chartsByMeasure.get(measureName);

      if (!chart) {
        chart = {
          title: readableName(measureName),
          subtitle: "Engine 1, Engine 2 and Engine 3",
          unit: field.unit || "",
          dnvPath: field.dnv_path || "DNV not found",
          timestamps: timestamps,
          series: []
        };
        chartsByMeasure.set(measureName, chart);
      }

      chart.series.push({
        name: "Engine " + engineNumber,
        values: dataset.timeseries && dataset.timeseries[field.field] || [],
        color: CHART_COLORS[engineNumber - 1]
      });
    });
  });

  return Array.from(chartsByMeasure.values()).sort(function (first, second) {
    return first.title.localeCompare(second.title);
  });
}

function isCoordinateField(fieldName) {
  const shortName = fieldName.split("/").pop().toLowerCase();
  return shortName === "latitude" || shortName === "longitude";
}

function createShipMapCard(data) {
  const routes = buildShipRoutes(data);

  if (!routes.length) {
    return null;
  }

  const card = document.createElement("article");
  card.className = "graph-card ship-map-card";

  const heading = document.createElement("div");
  heading.className = "graph-heading";
  const titleBox = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "Ship trajectory";
  const subtitle = document.createElement("p");
  subtitle.textContent = "Actual latitude and longitude positions in chronological order";
  titleBox.appendChild(title);
  titleBox.appendChild(subtitle);
  heading.appendChild(titleBox);

  const controls = document.createElement("div");
  controls.className = "map-controls";
  const fitButton = createMapButton("Fit route", "Fit the real trajectory");
  const worldButton = createMapButton("World", "Show the complete world");
  controls.appendChild(fitButton);
  controls.appendChild(worldButton);
  heading.appendChild(controls);
  card.appendChild(heading);

  const legend = document.createElement("div");
  legend.className = "map-legend";
  routes.forEach(function (route) {
    const item = document.createElement("span");
    item.style.borderColor = route.color;
    item.textContent = route.name + " — " + route.points.length + " positions";
    legend.appendChild(item);
  });
  card.appendChild(legend);

  const mapWrap = document.createElement("div");
  mapWrap.className = "ship-map-wrap";
  const mapElement = document.createElement("div");
  mapElement.className = "ship-map";
  mapElement.setAttribute("role", "application");
  mapElement.setAttribute("aria-label", "OpenStreetMap showing the real Gunnerus trajectory");
  mapWrap.appendChild(mapElement);
  card.appendChild(mapWrap);

  const help = document.createElement("p");
  help.className = "map-help";
  help.textContent = "Drag or zoom the OpenStreetMap view. Green marks the start and red marks the end.";
  card.appendChild(help);

  window.setTimeout(function () {
    initializeOpenStreetMap(mapElement, routes, fitButton, worldButton);
  }, 0);
  return card;
}

function createMapButton(text, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "map-button";
  button.textContent = text;
  button.title = title;
  return button;
}

function initializeOpenStreetMap(mapElement, routes, fitButton, worldButton) {
  if (typeof L === "undefined") {
    mapElement.innerHTML = "<p class='error-message'>OpenStreetMap could not be loaded. Check the internet connection.</p>";
    return;
  }

  activeShipMap = L.map(mapElement, {
    worldCopyJump: true
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
  }).addTo(activeShipMap);

  const routeBounds = L.latLngBounds([]);

  routes.forEach(function (route) {
    const positions = route.points.map(function (point) {
      return [point.latitude, point.longitude];
    });

    L.polyline(positions, {
      color: "#ffffff",
      weight: 9,
      opacity: 0.9
    }).addTo(activeShipMap);

    L.polyline(positions, {
      color: route.color,
      weight: 5,
      opacity: 1
    }).addTo(activeShipMap).bindPopup(route.name + " — " + route.points.length + " positions");

    positions.forEach(function (position) {
      routeBounds.extend(position);
    });

    addRouteMarker(activeShipMap, route.points[0], route.name + " — start", "#27833c");
    addRouteMarker(activeShipMap, route.points[route.points.length - 1], route.name + " — end", "#b73737");
  });

  function fitRoute() {
    activeShipMap.fitBounds(routeBounds, { padding: [30, 30] });

    if (activeShipMap.getZoom() > 15) {
      activeShipMap.setZoom(15);
    }
  }

  fitButton.addEventListener("click", fitRoute);
  worldButton.addEventListener("click", function () {
    activeShipMap.setView([20, 0], 2);
  });
  fitRoute();
}

function addRouteMarker(map, point, label, color) {
  L.circleMarker([point.latitude, point.longitude], {
    radius: 6,
    color: "#ffffff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1
  }).addTo(map).bindPopup(label + "<br>" + formatTimestamp(point.timestamp));
}

function buildShipRoutes(data) {
  const routes = [];

  (data.datasets || []).forEach(function (dataset, datasetIndex) {
    const latitudeField = (dataset.fields || []).find(function (field) {
      return field.field.split("/").pop().toLowerCase() === "latitude";
    });
    const longitudeField = (dataset.fields || []).find(function (field) {
      return field.field.split("/").pop().toLowerCase() === "longitude";
    });

    if (!latitudeField || !longitudeField || !dataset.timeseries) {
      return;
    }

    const latitudes = dataset.timeseries[latitudeField.field] || [];
    const longitudes = dataset.timeseries[longitudeField.field] || [];
    const timestamps = dataset.timeseries.timestamp || [];
    const pointCount = Math.min(latitudes.length, longitudes.length);
    const points = [];

    for (let index = 0; index < pointCount; index += 1) {
      if (!isNumeric(latitudes[index]) || !isNumeric(longitudes[index])) {
        continue;
      }

      const latitude = normalizeMapCoordinate(Number(latitudes[index]), 90);
      const longitude = normalizeMapCoordinate(Number(longitudes[index]), 180);

      if (latitude === null || longitude === null) {
        continue;
      }

      points.push({
        latitude: latitude,
        longitude: longitude,
        timestamp: timestamps[index] || ""
      });
    }

    if (points.length) {
      routes.push({
        name: getRouteName(dataset.signal_group, datasetIndex),
        color: CHART_COLORS[routes.length % CHART_COLORS.length],
        points: points
      });
    }
  });

  return routes;
}

function normalizeMapCoordinate(value, maximumDegrees) {
  if (Math.abs(value) <= maximumDegrees) {
    return value;
  }

  const sign = value < 0 ? -1 : 1;
  const absoluteValue = Math.abs(value);
  const degrees = Math.floor(absoluteValue / 100);
  const minutes = absoluteValue - degrees * 100;
  const decimalDegrees = degrees + minutes / 60;

  if (minutes >= 60 || decimalDegrees > maximumDegrees) {
    return null;
  }

  return decimalDegrees * sign;
}

function getRouteName(signalGroup, datasetIndex) {
  const text = signalGroup || "Ship position data";

  if (text.includes("#1")) {
    return "Motion log 1";
  }

  if (text.includes("#2")) {
    return "Motion log 2";
  }

  return datasetIndex === 0 ? "Ship data logger" : text;
}

function createChartCard(chartDefinition) {
  const card = document.createElement("article");
  card.className = "graph-card";

  const heading = document.createElement("div");
  heading.className = "graph-heading";

  const titleBox = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = chartDefinition.title;
  const subtitle = document.createElement("p");
  subtitle.textContent = chartDefinition.subtitle;
  titleBox.appendChild(title);
  titleBox.appendChild(subtitle);

  const showButton = document.createElement("button");
  showButton.className = "show-dnv-button";
  showButton.type = "button";
  showButton.textContent = "Show in DNV";
  showButton.addEventListener("click", function () {
    showTreeNode(getLastDnvCode(chartDefinition.dnvPath));
  });

  heading.appendChild(titleBox);
  heading.appendChild(showButton);
  card.appendChild(heading);

  if (chartDefinition.series.length > 1) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    chartDefinition.series.forEach(function (series) {
      const item = document.createElement("span");
      item.style.borderColor = series.color;
      item.textContent = series.name;
      legend.appendChild(item);
    });
    card.appendChild(legend);
  }

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "chart-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "measurement-chart";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", chartDefinition.title + " over time");
  canvasWrap.appendChild(canvas);
  card.appendChild(canvasWrap);

  const path = document.createElement("p");
  path.className = "graph-dnv-path";
  path.textContent = chartDefinition.dnvPath;
  card.appendChild(path);

  chartDefinition.canvas = canvas;
  return card;
}

function drawLineChart(canvas, chartDefinition) {
  const context = canvas.getContext("2d");
  const width = 900;
  const height = 260;
  const left = 62;
  const right = 18;
  const top = 18;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const numericValues = [];
  chartDefinition.series.forEach(function (series) {
    series.values.forEach(function (value) {
      if (isNumeric(value)) {
        numericValues.push(Number(value));
      }
    });
  });

  if (!numericValues.length) {
    context.fillStyle = "#66757d";
    context.font = "15px Arial";
    context.textAlign = "center";
    context.fillText("No numeric values available for this field", width / 2, height / 2);
    return;
  }

  let minimum = Math.min.apply(null, numericValues);
  let maximum = Math.max.apply(null, numericValues);

  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.05 || 1;
    minimum -= padding;
    maximum += padding;
  }

  context.strokeStyle = "#dce4e7";
  context.fillStyle = "#66757d";
  context.font = "12px Arial";
  context.textAlign = "right";

  for (let line = 0; line <= 4; line += 1) {
    const y = top + plotHeight * line / 4;
    const value = maximum - (maximum - minimum) * line / 4;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(width - right, y);
    context.stroke();
    context.fillText(formatNumber(value), left - 8, y + 4);
  }

  context.strokeStyle = "#7b8b92";
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, top + plotHeight);
  context.lineTo(width - right, top + plotHeight);
  context.stroke();

  const maximumPointCount = Math.max.apply(null, chartDefinition.series.map(function (series) {
    return series.values.length;
  }));

  chartDefinition.series.forEach(function (series) {
    context.strokeStyle = series.color;
    context.lineWidth = 1.5;
    context.beginPath();
    let drawing = false;

    series.values.forEach(function (value, index) {
      if (!isNumeric(value)) {
        drawing = false;
        return;
      }

      const x = left + plotWidth * index / Math.max(maximumPointCount - 1, 1);
      const y = top + (maximum - Number(value)) * plotHeight / (maximum - minimum);

      if (!drawing) {
        context.moveTo(x, y);
        drawing = true;
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
  });

  const timestamps = chartDefinition.timestamps || [];
  context.fillStyle = "#66757d";
  context.font = "12px Arial";
  context.textAlign = "left";
  context.fillText(formatTimestamp(timestamps[0]), left, height - 18);
  context.textAlign = "center";
  context.fillText(formatTimestamp(timestamps[Math.floor((timestamps.length - 1) / 2)]), left + plotWidth / 2, height - 18);
  context.textAlign = "right";
  context.fillText(formatTimestamp(timestamps[timestamps.length - 1]), width - right, height - 18);

  if (chartDefinition.unit) {
    context.save();
    context.translate(16, top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = "center";
    context.fillText(chartDefinition.unit, 0, 0);
    context.restore();
  }
}

function isNumeric(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function formatNumber(value) {
  const absolute = Math.abs(value);

  if (absolute >= 1000 || (absolute > 0 && absolute < 0.01)) {
    return value.toExponential(2);
  }

  return value.toFixed(2).replace(/\.00$/, "");
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Time";
  }

  const text = String(timestamp).replace("T", " ").replace("Z", "");
  return text.length > 19 ? text.slice(0, 19) : text;
}

function formatFieldName(fieldName) {
  const pieces = fieldName.split("/");
  const shortName = pieces[pieces.length - 1];
  const engine = fieldName.match(/Engine([123])/);
  const side = fieldName.includes("hcx_port") ? "Port — " : fieldName.includes("hcx_stbd") ? "Starboard — " : "";
  return (engine ? "Engine " + engine[1] + " — " : side) + readableName(shortName);
}

function readableName(name) {
  return name.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, function (letter) {
    return letter.toUpperCase();
  });
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function loadDnvTree() {
  try {
    const response = await fetch(DNV_DATA_FILE);

    if (!response.ok) {
      throw new Error("DNV data file not found");
    }

    const data = await response.json();
    dnvItems = data.items || [];
    dnvItemsByCode = new Map();
    dnvChildrenByCode = new Map();

    dnvItems.forEach(function (item) {
      dnvItemsByCode.set(item.code, item);
    });

    (data.relations || []).forEach(function (relation) {
      const parentCode = relation[0];
      const childCode = relation[1];
      const children = dnvChildrenByCode.get(parentCode) || [];

      if (!children.includes(childCode)) {
        children.push(childCode);
        dnvChildrenByCode.set(parentCode, children);
      }
    });

    renderTreeRoots();
    updateTreeStatus();

    if (selectedData) {
      showFirstMappedNode();
    }
  } catch (error) {
    treeStatus.textContent = "The complete DNV hierarchy could not be loaded.";
    treeContainer.innerHTML = "<p class='error-message'>Open the website through a local web server.</p>";
  }
}

function renderTreeRoots() {
  treeContainer.innerHTML = "";
  renderedRowsByCode = new Map();

  getSortedChildren("VE").forEach(function (code) {
    treeContainer.appendChild(createTreeNode(code, new Set(["VE"])));
  });
}

function getSortedChildren(code) {
  return (dnvChildrenByCode.get(code) || []).slice().sort(function (first, second) {
    return first.localeCompare(second, undefined, { numeric: true });
  });
}

function createTreeNode(code, ancestorCodes) {
  const item = dnvItemsByCode.get(code);
  const node = document.createElement("div");
  node.className = "tree-node";
  node.dataset.code = code;
  node.treeAncestors = new Set(ancestorCodes);

  if (!item) {
    return node;
  }

  const availableChildren = getSortedChildren(code).filter(function (childCode) {
    return !ancestorCodes.has(childCode) && childCode !== code;
  });
  const row = document.createElement("div");
  row.className = "tree-row";
  const toggle = document.createElement("button");
  toggle.className = "tree-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open " + (item.commonName || item.name || code));
  toggle.textContent = availableChildren.length ? "+" : "•";

  if (!availableChildren.length) {
    toggle.classList.add("no-children");
    toggle.disabled = true;
  }

  const badge = document.createElement("span");
  badge.className = "tree-code";
  badge.textContent = code;
  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = item.commonName || item.name || code;

  row.appendChild(toggle);
  row.appendChild(badge);
  row.appendChild(name);
  node.appendChild(row);

  const children = document.createElement("div");
  children.className = "tree-children";
  children.hidden = true;
  node.appendChild(children);

  if (availableChildren.length) {
    toggle.addEventListener("click", function () {
      toggleTreeNode(node);
    });
    name.addEventListener("click", function () {
      toggleTreeNode(node);
    });
    name.style.cursor = "pointer";
  }

  const rows = renderedRowsByCode.get(code) || new Set();
  rows.add(row);
  renderedRowsByCode.set(code, rows);
  updateTreeRowValue(row, code);
  return node;
}

function toggleTreeNode(node, forceOpen) {
  const children = node.querySelector(":scope > .tree-children");
  const toggle = node.querySelector(":scope > .tree-row > .tree-toggle");

  if (!children || !toggle || toggle.classList.contains("no-children")) {
    return;
  }

  const shouldOpen = forceOpen === true || children.hidden;

  if (shouldOpen && !children.dataset.rendered) {
    const nextAncestors = new Set(node.treeAncestors);
    nextAncestors.add(node.dataset.code);

    getSortedChildren(node.dataset.code).forEach(function (childCode) {
      if (!nextAncestors.has(childCode)) {
        children.appendChild(createTreeNode(childCode, nextAncestors));
      }
    });
    children.dataset.rendered = "true";
  }

  children.hidden = !shouldOpen;
  toggle.textContent = shouldOpen ? "−" : "+";
  toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

function updateRenderedTreeValues() {
  renderedRowsByCode.forEach(function (rows, code) {
    rows.forEach(function (row) {
      updateTreeRowValue(row, code);
    });
  });
}

function updateTreeRowValue(row, code) {
  const oldValues = row.querySelector(".tree-vessel-values");

  if (oldValues) {
    oldValues.remove();
  }

  row.classList.remove("has-vessel-data");
  const records = measurementRecordsByCode.get(code) || [];

  if (!records.length) {
    return;
  }

  row.classList.add("has-vessel-data");
  const values = document.createElement("span");
  values.className = "tree-vessel-values";

  records.forEach(function (record) {
    const value = document.createElement("span");
    value.className = "tree-vessel-value";
    value.textContent = record.name + (record.unit ? " (" + record.unit + ")" : "");
    values.appendChild(value);
  });

  row.appendChild(values);
}

function updateTreeStatus() {
  if (!dnvItems.length) {
    return;
  }

  if (!selectedSection) {
    treeStatus.textContent = dnvItems.length + " DNV nodes loaded. Select a Gunnerus data group.";
    return;
  }

  let measurementCount = 0;
  measurementRecordsByCode.forEach(function (records) {
    measurementCount += records.length;
  });
  treeStatus.textContent = capitalize(selectedSection) + ": " + measurementCount +
    " measurements mapped to " + measurementRecordsByCode.size + " DNV nodes.";
}

function showFirstMappedNode() {
  if (!dnvItems.length || !measurementRecordsByCode.size) {
    return;
  }

  showTreeNode(measurementRecordsByCode.keys().next().value);
}

function searchDnvTree(query) {
  const cleanQuery = query.trim().toLowerCase();
  treeSearchResults.innerHTML = "";

  if (cleanQuery.length < 2) {
    return;
  }

  const results = dnvItems.filter(function (item) {
    const searchText = [item.code, item.commonName, item.name].filter(Boolean).join(" ").toLowerCase();
    return searchText.includes(cleanQuery);
  }).sort(function (first, second) {
    const firstStarts = first.code.toLowerCase().startsWith(cleanQuery) ||
      (first.commonName || "").toLowerCase().startsWith(cleanQuery);
    const secondStarts = second.code.toLowerCase().startsWith(cleanQuery) ||
      (second.commonName || "").toLowerCase().startsWith(cleanQuery);
    return Number(secondStarts) - Number(firstStarts) ||
      first.code.localeCompare(second.code, undefined, { numeric: true });
  }).slice(0, 50);

  results.forEach(function (item) {
    const button = document.createElement("button");
    button.className = "search-result";
    button.type = "button";
    const code = document.createElement("span");
    code.className = "search-result-code";
    code.textContent = item.code;
    const name = document.createElement("span");
    name.textContent = item.commonName || item.name || item.code;
    button.appendChild(code);
    button.appendChild(name);
    button.addEventListener("click", function () {
      treeSearchResults.innerHTML = "";
      treeSearch.value = item.code + " " + (item.commonName || item.name || "");
      showTreeNode(item.code);
    });
    treeSearchResults.appendChild(button);
  });

  if (!results.length) {
    treeSearchResults.innerHTML = "<p class='loading-message'>No DNV node found.</p>";
  }
}

function findPathFromRoot(targetCode) {
  if (pathCache.has(targetCode)) {
    return pathCache.get(targetCode);
  }

  const queue = [["VE"]];
  const visited = new Set(["VE"]);

  while (queue.length) {
    const path = queue.shift();
    const currentCode = path[path.length - 1];

    if (currentCode === targetCode) {
      pathCache.set(targetCode, path);
      return path;
    }

    getSortedChildren(currentCode).forEach(function (childCode) {
      if (!visited.has(childCode)) {
        visited.add(childCode);
        queue.push(path.concat(childCode));
      }
    });
  }

  return [];
}

function showTreeNode(code) {
  if (!code) {
    return;
  }

  const path = findPathFromRoot(code);

  if (path.length < 2) {
    return;
  }

  let currentContainer = treeContainer;
  let currentNode = null;

  for (let index = 1; index < path.length; index += 1) {
    const wantedCode = path[index];
    currentNode = findDirectTreeNode(currentContainer, wantedCode);

    if (!currentNode) {
      return;
    }

    if (index < path.length - 1) {
      toggleTreeNode(currentNode, true);
      currentContainer = currentNode.querySelector(":scope > .tree-children");
    }
  }

  if (currentNode) {
    document.querySelectorAll(".tree-focus").forEach(function (node) {
      node.classList.remove("tree-focus");
    });
    currentNode.classList.add("tree-focus");
    currentNode.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(function () {
      currentNode.classList.remove("tree-focus");
    }, 1800);
  }
}

function findDirectTreeNode(container, code) {
  return Array.from(container.children).find(function (child) {
    return child.classList.contains("tree-node") && child.dataset.code === code;
  });
}

function openSectionFromUrl() {
  const sectionName = new URLSearchParams(window.location.search).get("section");

  if (!sectionName || !availableSections.includes(sectionName)) {
    return;
  }

  const details = Array.from(accordionsContainer.querySelectorAll("details")).find(function (item) {
    return item.dataset.section === sectionName;
  });

  if (details) {
    details.open = true;
    details.scrollIntoView({ block: "start" });
  }
}

treeSearch.addEventListener("input", function () {
  searchDnvTree(treeSearch.value);
});

treeSearch.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    treeSearch.value = "";
    treeSearchResults.innerHTML = "";
  }
});

document.addEventListener("click", function (event) {
  if (!event.target.closest(".tree-search-box")) {
    treeSearchResults.innerHTML = "";
  }
});

loadGunnerusSections();
loadDnvTree();
