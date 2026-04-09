# GHIN Tracker for GGC

Browser-based GHIN dashboard for your own login, scores, trends, and golfer comparison.

## What it does

- signs in with your GHIN login from the browser
- requests your recent scores from GHIN-style endpoints
- shows an estimated handicap trend line from returned differentials
- lets you search other golfers and save them to a comparison table

## Important warning

This project uses unofficial GHIN app-style API endpoints from the browser.

That means:

- this is not an official GHIN or USGA integration
- GHIN can change or block these endpoints at any time
- your GHIN login flow is happening in the browser
- some GHIN lookup endpoints may work differently than they do in the official GHIN app

## Known endpoint pattern used here

- login: `https://api2.ghin.com/api/v1/golfer_login.json`
- data: `https://api.ghin.com/api/v1/...`

## Run locally

You can open `index.html` directly or run:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://127.0.0.1:8080
```

## Using golfer search

1. Log in to the site with your GHIN credentials.
2. In `Search golfers to compare`, search by exact GHIN number or last name.
3. Add golfers to the comparison table.

Best current results:

- exact GHIN number search works best
- last-name search is still experimental and may fail depending on GHIN session behavior

## Deploy to GitHub Pages

1. Push `index.html`, `styles.css`, and `app.js` to your repo.
2. Open the repository `Settings`.
3. Open `Pages`.
4. Choose `Deploy from a branch`.
5. Select `main` and `/ (root)`.
6. Save.

## Residual risks

- browser CORS restrictions may block some GHIN requests
- GHIN may rotate or invalidate tokens frequently
- the returned JSON shape may change without notice
- golfer search still depends on what GHIN allows for the browser session token
