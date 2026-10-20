// Static build for GitHub Pages: the app plus src/static/sw.ts, which stands in for src/server.ts.
import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";

const outdir = "dist";
await rm(outdir, { recursive: true, force: true });
const builds = await Promise.all([
  Bun.build({ entrypoints: ["src/index.html"], outdir, minify: true, plugins: [tailwind], define: { WEBDROID_STATIC: "true" } }),
  Bun.build({ entrypoints: ["src/static/sw.ts"], outdir, naming: "sw.js", minify: true }),
]);
for (const build of builds) if (!build.success) throw new AggregateError(build.logs, "pages build failed");
console.log(`pages → ${outdir}/ (${builds.flatMap(build => build.outputs).length} files)`);
