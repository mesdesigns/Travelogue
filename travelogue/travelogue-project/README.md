# Travel Log

Plan trips, stamp what you actually do, and keep each trip as a little booklet. Works offline and can be installed on your phone's home screen.

## Put it on GitHub Pages

1. Upload **everything inside `dist/`** to your repository (keep the `icons` folder and the `.nojekyll` file).
2. In the repository settings, turn on GitHub Pages for that branch and folder.
3. Open the page once with internet. After that it works offline.

When you change the app, run the build again and upload the new `dist/` files. Open apps show an "A new version is ready" message with a Reload button.

## Install it on a phone

- **Android (Chrome):** open the page, then use the menu (⋮) → **Add to Home screen** or **Install app**.
- **iPhone (Safari):** open the page, tap **Share** → **Add to Home Screen**.

## Travel together (two phones, no account)

Two people can plan the same trips on their own phones. There is no server: you swap a file in any chat.

1. **Settings → Send your changes.** Add your name once, then tap **Share the file** and pick Messages, WhatsApp, AirDrop or email. (On a computer, or where sharing isn't available, the file is saved instead.)
2. The other person saves the file, then opens **Settings → Get their changes** and chooses it. On Android, with the app installed, they can also share the file from the chat straight to Travel Log.
3. They see what will change, tap **Bring in**, and the app offers to **send theirs back** if they have changes you don't.

How changes are combined:

- Each detail is tracked on its own (a place's note, its day, its stamp, a sticker's position, a wrap-up answer…), so you can both edit the same trip, even the same place, and keep both edits.
- If you both changed the *same* detail, the newer change is kept.
- Deletes reach the other phone. If one of you edited something after the other deleted it, it's kept rather than lost.
- Bringing in changes can be undone straight after. **Delete all data** and **Replace everything** only affect this phone; they are never sent as deletions.
- The home screen reminds you when you have changes you haven't sent yet.

Files you export as a backup carry the same information, so importing a backup with **Combine with mine** merges it the same way.

## Your data

Everything is saved in the browser on that device (trips in local storage, sticker photos in IndexedDB). Nothing is sent anywhere.

- **Settings → Export** saves one file with all trips, booklets and sticker photos.
- **Settings → Import** loads that file on another phone or browser. You see what's in it first, and can either combine it with your trips or replace everything (replacing asks first and can be undone).
- If the saved data is ever damaged, the app restores the previous copy automatically.

Older versions of this app saved data in other formats; they're converted automatically on first load.

## Project layout

```
src/index.template.html   page structure
src/styles.css            all styles (trip colours are applied at runtime)
src/app.1-core.js         helpers, theming, data model and migrations, storage, undo, actions
src/app.1b-sync.js        travelling together: change tracking, merging, sending and receiving files
src/app.2-screens.js      navigation and swipe pager, screens, booklet viewer and stickers
src/app.3-ui.js           sheets, drag and drop, gestures, import/export, keyboard handling, startup
public/                   manifest, service worker template, icons
build.py                  builds dist/
tests/test_app.py         end-to-end tests (also runs test_merge.js)
tests/test_merge.js       merge rules and randomised two-phone convergence checks (Node)
```

## Build and test

Requirements: Python 3, Node.js (used only for a syntax check), and Playwright for Python with Chromium (`pip install playwright && playwright install chromium`).

```
python3 build.py              # writes dist/index.html, dist/sw.js, manifest and icons
python3 tests/test_app.py     # runs every test against dist/ over a local web server
python3 tests/test_app.py swipe booklet   # runs only tests whose names contain these words
node tests/test_merge.js      # just the merge checks, in about a second
```

`dist/artifact.html` is the same app without the install and offline files, for hosting it as a single page.

## Notes

- The tests simulate on-screen keyboards (Android resizing and iPhone visual viewport). Real devices are still worth a quick check after changes.
- Fonts come from Google Fonts and are cached for offline use after the first online visit.
