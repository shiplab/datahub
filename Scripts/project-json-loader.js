/*
  This file loads and normalizes one project's main JSON.
  Atlas contains mostly fixed values and Gunnerus contains time series, but
  both are converted to the same simple JavaScript structure here.

  To support another JSON field name, change only normalizeSeries().
  Links are resolved relative to the JSON file, so every Link in the JSON can
  stay short. Several sources can be separated with a semicolon:
  ../raw_DATA/source.pdf; ../raw_DATA/measurements.csv

  If the same information appears several times with different links, this
  loader merges it into one entry and keeps all source links together. This
  lets the website show one information block and one DNV value only.

  Supported top-level project structures:
  - { "series": [...] }
  - { "summary": "...", "vessel_info": [...] }
*/
window.ProjectJsonLoader = (function () {
  function hasDnvPath(path) {
    return String(path || "").startsWith("/dnv-v2/vis-3-10a/");
  }

  function parseLinks(linkValue, jsonUrl) {
    const values = Array.isArray(linkValue) ? linkValue : String(linkValue || "").split(/[;\n]+/);
    const uniqueLinks = [];

    values.forEach(function (value) {
      const link = String(value || "").trim();

      if (link && !uniqueLinks.includes(link)) {
        uniqueLinks.push(link);
      }
    });

    return uniqueLinks.map(function (link) {
      return {
        link: link,
        url: new URL(link, jsonUrl).href
      };
    });
  }

  function normalizeSeries(entry, index, jsonUrl) {
    const sources = parseLinks(entry.Link, jsonUrl);
    const hasValue = Object.prototype.hasOwnProperty.call(entry, "Value");

    return {
      index: index,
      name: entry.Name || entry.name || "Information " + (index + 1),
      location: entry.location || "general",
      dnvPath: entry.DNV_path || entry.DNV_source || "",
      link: sources.map(function (source) { return source.link; }).join("; "),
      sources: sources,
      sourceUrl: sources.length ? sources[0].url : "",
      value: hasValue ? entry.Value : undefined,
      hasValue: hasValue,
      sourceContext: entry.source_context || "",
      timeSeries: entry.time_serie_data || null,
      original: entry
    };
  }

  function valueKey(series) {
    if (!series.hasValue) {
      return "__no_value__";
    }

    if (typeof series.value === "object") {
      return JSON.stringify(series.value);
    }

    return String(series.value);
  }

  function seriesKey(series) {
    return [
      series.name,
      series.location,
      series.dnvPath,
      valueKey(series)
    ].join("||");
  }

  function mergeSources(firstSources, secondSources) {
    const merged = [];

    firstSources.concat(secondSources).forEach(function (source) {
      if (!merged.some(function (existingSource) { return existingSource.link === source.link; })) {
        merged.push(source);
      }
    });

    return merged;
  }

  function mergeSeriesList(seriesList) {
    const mergedSeries = [];
    const seriesByKey = new Map();

    seriesList.forEach(function (series) {
      const key = seriesKey(series);
      const existingSeries = seriesByKey.get(key);

      if (!existingSeries) {
        const mergedEntry = Object.assign({}, series, {
          sources: series.sources.slice(),
          mergedCount: 1
        });
        mergedSeries.push(mergedEntry);
        seriesByKey.set(key, mergedEntry);
        return;
      }

      existingSeries.sources = mergeSources(existingSeries.sources, series.sources);
      existingSeries.link = existingSeries.sources.map(function (source) {
        return source.link;
      }).join("; ");
      existingSeries.sourceUrl = existingSeries.sources.length ? existingSeries.sources[0].url : "";
      existingSeries.mergedCount += 1;

      if (!existingSeries.sourceContext && series.sourceContext) {
        existingSeries.sourceContext = series.sourceContext;
      }

      if (!existingSeries.timeSeries && series.timeSeries) {
        existingSeries.timeSeries = series.timeSeries;
      }
    });

    return mergedSeries;
  }

  function readProjectEntries(raw) {
    if (Array.isArray(raw.vessel_info)) {
      return raw.vessel_info;
    }

    if (Array.isArray(raw.series)) {
      return raw.series;
    }

    return [];
  }

  function readProjectSummary(raw) {
    return raw.summary ||
      raw.source_metadata && raw.source_metadata.general_information ||
      raw.source_metadata && raw.source_metadata.summary ||
      "";
  }

  async function load(project) {
    const jsonUrl = new URL("../" + project.jsonPath, window.location.href);
    const response = await fetch(jsonUrl);

    if (!response.ok) {
      throw new Error("Project JSON not found: " + project.jsonPath);
    }

    const raw = await response.json();
    const normalizedSeries = readProjectEntries(raw).map(function (entry, index) {
      return normalizeSeries(entry, index, jsonUrl);
    });
    const series = mergeSeriesList(normalizedSeries);

    return {
      project: project,
      raw: raw,
      jsonUrl: jsonUrl.href,
      series: series,
      timeAxes: raw.time_axes || {},
      summary: readProjectSummary(raw)
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
    getTimeAxis: getTimeAxis,
    parseLinks: parseLinks
  };
}());
