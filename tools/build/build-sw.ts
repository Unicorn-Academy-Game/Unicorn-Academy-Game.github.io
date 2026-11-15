import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';
import { planOf, SERVICE_WORKER } from './dist';

/**
 * `tsx tools/build/build-sw.ts [dir]`: the last step of `pnpm build`. It reads the finished build
 * (`dist/` unless a folder is named), works out the release plan, writes the release's name into
 * its `index.html`, and builds its `sw.js` with the plan inside it.
 */

async function main(): Promise<void> {
  const dist = resolve(process.argv[2] ?? 'dist');
  const { plan, html, report } = planOf(dist);
  writeFileSync(join(dist, 'index.html'), html);
  await viteBuild({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    define: { __PLAN__: JSON.stringify(plan) },
    build: {
      outDir: dist,
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2023',
      minify: true,
      sourcemap: false,
      lib: {
        entry: resolve('src/sw/sw.ts'),
        formats: ['iife'],
        name: 'unicornServiceWorker',
        fileName: () => SERVICE_WORKER,
      },
    },
  });
  const mib = (n: number): string => (n / 1024 / 1024).toFixed(2);
  console.log(
    `release ${plan.build}: ${report.files} files, ${mib(report.bootBytes)} MiB to start (${report.bootFiles} files), ${mib(report.offlineBytes)} MiB kept for offline play, ${mib(report.voiceBytes)} MiB of spoken lessons, sent compressed`,
  );
  for (const big of report.largest) console.log(`  ${(big.bytes / 1024).toFixed(0).padStart(7)} KiB  ${big.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
