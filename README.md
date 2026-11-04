# Unreel

A free, open source Chrome extension that hides YouTube Shorts, Instagram Reels and endless feeds, and shows you where your time goes. No account, no analytics, and nothing leaves your computer.

## What it hides

| Site | Hidden by default | Optional |
| --- | --- | --- |
| YouTube | Shorts, home feed, suggested videos, autoplay | Comments |
| Instagram | Reels, Explore, home feed and stories | |

Search, subscriptions, playlists, messages and profiles keep working. A Short someone sends you opens in the normal player.

## What else it does

- **Screen time:** today's total and the last seven days for each site, stored only on your computer.
- **Daily limits:** give each site a budget. When it's used, the site is replaced with a reminder until midnight.
- **Block hours:** block only during the hours you choose, with different hours per day if you like.
- **Pause:** five minutes, after a ten-second wait.

## Install

Unreel isn't on the Chrome Web Store yet, so you add it yourself. It takes about two minutes.

1. [Download unreel.zip](https://github.com/RusilKoirala/unreel/releases/latest/download/unreel.zip).
2. Unzip it and move the `unreel` folder to Documents. Unreel stops working if the folder is moved or deleted.
3. Paste `chrome://extensions` into Chrome's address bar and turn on Developer mode at the top right.
4. Click Load unpacked and choose the `unreel` folder.

To update, replace the folder's contents with the new version and click the reload icon on Unreel's card.

## Development

```sh
npm install
npm test            # logic tests
npm run test:live   # loads the extension in Chromium and checks live YouTube and Instagram
npm run assets      # regenerates store images
npm run build       # makes dist/unreel.zip
```

## When a site changes its layout

YouTube and Instagram change their pages often, and this is the most useful thing to contribute. All selectors live in `src/content.css`, and `npm run test:live` shows what broke. The live test runs logged out, so please also check a fix while logged in.

## Layout

- `src/core.js`: blocking and schedule logic, with no browser dependencies
- `src/content.js`, `src/content.css`: what runs on YouTube and Instagram
- `ui/`: the popup and the block hours page
- `docs/`: the website and install guide (static files, deployed with Vercel)
- `store/`: Chrome Web Store text, images and privacy policy

## License

[MIT](LICENSE). The bundled Bricolage Grotesque font is under the [SIL Open Font License](ui/fonts/LICENSE).

Unreel is an independent project and isn't affiliated with YouTube or Instagram.
