import index from "./index.html";

Bun.serve({
  routes: {
    "/": index,
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
