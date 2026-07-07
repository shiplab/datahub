/*
  This file creates the information cards on the left side.
  Fixed values are shown directly. Time-series measurements are accordions and
  ask project-time-series-charts.js to draw their graph only when opened.

  Categories come from location in JSON. To add a category or a measurement,
  add it to the JSON; this display updates automatically. Latitude and
  longitude graphs are hidden because they are represented by the route map.
*/
window.ProjectInformationDisplay = (function () {
  function readableName(name) {
    const text = String(name || "Information").replaceAll("_", " ");
    return text.replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function simpleValue(value) {
    if (value === undefined || value === null || value === "") {
      return "Not provided";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function isCoordinateSeries(series) {
    const name = String(series.name || "").toLowerCase();
    return series.timeSeries && (name.includes("latitude") || name.includes("longitude"));
  }

  function sourceLabel(series) {
    const sources = series.sources || [];

    if (!sources.length) {
      return "No source link";
    }

    if (sources.length > 1) {
      return sources.length + " source files (open this information in the DNV tree)";
    }

    try {
      return decodeURIComponent(new URL(sources[0].url).pathname.split("/").pop());
    } catch (error) {
      return sources[0].link;
    }
  }

  function createShowDnvButton(series) {
    if (!window.ProjectJsonLoader.hasDnvPath(series.dnvPath)) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "show-dnv-button";
    button.textContent = "Show in DNV";
    button.addEventListener("click", function () {
      window.ProjectDnvTree.showPath(series.dnvPath);
    });
    return button;
  }

  function createStaticCard(series) {
    const mapped = window.ProjectJsonLoader.hasDnvPath(series.dnvPath);
    const card = document.createElement("article");
    card.className = "information-card " + (mapped ? "mapped" : "unmapped");

    const heading = document.createElement("div");
    heading.className = "information-card-heading";
    const title = document.createElement("span");
    title.className = "information-card-title";
    title.textContent = readableName(series.name);
    heading.appendChild(title);

    const button = createShowDnvButton(series);
    if (button) {
      heading.appendChild(button);
    }

    const value = document.createElement("div");
    value.className = "information-card-value";
    value.textContent = simpleValue(series.value);
    const path = document.createElement("div");
    path.className = "information-card-path";
    path.textContent = mapped ? series.dnvPath : "DNV path not found";

    card.appendChild(heading);
    card.appendChild(value);
    card.appendChild(path);
    return card;
  }

  function createTimeSeriesCard(series, projectData) {
    const mapped = window.ProjectJsonLoader.hasDnvPath(series.dnvPath);
    const details = document.createElement("details");
    details.className = "graph-card measurement-accordion " + (mapped ? "mapped" : "unmapped");

    const summary = document.createElement("summary");
    summary.textContent = readableName(series.name);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "measurement-content";

    const heading = document.createElement("div");
    heading.className = "graph-heading";
    const source = document.createElement("p");
    source.textContent = "Source: " + sourceLabel(series);
    heading.appendChild(source);
    const button = createShowDnvButton(series);
    if (button) {
      heading.appendChild(button);
    }
    body.appendChild(heading);

    const chart = document.createElement("div");
    chart.className = "chart-canvas-wrap";
    chart.innerHTML = "<p class='loading-message'>Open to draw the graph.</p>";
    body.appendChild(chart);

    const path = document.createElement("p");
    path.className = "graph-dnv-path";
    path.textContent = mapped ? series.dnvPath : "DNV path not found";
    body.appendChild(path);
    details.appendChild(body);

    details.addEventListener("toggle", function () {
      if (details.open && !details.dataset.chartDrawn) {
        details.dataset.chartDrawn = "true";
        window.ProjectTimeSeriesCharts.render(chart, series, projectData);
      }
    });
    return details;
  }

  function groupSeries(seriesList) {
    const groups = new Map();
    seriesList.forEach(function (series) {
      if (String(series.name).toLowerCase() === "timestamp" || isCoordinateSeries(series)) {
        return;
      }
      const groupName = series.location || "general";
      const group = groups.get(groupName) || [];
      group.push(series);
      groups.set(groupName, group);
    });
    return groups;
  }

  function renderSummary(container, data) {
    const summary = data.raw.source_metadata && data.raw.source_metadata.general_information || data.summary;
    const box = document.createElement("div");
    box.className = "overview-box project-summary-box";
    const title = document.createElement("h3");
    title.textContent = data.project.name;
    const text = document.createElement("p");
    text.textContent = summary || data.series.length + " JSON information entries are available.";
    box.appendChild(title);
    box.appendChild(text);
    container.appendChild(box);
  }

  function renderGroups(container, data) {
    const groups = groupSeries(data.series);
    Array.from(groups.keys()).sort().forEach(function (groupName) {
      const seriesList = groups.get(groupName);
      const details = document.createElement("details");
      details.className = "vessel-accordion project-group-accordion";

      const summary = document.createElement("summary");
      summary.textContent = readableName(groupName) + " (" + seriesList.length + ")";
      details.appendChild(summary);

      const content = document.createElement("div");
      content.className = "vessel-details project-group-content";
      const list = document.createElement("div");
      list.className = "information-list";
      seriesList.forEach(function (series) {
        list.appendChild(series.timeSeries ?
          createTimeSeriesCard(series, data) : createStaticCard(series));
      });
      content.appendChild(list);
      details.appendChild(content);
      container.appendChild(details);
    });
  }

  async function render(data) {
    const summaryContainer = document.getElementById("project-summary");
    const mapContainer = document.getElementById("project-map");
    const groupsContainer = document.getElementById("project-groups");
    renderSummary(summaryContainer, data);
    await window.ProjectVesselRouteMap.render(mapContainer, data);
    renderGroups(groupsContainer, data);
  }

  return { render: render };
}());
