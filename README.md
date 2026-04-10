# GHIN Tracker for GGC

Browser-based GHIN dashboard for your own login, scores, trends, and golfer comparison.

It now supports an optional backend for golfer lookup so search and last-round retrieval can move off GitHub Pages and into a server you control.

## What it does

- signs in with your GHIN login from the browser
- requests your recent scores from GHIN-style endpoints
- shows an estimated handicap trend line from returned differentials
- lets you search other golfers and save them to a comparison table

## Important warning

This project uses unofficial GHIN app-style API endpoints from the browser, and an optional lightweight backend for lookup requests.

That means:

- this is not an official GHIN or USGA integration
- GHIN can change or block these endpoints at any time
- your GHIN login flow is happening in the browser
- some GHIN lookup endpoints may work differently than they do in the official GHIN app or website

## Known endpoint pattern used here

- login: `https://api2.ghin.com/api/v1/golfer_login.json`
- data: `https://api.ghin.com/api/v1/...`

## Frontend only

You can open `index.html` directly or run:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://127.0.0.1:8080
```

## Using golfer search without a backend

1. Log in to the site with your GHIN credentials.
2. In `Search golfers to compare`, search by exact GHIN number or last name.
3. Add golfers to the comparison table.

Best current results:

- exact GHIN number search works best
- last-name search is still experimental and may fail depending on GHIN session behavior

## Optional lookup backend

The lookup backend is meant for:

- last-name search
- club directory lookup
- other golfers' last-round retrieval

Files:

- frontend config: `config.js`
- backend service: `backend/server.py`

### Backend API

The backend exposes:

- `POST /api/ghin/login`
- `POST /api/ghin/search-golfers`
- `GET /health`

### Run the backend locally

```bash
cd backend
python3 server.py
```

By default it listens on:

```text
http://127.0.0.1:8787
```

### Important deployment note

If your frontend stays on GitHub Pages at `https://...`, the browser cannot call a local `http://127.0.0.1` backend because of mixed-content restrictions.

So for real GitHub Pages use, deploy `backend/server.py` to an HTTPS host such as Render, Railway, Fly.io, or another small Python host.

This repo now includes a starter [render.yaml](/Users/jeremytheisen/Documents/GGC Handicap tracker/render.yaml) for Render.

Then set your backend URL in `config.js`:

```js
window.GHIN_TRACKER_CONFIG = {
  backendBaseUrl: "https://your-backend-host.example.com",
};
```

After that, the frontend will automatically:

1. log into GHIN in the browser for your own score dashboard
2. log into the backend for golfer lookup
3. use the backend for search and last-round retrieval when available

## Deploy to GitHub Pages

1. Push `index.html`, `styles.css`, `config.js`, and `app.js` to your repo.
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
