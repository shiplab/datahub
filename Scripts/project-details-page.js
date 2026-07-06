/*
  This file starts the common details page.
  It reads ?project= from the URL, gets that project from project-config.js,
  loads its JSON, then starts the information display and the DNV tree.

  This file contains no Atlas or Gunnerus path. To add another project, add it
  to project-config.js and open Project_details.html?project=its-id.
*/
(function () {
  const title = document.getElementById("project-title");
  const getJsonButton = document.getElementById("get-json");
  const informationPanel = document.getElementById("project-groups");

  function filenameFromPath(path) {
    return path.split("/").pop() || "project.json";
  }

  async function startPage() {
    const projectId = new URLSearchParams(window.location.search).get("project");
    const project = window.ProjectConfig.getProject(projectId);

    if (!project) {
      title.textContent = "Project not found";
      informationPanel.innerHTML = "<p class='error-message'>The project id is missing or unknown.</p>";
      return;
    }

    title.textContent = project.name;
    document.title = project.name + " - Project details";

    try {
      const data = await window.ProjectJsonLoader.load(project);
      getJsonButton.href = data.jsonUrl;
      getJsonButton.download = filenameFromPath(project.jsonPath);
      getJsonButton.classList.remove("disabled");
      getJsonButton.setAttribute("aria-disabled", "false");

      await Promise.all([
        window.ProjectDnvTree.initialize(data),
        window.ProjectInformationDisplay.render(data)
      ]);
    } catch (error) {
      informationPanel.innerHTML =
        "<p class='error-message'>The project could not be loaded. " + error.message + "</p>";
      document.getElementById("tree-status").textContent = "DNV data could not be loaded.";
    }
  }

  startPage();
}());
