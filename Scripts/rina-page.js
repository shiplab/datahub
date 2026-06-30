const VESSEL_FOLDER = "../Projects/RINA Sig. Ships/Vol.2018/";
const DNV_DATA_FILE = "../Data/dnv-vis-3-10a.json";

let selectedVessel = "";
let selectedVesselData = null;
let rinaVessels = [];
let dnvItems = [];
let dnvItemsByCode = new Map();
let dnvChildrenByCode = new Map();
let vesselValuesByCode = new Map();
let vesselCache = new Map();
let renderedRowsByCode = new Map();
let pathCache = new Map();

const accordionsContainer = document.getElementById("vessel-accordions");
const downloadButton = document.getElementById("download-json");
const treeContainer = document.getElementById("dnv-tree");
const treeStatus = document.getElementById("tree-status");
const treeSearch = document.getElementById("tree-search");
const treeSearchResults = document.getElementById("tree-search-results");

function createVesselAccordions() {
  rinaVessels.forEach(function (vesselName) {
    const details = document.createElement("details");
    details.className = "vessel-accordion";
    details.dataset.vessel = vesselName;

    const summary = document.createElement("summary");
    summary.textContent = vesselName;

    const content = document.createElement("div");
    content.className = "vessel-details";
    content.innerHTML = "<p class='loading-message'>Open this vessel to load its information.</p>";

    details.appendChild(summary);
    details.appendChild(content);
    accordionsContainer.appendChild(details);

    details.addEventListener("toggle", function () {
      if (details.open) {
        closeOtherAccordions(details);
        selectVessel(vesselName, content);
      } else {
        window.setTimeout(function () {
          if (!accordionsContainer.querySelector("details[open]")) {
            clearSelectedVessel();
          }
        }, 0);
      }
    });
  });
}

async function loadRinaVessels() {
  try {
    const response = await fetch("../files.json");
    const filesData = await response.json();
    const rinaProject = (filesData.children || []).find(function (project) {
      return project.name === "RINA Sig. Ships";
    });
    const volume = (rinaProject && rinaProject.children || []).find(function (folder) {
      return folder.name === "Vol.2018";
    });

    rinaVessels = (volume && volume.children || []).filter(function (file) {
      return file.type === "file" && file.name.endsWith(".json");
    }).map(function (file) {
      return file.name.slice(0, -5);
    });

    createVesselAccordions();
    openVesselFromUrl();
  } catch (error) {
    accordionsContainer.innerHTML =
      "<p class='error-message'>The vessel list could not be loaded from files.json.</p>";
  }
}

function closeOtherAccordions(openDetails) {
  accordionsContainer.querySelectorAll("details[open]").forEach(function (details) {
    if (details !== openDetails) {
      details.open = false;
    }
  });
}

async function selectVessel(vesselName, content) {
  selectedVessel = vesselName;
  enableDownload(vesselName);
  content.innerHTML = "<p class='loading-message'>Loading vessel information...</p>";

  try {
    let data = vesselCache.get(vesselName);

    if (!data) {
      const fileUrl = VESSEL_FOLDER + encodeURIComponent(vesselName) + ".json";
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error("JSON file not found");
      }

      data = await response.json();
      vesselCache.set(vesselName, data);
    }

    if (selectedVessel !== vesselName) {
      return;
    }

    selectedVesselData = data;
    vesselValuesByCode = buildVesselValuesMap(data);
    renderVesselInformation(content, data);
    updateRenderedTreeValues();
    updateTreeStatus(data);
  } catch (error) {
    content.innerHTML = "<p class='error-message'>This vessel JSON could not be loaded.</p>";
  }
}

function clearSelectedVessel() {
  selectedVessel = "";
  selectedVesselData = null;
  vesselValuesByCode = new Map();
  disableDownload();
  updateRenderedTreeValues();

  if (dnvItems.length) {
    treeStatus.textContent = dnvItems.length + " DNV nodes loaded. Select a vessel to display its mapped values.";
  }
}

function enableDownload(vesselName) {
  downloadButton.href = VESSEL_FOLDER + encodeURIComponent(vesselName) + ".json";
  downloadButton.download = vesselName + ".json";
  downloadButton.classList.remove("disabled");
  downloadButton.setAttribute("aria-disabled", "false");
}

