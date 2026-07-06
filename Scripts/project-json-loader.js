/*
  This file loads and normalizes one project's main JSON.
  Atlas contains mostly fixed values and Gunnerus contains time series, but
  both are converted to the same simple JavaScript structure here.

  To support another JSON field name, change only normalizeSeries().
  Links are resolved relative to the JSON file, so every Link in the JSON can
  stay short, for example: ../raw_DATA/source.pdf
*/
window.ProjectJsonLoader = (function () {
  function hasDnvPath(path) {
    return String(path || "").startsWith("/dnv-v2/vis-3-10a/");
  }

  function normalizeSeries(entry, index, jsonUrl) {
    const link = String(entry.Link || "").trim();
    const hasValue = Object.prototype.hasOwnProperty.call(entry, "Value");

    return {
      index: index,
      name: entry.Name || entry.name || "Information " + (index + 1),
      location: entry.location || "general",
      dnvPath: entry.DNV_path || entry.DNV_source || "",
      link: link,
      sourceUrl: link ? new URL(link, jsonUrl).href : "",
      value: hasValue ? entry.Value : undefined,
      hasValue: hasValue,
      sourceContext: entry.source_context || "",
      timeSeries: entry.time_serie_data || null,
      original: entry
    };
  }

  async function load(project) {
    const jsonUrl = new URL("../" + project.jsonPath, window.location.href);
    const response = await fetch(jsonUrl);

    if (!response.ok) {
      throw new Error("Project JSON not found: " + project.jsonPath);
    }

    const raw = await response.json();
    const series = (raw.series || []).map(function (entry, index) {
      return normalizeSeries(entry, index, jsonUrl);
    });

    return {
      project: project,
      raw: raw,
      jsonUrl: jsonUrl.href,
      series: series,
      timeAxes: raw.time_axes || {},
      summary: raw.source_metadata && raw.source_metadata.summary || ""
    };
  }

  function getTimeAxis(data, axisName) {
    const axis = data.timeAxes[axisName];

    if (Array.isArray(axis)) {
      return axis;
    }

    if (axis && Array.isArray(axis.values)) {
      return axis.values;
    }

    return [];
  }

  return {
    load: load,
    hasDnvPath: hasDnvPath,
    getTimeAxis: getTimeAxis
  };
}());
