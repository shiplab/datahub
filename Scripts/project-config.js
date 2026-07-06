/*
  This file is the only list of projects used by the website.
  The dashboard and the details page both read this list.

  To add a project:
  1. Put its main JSON inside the project folder.
  2. Add one object below with a unique id, a name and the JSON path.
  3. Put dashboardListId on the empty list in the project's HTML block.
  No other JavaScript file needs a project-specific path.
*/
window.ProjectConfig = {
  projects: [
    {
      id: "atlas",
      name: "ALMI ATLAS",
      dashboardListId: "rina-vessel-links",
      jsonPath: "Projects/RINA Sig. Ships/Vol.2018/ALMI ATLAS/JSON/ALMI_ATLAS.json"
    },
    {
      id: "gunnerus",
      name: "Gunnerus",
      dashboardListId: "gunnerus-vessel-links",
      jsonPath: "Projects/Gunnerus/JSON/GUNNERUS.json"
    }
  ],

  getProject: function (projectId) {
    return this.projects.find(function (project) {
      return project.id === projectId;
    });
  },

  getDetailsUrl: function (projectId) {
    return "Pages/Project_details.html?project=" + encodeURIComponent(projectId);
  }
};
