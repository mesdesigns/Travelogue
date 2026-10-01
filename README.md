# travel-log

# Travel Log

A single-file travel planner and journal. Collect things to do, spread them across your days, stamp what you actually did, and turn each trip into a keepable booklet.

**Live site:** https://YOUR-USERNAME.github.io/travel-log/

No build step, no backend, no account. It's one `index.html` you can open in any modern browser.

## Features

- **Multiple trips**, each with its own colour theme and cover image, plus a countdown to the start date.
- **Activity pool**: a running list of museums, restaurants, walks and anything else you might do, with notes for tickets, opening hours or who recommended it. Places link out to Google Maps.
- **Day-by-day plan**: add items from the pool to specific days and keep a separate to-do list per trip.
- **Stamp what you did**: mark places as visited, log unplanned stops, rate how it went, pick favourites and jot down what you ate or what surprised you.
- **Travel booklet**: when a trip is over, flip through a swipeable summary with the short version, favourites, each day, extra stamped places, notes for next time and what you did before you left.
- **Undo** for accidental edits, and autosave as you go.

## How to use it

1. Open the site and name your first trip (for example *Lisbon*, *Tokyo*, or *the coast*).
2. Add things to your activity pool as you find them.
3. Assign pool items to days once your dates are settled.
4. During the trip, stamp places as you visit them and log anything unplanned.
5. When you're back, conclude the trip and open its booklet.

## Your data stays in your browser

Trips are saved to your browser's `localStorage`. Nothing is sent to a server, which means:

- Your trips are private to the browser and device you used.
- They are **not synced** between devices (phone, laptop and so on).
- Clearing site data for this page, or using a private window, will remove them.

## Run locally

Open `index.html` in your browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Push `index.html` to the `main` branch of your repository.
2. Go to **Settings → Pages**.
3. Set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, then save.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## Tech notes

- Plain HTML, CSS and JavaScript in one file, with no frameworks or dependencies to install.
- Fonts (Fraunces, Nunito and Barlow Condensed) load from Google Fonts. The app still works without them, using fallback fonts.
