# Ship Design, Construction & Operation Data Hub

Open Data Repository for Ship Design, Construction & Operation Files.

An initiative done by NTNU-IV-IHB.

29 Jun 2026

## Contributors

Henrique Gaspar (NTNU)
Jisang Ha (NTNU)
Leyan Touati (ISEN)
Anas Sadik (ISEN)
Louise Hope-Rapp (ENSTA)

## Project logic

- `index.html` is the dashboard.
- `Blocs/` contains the independent HTML cards loaded by the dashboard.
- `Pages/Project_details.html` is the single details page shared by Atlas and Gunnerus.
- `Projects/` stores each project with the same simple structure: `JSON/` for the main structured JSON and `raw_DATA/` for its source files.
- `Data/` contains the local DNV VIS 3-10a hierarchy.
- `Image/` contains dashboard images.
- `Scripts/project-config.js` is the central list of projects and their JSON paths.

The other scripts each have one purpose: loading JSON, displaying information, drawing charts, drawing the vessel route, building the DNV tree, and starting the details page. Their comments explain where to make a future change.

Every source link displayed in the DNV tree comes directly from the `Link` value of the corresponding JSON entry. Links are relative to the main JSON file, normally `../raw_DATA/filename`.

To add a project, create its dashboard block and `Projects/.../JSON` plus `raw_DATA` folders, then add one entry to `Scripts/project-config.js`. The common details page does not need to be copied.
