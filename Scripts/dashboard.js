async function loadProjectBlocks() {
  const container = document.getElementById("project-blocks");
  const blockFiles = [
    "Blocs/Rina_blocs.html",
    "Blocs/Gunnerus_blocs.html",
    "Blocs/test_bloc.html"
  ];

  container.innerHTML = "";

  for (const file of blockFiles) {
    const response = await fetch(file);
    const html = await response.text();
    container.insertAdjacentHTML("beforeend", html);
  }

  const response = await fetch("files.json");
  const filesData = await response.json();
  addRinaVesselLinks(getRinaVessels(filesData));
  addGunnerusLinks(getGunnerusSections(filesData));
}

function getRinaVessels(filesData) {
  const rinaProject = (filesData.children || []).find(function (project) {
    return project.name === "RINA Sig. Ships";
  });

  const volume = (rinaProject && rinaProject.children || []).find(function (folder) {
    return folder.name === "Vol.2018";
  });

  return (volume && volume.children || []).filter(function (file) {
    return file.type === "file" && file.name.endsWith(".json");
  }).map(function (file) {
    return file.name.slice(0, -5);
  });
}

function addRinaVesselLinks(vessels) {
  const list = document.getElementById("rina-vessel-links");

  vessels.forEach(function (vesselName) {
    const link = document.createElement("a");
    link.href = "Pages/Rina_pages.html?vessel=" + encodeURIComponent(vesselName);
    link.textContent = vesselName;
    list.appendChild(link);
  });
}

function getGunnerusSections(filesData) {
  const gunnerusProject = (filesData.children || []).find(function (project) {
    return project.name === "Gunnerus";
  });
  const wantedSections = ["crane", "engine", "ship", "wind"];

  return (gunnerusProject && gunnerusProject.children || []).filter(function (file) {
    return file.type === "file" && wantedSections.includes(file.name.toLowerCase().replace(".json", ""));
  }).map(function (file) {
    return file.name.slice(0, -5).toLowerCase();
  }).sort(function (first, second) {
    return wantedSections.indexOf(first) - wantedSections.indexOf(second);
  });
}

function addGunnerusLinks(sections) {
  const list = document.getElementById("gunnerus-vessel-links");

  sections.forEach(function (sectionName) {
    const link = document.createElement("a");
    link.href = "Pages/Gunnerus_pages.html?section=" + encodeURIComponent(sectionName);
    link.textContent = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
    list.appendChild(link);
  });
}

loadProjectBlocks().catch(function () {
  document.getElementById("project-blocks").innerHTML =
    "<p class='error-message'>The project blocks could not be loaded. Open the website through a local web server.</p>";
});
