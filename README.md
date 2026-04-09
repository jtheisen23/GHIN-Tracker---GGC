# GGC Handicap Tracker

Static golf tracker built for GitHub Pages. It lets you:

- track players and rounds
- estimate handicap index from recent score differentials
- calculate course handicap from your home course setup
- visualize score, differential, and index trends
- export and import data as JSON
- bulk import pasted round history from GHIN-style text or spreadsheet rows

## Important note

This project does **not** connect directly to the GHIN app or GHIN services. It uses a GHIN-style handicap differential approach for personal tracking. If you want official GHIN data sync later, we would need an approved API or a manual import workflow from data you export yourself.

## Bulk import from GHIN or a spreadsheet

You can now paste multiple rounds at once into the site.

Accepted examples:

```text
2026-04-01, 84
2026-04-08, 82, 71.8, 131, 72, 0, windy day
04/15/2026, 86, 71.8, 131, 72
```

Format:

- column 1: date
- column 2: score
- column 3: course rating, optional
- column 4: slope rating, optional
- column 5: par, optional
- column 6: PCC, optional
- column 7+: notes, optional

Commas, tabs, and `|` separators all work.

## Run locally

Because this is a plain static site, you can open `index.html` directly in a browser or serve it locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Push these files to the default branch.
3. In GitHub, open `Settings` > `Pages`.
4. Set the source to `Deploy from a branch`.
5. Choose your branch and the `/ (root)` folder.
6. Save, then wait for the Pages URL to be published.

## Next good upgrades

- manual hole-by-hole entry and ESC/net double bogey adjustment
- player edit/delete controls
- multi-course support with saved tee sets
- CSV import if you export score history from another system
- skins, points, or league standings views
