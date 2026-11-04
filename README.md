# Unreel

A free, open source Chrome extension that hides YouTube Shorts, Instagram Reels and endless feeds, all day or during hours you choose. No account, no analytics, no tracking.

## What it hides

| Site | Hidden by default | Optional |
| --- | --- | --- |
| YouTube | Shorts, home feed, suggested videos | Comments |
| Instagram | Reels, Explore, home feed and stories | |

Search, subscriptions, playlists, messages and profiles keep working. A Short someone sends you opens in the normal player.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click Load unpacked and choose the folder.

The extension has no build step, so the folder runs as it is.

## Development

```sh
npm install
npm test            # logic tests
npm run test:live   # loads the extension in Chromium and checks live YouTube and Instagram
npm run assets      # regenerates store images
npm run build       # makes the store zip in dist/
```

## When a site changes its layout

YouTube and Instagram change their pages often, and this is the most useful thing to contribute. All selectors live in `src/content.css`, and `npm run test:live` shows what broke. The live test runs logged out, so please also check a fix while logged in.

## Layout

- `src/core.js`: blocking and schedule logic, with no browser dependencies
- `src/content.js`, `src/content.css`: what runs on YouTube and Instagram
- `ui/`: the popup and the block hours page
- `store/`: Chrome Web Store text, images and privacy policy

## License

[MIT](LICENSE). The bundled Bricolage Grotesque font is under the [SIL Open Font License](ui/fonts/LICENSE).

Unreel is an independent project and isn't affiliated with YouTube or Instagram.
