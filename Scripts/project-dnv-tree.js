/*
  This file builds the filtered DNV tree shown on the right side.
  It keeps only branches used by the current project. Every green project
  value is an ordinary link whose address comes directly from Link in JSON.

  To use a newer DNV release, change DNV_DATA_FILE and the path validation in
  project-json-loader.js. Project values and sources should only be edited in
  the project JSON, not in this file.
*/
window.ProjectDnvTree = (function () {
  const DNV_DATA_FILE = "../Data/dnv-vis-3-10a.json";
  let items = [];
  let itemsByCode = new Map();
  let childrenByCode = new Map();
  let valuesByCode = new Map();
  let visibleCodes = new Set();
  let treeContainer;
  let treeStatus;
  let searchInput;
  let searchResults;

  function getCodes(path) {
    return String(path || "").split("/").filter(function (part) {
      return itemsByCode.has(part);
    });
  }

  function lastCode(path) {
    const codes = getCodes(path);
    return codes[codes.length - 1];
  }

  function sortedChildren(code) {
    return (childrenByCode.get(code) || []).slice().sort(function (first, second) {
      return first.localeCompare(second, undefined, { numeric: true });
    });
  }

  function findPath(startCode, targetCode) {
    const queue = [[startCode]];
    const visited = new Set([startCode]);

    while (queue.length) {
      const path = queue.shift();
      const currentCode = path[path.length - 1];

      if (currentCode === targetCode) {
        return path;
      }

      sortedChildren(currentCode).forEach(function (childCode) {
        if (!visited.has(childCode)) {
          visited.add(childCode);
          queue.push(path.concat(childCode));
        }
      });
    }

    return [];
  }

  function buildProjectMaps(seriesList) {
    valuesByCode = new Map();
    visibleCodes = new Set();

    seriesList.filter(function (series) {
      return window.ProjectJsonLoader.hasDnvPath(series.dnvPath);
    }).forEach(function (series) {
      const code = lastCode(series.dnvPath);

      if (!code) {
        return;
      }

      const values = valuesByCode.get(code) || [];
      values.push(series);
      valuesByCode.set(code, values);

      const path = findPath("VE", code);
      path.forEach(function (pathCode) {
        if (pathCode !== "VE") {
          visibleCodes.add(pathCode);
        }
      });
    });
  }

  function readableName(name) {
    return String(name || "Information").replaceAll("_", " ").replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
  }

  function simpleValue(series) {
    if (!series.hasValue || series.value === "" || series.value === null) {
      return "";
    }

    if (typeof series.value === "object") {
      return JSON.stringify(series.value);
    }

    return String(series.value);
  }

  function sourceFilename(url) {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").pop());
    } catch (error) {
      return "source";
    }
  }

  function createProjectValue(series) {
    const value = series.sourceUrl ? document.createElement("a") : document.createElement("span");
    const fixedValue = simpleValue(series);
    value.className = "tree-vessel-value";
    value.textContent = readableName(series.name) + (fixedValue ? ": " + fixedValue : "");

    if (series.sourceUrl) {
      value.href = series.sourceUrl;
      value.download = sourceFilename(series.sourceUrl);
      value.title = "Open or download " + sourceFilename(series.sourceUrl);
    }

    return value;
  }

  function createNode(code, ancestors) {
    const item = itemsByCode.get(code);
    const node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.code = code;

    if (!item) {
      return node;
    }

    const children = sortedChildren(code).filter(function (childCode) {
      return visibleCodes.has(childCode) && !ancestors.has(childCode);
    });
    const row = document.createElement("div");
    row.className = "tree-row";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    toggle.textContent = children.length ? "-" : "\u2022";

    if (!children.length) {
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

    const projectValues = valuesByCode.get(code) || [];
    if (projectValues.length) {
      row.classList.add("has-vessel-data");
      const values = document.createElement("span");
      values.className = "tree-vessel-values";
      projectValues.forEach(function (series) {
        values.appendChild(createProjectValue(series));
      });
      row.appendChild(values);
    }

    node.appendChild(row);

    if (children.length) {
      const childContainer = document.createElement("div");
      childContainer.className = "tree-children";
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(code);
      children.forEach(function (childCode) {
        childContainer.appendChild(createNode(childCode, nextAncestors));
      });
      node.appendChild(childContainer);

      function toggleChildren() {
        childContainer.hidden = !childContainer.hidden;
        toggle.textContent = childContainer.hidden ? "+" : "-";
      }

      toggle.addEventListener("click", toggleChildren);
      name.addEventListener("click", toggleChildren);
      name.style.cursor = "pointer";
    }

    return node;
  }

  function renderTree() {
    treeContainer.innerHTML = "";
    const rootCodes = sortedChildren("VE").filter(function (code) {
      return visibleCodes.has(code);
    });

    rootCodes.forEach(function (code) {
      treeContainer.appendChild(createNode(code, new Set(["VE"])));
    });

    if (!rootCodes.length) {
      treeContainer.innerHTML = "<p class='loading-message'>No valid DNV path was found.</p>";
    }
  }

  function findRenderedNode(code) {
    return Array.from(treeContainer.querySelectorAll(".tree-node")).find(function (node) {
      return node.dataset.code === code;
    });
  }

  function showPath(dnvPath) {
    const code = lastCode(dnvPath);
    const node = findRenderedNode(code);

    if (!node) {
      return;
    }

    let parent = node.parentElement;
    while (parent && parent !== treeContainer) {
      if (parent.classList.contains("tree-children")) {
        parent.hidden = false;
        const parentNode = parent.parentElement;
        const toggle = parentNode.querySelector(":scope > .tree-row > .tree-toggle");
        if (toggle) {
          toggle.textContent = "-";
        }
      }
      parent = parent.parentElement;
    }

    treeContainer.querySelectorAll(".tree-focus").forEach(function (focusedNode) {
      focusedNode.classList.remove("tree-focus");
    });
    node.classList.add("tree-focus");
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function search(query) {
    const wanted = query.trim().toLowerCase();
    searchResults.innerHTML = "";

    if (wanted.length < 2) {
      return;
    }

    const matches = items.filter(function (item) {
      const text = [item.code, item.commonName, item.name].filter(Boolean).join(" ").toLowerCase();
      return visibleCodes.has(item.code) && text.includes(wanted);
    }).slice(0, 40);

    matches.forEach(function (item) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.innerHTML = "<span class='search-result-code'></span><span></span>";
      button.children[0].textContent = item.code;
      button.children[1].textContent = item.commonName || item.name || item.code;
      button.addEventListener("click", function () {
        searchInput.value = item.code + " " + (item.commonName || item.name || "");
        searchResults.innerHTML = "";
        showPath("/" + item.code);
      });
      searchResults.appendChild(button);
    });
  }

  async function initialize(data) {
    treeContainer = document.getElementById("dnv-tree");
    treeStatus = document.getElementById("tree-status");
    searchInput = document.getElementById("tree-search");
    searchResults = document.getElementById("tree-search-results");

    const response = await fetch(DNV_DATA_FILE);
    if (!response.ok) {
      throw new Error("DNV hierarchy not found");
    }

    const dnvData = await response.json();
    items = dnvData.items || [];
    itemsByCode = new Map();
    childrenByCode = new Map();
    items.forEach(function (item) { itemsByCode.set(item.code, item); });
    (dnvData.relations || []).forEach(function (relation) {
      const children = childrenByCode.get(relation[0]) || [];
      if (!children.includes(relation[1])) {
        children.push(relation[1]);
        childrenByCode.set(relation[0], children);
      }
    });

    buildProjectMaps(data.series);
    renderTree();
    const mappedCount = data.series.filter(function (series) {
      return window.ProjectJsonLoader.hasDnvPath(series.dnvPath);
    }).length;
    treeStatus.textContent = mappedCount + " mapped values from " + data.project.name + ".";
    searchInput.addEventListener("input", function () { search(searchInput.value); });
  }

  return {
    initialize: initialize,
    showPath: showPath
  };
}());
