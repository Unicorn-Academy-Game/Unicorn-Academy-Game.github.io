import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Where the source of this build is. The About page offers it, because the AGPL asks a copy that is
 * used over a network to. Only the workflow that publishes the game knows the repository, so a
 * build on its own has none.
 */
const repository = process.env.GITHUB_REPOSITORY;
const source = repository ? `https://github.com/${repository}` : '';

export default defineConfig({
  // Every address in the build is relative to the page, so the same files work at the root of a
  // site and in a folder of one, such as a GitHub Pages project site.
  base: './',
  publicDir: 'public',
  define: { __APP_VERSION__: JSON.stringify(version), __SOURCE_URL__: JSON.stringify(source) },
  server: { port: Number(process.env.UA_PORT ?? 5173), strictPort: true },
  build: {
    outDir: 'dist',
    target: 'es2023',
    sourcemap: false,
    // Phaser alone is over a megabyte. It is a file of its own, which a new release does not change
    // unless Phaser is upgraded, so the service worker borrows it from the release before instead
    // of downloading it again.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      input: 'index.html',
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/, priority: 20 }],
        },
      },
    },
  },
});
