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

## Open the website

The pages load HTML fragments and JSON files with `fetch`, so the project must be opened through a small local web server.

From the project folder, run:

```text
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Main folders

- `Blocs/`: dashboard project blocks.
- `Pages/`: project detail pages.
- `Image/`: project images.
- `Projects/`: source project files and vessel JSON files.
- `Data/`: the complete local DNV VIS 3-10a hierarchy.
- `Scripts/`: simple JavaScript used by the dashboard and RINA page.