function disableDownload() {
  downloadButton.removeAttribute("href");
  downloadButton.removeAttribute("download");
  downloadButton.classList.add("disabled");
  downloadButton.setAttribute("aria-disabled", "true");
}

function extractInformation(data) {
  const records = [];

  (data.value_groups || []).forEach(function (group) {
    (group.items || []).forEach(function (item) {
      records.push({
        group: group.display_name || group.group_name || "Information",
        name: item.display_name || item.attribute_name || "Value",
        value: item.value_text,
        dnvSource: item.DNV_source || "DNV not found yet",
        sourcePage: group.source_page || item.source_page,
        dataKind: item.data_kind || group.data_kind
      });
    });
  });

  ["tanks", "components"].forEach(function (sectionName) {
    (data[sectionName] || []).forEach(function (group) {
      (group.items || []).forEach(function (item) {
        records.push({
          group: group.display_name || group.name || sectionName,
          name: item.display_name || item.attribute_name || "Value",
          value: item.value_text,
          dnvSource: item.DNV_source || "DNV not found yet",
          sourcePage: item.source_page || group.source_page,
          dataKind: item.data_kind || group.data_kind
        });
      });
    });
  });

  return records;
}

function getDnvCodes(dnvSource) {
  if (!dnvSource || dnvSource.toLowerCase().includes("not found")) {
    return [];
  }

  const versionPart = "/vis-3-10a";
  const versionPosition = dnvSource.toLowerCase().indexOf(versionPart);
  let path = dnvSource;

  if (versionPosition >= 0) {
    path = dnvSource.slice(versionPosition + versionPart.length);
  }

  return path.split("/").filter(function (code) {
    return code.trim() !== "";
  });
}

function isMappedRecord(record) {
  return getDnvCodes(record.dnvSource).length > 0;
}

function buildVesselValuesMap(data) {
  const valueMap = new Map();

  extractInformation(data).forEach(function (record) {
    const codes = getDnvCodes(record.dnvSource);

    if (!codes.length) {
      return;
    }

    const code = codes[codes.length - 1];
    const values = valueMap.get(code) || [];
    values.push(record);
    valueMap.set(code, values);
  });

  return valueMap;
}

function renderVesselInformation(container, data) {
  container.innerHTML = "";

  if (data.summary || data.general_information) {
    const overview = document.createElement("div");
    overview.className = "overview-box";

    if (data.summary) {
      appendTextLine(overview, "Summary", data.summary);
    }

    if (data.general_information) {
      appendTextLine(overview, "General information", data.general_information);
    }

    container.appendChild(overview);
  }

  appendSectionTitle(container, "Document");
  container.appendChild(createKeyValueGrid(data.document || {}));

  const information = extractInformation(data);
  const mapped = information.filter(isMappedRecord).sort(compareDnvRecords);
  const unmapped = information.filter(function (record) {
    return !isMappedRecord(record);
  });

  appendSectionTitle(container, "Mapped DNV information (" + mapped.length + ")");
  container.appendChild(createInformationList(mapped, true));

  appendSectionTitle(container, "DNV not found (" + unmapped.length + ")");
  container.appendChild(createInformationList(unmapped, false));

  appendSectionTitle(container, "Additional JSON information");
  const additional = document.createElement("div");
  additional.className = "data-section";

  appendAdditionalValue(additional, "AI status", data.ai_status);
  appendAdditionalValue(additional, "Warnings", data.warnings);
  appendAdditionalValue(additional, "Missing information", data.missing_information);
  appendAdditionalValue(additional, "Detected vessels", data.detected_vessels);
  appendAdditionalValue(additional, "Taxonomy extension requests", data.taxonomy_extension_requests);
  appendAdditionalValue(additional, "DNV GMOD reference", data.dnv_gmod_reference);
  container.appendChild(additional);
}

function appendTextLine(container, title, value) {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = title + ": ";
  line.appendChild(strong);
  line.appendChild(document.createTextNode(value));
  container.appendChild(line);
}

function appendSectionTitle(container, title) {
  const heading = document.createElement("h3");
  heading.textContent = title;
  container.appendChild(heading);
}

