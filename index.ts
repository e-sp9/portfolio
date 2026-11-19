import index from "./index.html";
import things from "./things.html";
import hire from "./hire.html";
import { serveBlog, serveDiscovery } from "./blog/dev";
import { serveWork } from "./work/site";

Bun.serve({
  routes: {
    "/": index,
    "/things": things,
    "/hire": hire,
    "/sitemap.xml": serveDiscovery,
    "/robots.txt": serveDiscovery,
    "/llms.txt": serveDiscovery,
    // The blog comes from microCMS: rendered on request here, written to
    // dist/ by the build (blog/build.ts).
    "/blog": serveBlog,
    "/blog/*": serveBlog,
    "/blog.css": serveBlog,
    // The cases come from work/cases.ts: rendered on request here, written to
    // dist/ by the build (work/build.ts).
    "/work": serveWork,
    "/work/*": serveWork,
    "/work.css": serveWork,
    // The theme switch of /blog and /work, which have no bundle of their own
    // (the build writes dist/theme-switch.js: package.json)
    "/theme-switch.js": async () => {
      const { outputs } = await Bun.build({ entrypoints: ["./theme-switch.ts"] });
      return new Response(outputs[0]);
    },
  },
  // Serve everything under ./public (3D models etc.) so adding a model
  // requires no server changes.
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (!pathname.includes("..")) {
      const file = Bun.file(`./public${pathname}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: pathname.endsWith(".glb")
            ? { "Content-Type": "model/gltf-binary" }
            : undefined,
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});
