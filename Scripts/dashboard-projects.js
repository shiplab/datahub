/*
  This file builds the dashboard.
  It first loads the small HTML blocks, then adds the project links from
  project-config.js. This keeps project data out of index.html.

  To add a dashboard block, add its HTML filename to BLOCK_FILES.
  To add a link inside a block, add the project to project-config.js and use
  the same dashboardListId in the block.
*/
(function () {
  const BLOCK_FILES = [
    "Blocs/Rina_blocs.html",
    "Blocs/Gunnerus_blocs.html",
    "Blocs/test_bloc.html"
  ];

  const blocksContainer = document.getElementById("project-blocks");

  async function loadBlock(filename) {
    const response = await fetch(filename);

    if (!response.ok) {
      throw new Error("Block not found: " + filename);
    }

    return response.text();
  }

  function addProjectLinks() {
    window.ProjectConfig.projects.forEach(function (project) {
      const list = document.getElementById(project.dashboardListId);

      if (!list) {
        return;
      }

      const link = document.createElement("a");
      link.href = window.ProjectConfig.getDetailsUrl(project.id);
      link.textContent = project.name;
      list.appendChild(link);
    });
  }

  async function startDashboard() {
    try {
      const blocks = await Promise.all(BLOCK_FILES.map(loadBlock));
      blocksContainer.innerHTML = blocks.join("");
      addProjectLinks();
    } catch (error) {
      blocksContainer.innerHTML =
        "<p class='error-message'>The project blocks could not be loaded.</p>";
    }
  }

  startDashboard();
}());