function createKeyValueGrid(object) {
  const grid = document.createElement("div");
  grid.className = "data-section key-value-grid";

  Object.keys(object).forEach(function (key) {
    const keyElement = document.createElement("div");
    keyElement.className = "key-name";
    keyElement.textContent = readableName(key);

    const valueElement = document.createElement("div");
    valueElement.className = "key-value";
    valueElement.textContent = simpleText(object[key]);

    grid.appendChild(keyElement);
    grid.appendChild(valueElement);
  });

  return grid;
}

function createInformationList(records, mapped) {
  const list = document.createElement("div");
  list.className = "information-list";

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "loading-message";
    empty.textContent = "No information in this section.";
    list.appendChild(empty);
    return list;
  }

  records.forEach(function (record) {
    const card = document.createElement("div");
    card.className = "information-card " + (mapped ? "mapped" : "unmapped");

    const title = document.createElement("div");
    title.className = "information-card-title";
    title.textContent = record.group + " — " + record.name;

    const value = document.createElement("div");
    value.className = "information-card-value";
    value.textContent = simpleText(record.value);

    const path = document.createElement("div");
    path.className = "information-card-path";
    path.textContent = record.dnvSource;

    card.appendChild(title);
    card.appendChild(value);
    card.appendChild(path);
    list.appendChild(card);
  });

  return list;
}

function appendAdditionalValue(container, title, value) {
  const hasValue = value !== undefined && value !== null &&
    (!Array.isArray(value) || value.length > 0) &&
    (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0);

  if (!hasValue) {
    return;
  }

  const heading = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = title + ":";
  heading.appendChild(strong);
  container.appendChild(heading);
  container.appendChild(createSimpleValue(value));
}

function createSimpleValue(value) {
  if (Array.isArray(value)) {
    const list = document.createElement("ul");
    list.className = "raw-data-list";
    value.forEach(function (item) {
      const listItem = document.createElement("li");
      listItem.appendChild(createSimpleValue(item));
      list.appendChild(listItem);
    });
    return list;
  }

  if (value && typeof value === "object") {
    return createKeyValueGrid(value);
  }

  const text = document.createElement("span");
  text.textContent = simpleText(value);
  return text;
}

function simpleText(value) {
  if (value === null || value === undefined || value === "") {
    return "Not specified";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function readableName(name) {
  return name.replaceAll("_", " ").replace(/\b\w/g, function (letter) {
    return letter.toUpperCase();
  });
}

function compareDnvRecords(first, second) {
  return first.dnvSource.localeCompare(second.dnvSource, undefined, { numeric: true });
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

    if (selectedVesselData) {
      updateTreeStatus(selectedVesselData);
    } else {
      treeStatus.textContent = dnvItems.length + " DNV nodes loaded. Select a vessel to display its mapped values.";
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
  toggle.textContent = availableChildren.length ? "▶" : "•";

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
  toggle.textContent = shouldOpen ? "▼" : "▶";
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
  const records = vesselValuesByCode.get(code) || [];

  if (!records.length) {
    return;
  }

  row.classList.add("has-vessel-data");
  const values = document.createElement("span");
  values.className = "tree-vessel-values";

  records.forEach(function (record) {
    const value = document.createElement("span");
    value.className = "tree-vessel-value";
    value.textContent = record.name + ": " + simpleText(record.value);
    values.appendChild(value);
  });

  row.appendChild(values);
}

function updateTreeStatus(data) {
  const information = extractInformation(data);
  const mappedCount = information.filter(isMappedRecord).length;
  const unmappedCount = information.length - mappedCount;
  treeStatus.textContent = selectedVessel + ": " + mappedCount + " mapped values and " + unmappedCount + " values without a DNV path.";
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
    const message = document.createElement("p");
    message.className = "loading-message";
    message.textContent = "No DNV node found.";
    treeSearchResults.appendChild(message);
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

function openVesselFromUrl() {
  const vesselName = new URLSearchParams(window.location.search).get("vessel");

  if (!vesselName || !rinaVessels.includes(vesselName)) {
    return;
  }

  const details = Array.from(accordionsContainer.querySelectorAll("details")).find(function (item) {
    return item.dataset.vessel === vesselName;
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

loadRinaVessels();
loadDnvTree();
