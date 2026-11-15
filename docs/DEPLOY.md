# Publishing on GitHub Pages

The game is a static site. `pnpm build` writes it to `dist`, and `.github/workflows/pages.yml` publishes that folder to GitHub Pages. Nothing else hosts it, and nothing runs on a server.

## Publish it

1. Push the repository to GitHub.
2. In the repository, open Settings, then Pages, and set Source to GitHub Actions.
3. Push to `main`, or run the workflow by hand from the Actions tab. The workflow installs the tools the checks need, runs `pnpm typecheck` and `pnpm test`, builds the game, tries the build the way it will be published (`pnpm smoke`), and only then uploads `dist` and deploys it.

The address is `https://<owner>.github.io/<repository>/`. A custom domain at the root of a site works too, because every address in the build is relative. Nothing in the game knows the name of the repository, the host or the folder.

`.github/workflows/ci.yml` runs the same checks on every pull request and can run the browser tests when asked.

## What a visitor sees at the address

- The page and the code are served as they are. GitHub Pages compresses scripts and styles, and sends every file with `Cache-Control: max-age=600`.
- The first visit downloads what is needed to play (4 to 5 MiB), then keeps the rest of the game on the device in the background. When the Offline page says the game is ready, it plays with no connection. The spoken lessons are not part of that: each one is kept the first time it is heard, and the Offline page keeps all of them when a parent asks.
- The page asks for a service worker with a scope that is the folder it is served from. `src/offline` registers it and `src/sw` is the worker. Each release has its own caches, named after the folder and the release, so two copies of the game on one origin never share a cache.
- The first visit to a page is not controlled by the worker, because it does not take over a page that is already open. A lesson that was heard on that first visit is therefore kept from the next opening of the game, and the files of the game are kept either way.

## Try the build before it goes out

```sh
pnpm build
pnpm preview
```

`pnpm preview` serves `dist` from `/unicorn-academy/` on http://127.0.0.1:4173/unicorn-academy/ the way GitHub Pages serves a project site. The folder answers with its page, a missing slash is added by a redirect, every other address is a 404, and files carry the content types and the ten minute cache that GitHub Pages sends. Use `--prefix /another/folder/` or `--port 4180` to change either.

`pnpm smoke` drives that same host with Chromium and fails on any of these:

- The title screen does not come up under the folder, or something answers at the root of the site, so the game leans on it.
- A file of the release is not kept on the device, or the worker's scope is wider than the folder.
- A lesson is kept before it was heard, a lesson that was heard is not kept, or the keep-all button leaves one out.
- With the network off, the page does not reload, a card does not say its word, or the host hears from the page at all.
- A look around (`?incognito`) writes anything to the device.
- The host did not have an address the game asked for, or the console has an error or a warning.

## Updates

Each build writes `dist/sw.js` with the list of the files of that release, grouped as `boot` (needed to play), `rest` (the rest of the game) and `voice` (the spoken lessons). A visitor with an older release downloads the new files in the background. A file whose name carries a hash is reused from the older release when the hash is the same, so most updates fetch only what changed. Phaser has a file of its own for that reason, and it changes only when Phaser does. The spoken lessons that were kept carry over.

When the new release is ready, the Offline page offers to switch to it. The saved herd carries over. Nothing is lost by waiting.

To roll back, publish an earlier commit. Visitors move back the same way they moved forward.

## The source link

The About page shows a link to the source of the game, because the AGPL asks a network service to offer it. `vite.config.ts` builds the link from `GITHUB_REPOSITORY`, which GitHub Actions sets on every run, so the published game links to the repository that built it. A local build has no link. Set the variable to try one:

```sh
GITHUB_REPOSITORY=owner/repository pnpm build
```

## Moving a world to another address

A browser keeps what a site stores for that address only. A game published at a new address, or on a new domain, starts with an empty world. To move one, open Recovery at the old address and download a copy of the world, open Learning there and save a copy of the Spell Book, then load the first under Recovery at the new address and add the second under Learning.

## Another static host

Any host works if it serves the contents of `dist` from a folder over HTTPS (or from localhost), answers an unknown address with a 404 and sends `.webp`, `.mp3`, `.woff2` and `.webmanifest` files with their usual content types. A service worker needs HTTPS. Put `dist` where the host serves it and open the folder's address.
