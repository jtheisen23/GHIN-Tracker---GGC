# GHIN Tracker for GGC

Static browser dashboard for GHIN login, score history, handicap trend viewing, and club member lookup.

## What it does

- signs in with your GHIN login from the browser
- requests your recent scores from GHIN-style endpoints
- shows an estimated handicap trend line from returned differentials
- shows golfers available through your GHIN-accessible lookup results

## Important warning

This project uses unofficial GHIN app-style API endpoints from browser code.

That means:

- this is not an official GHIN or USGA integration
- GHIN can change or block these endpoints at any time
- your GHIN login flow is happening in the browser
- this is simpler to host on GitHub Pages, but less secure and less reliable than a server-backed app

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
- club lookup visibility depends on what GHIN allows your account to access
