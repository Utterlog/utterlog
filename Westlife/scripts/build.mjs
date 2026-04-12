import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.env.NODE_ENV === "production";

const options = {
  entryPoints: ["assets/src/app.js"],
  bundle: true,
  outfile: "assets/dist/app.js",
  format: "iife",
  platform: "browser",
  target: ["es2019"],
  sourcemap: production ? false : "linked",
  minify: production,
  legalComments: "none",
  external: ["jquery"],
  loader: {
    ".css": "css",
    ".svg": "file",
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".gif": "file",
    ".webp": "file",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      production ? "production" : "development"
    ),
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[westlife] esbuild watching app bundle...");
} else {
  await build(options);
  console.log("[westlife] built assets/dist/app.js and assets/dist/app.css");
}
