import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, basename, extname, join, resolve, sep } from "node:path";

// Serves a rendered deck over HTTP. The checks cannot open the deck from
// file://, because axe-core is an ES module the browser refuses to load from
// that scheme.

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

export async function serveDeck(target) {
  const filePath = resolve(target);
  const root = dirname(filePath);

  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const resolved = resolve(join(root, path));
      if (resolved !== root && !resolved.startsWith(root + sep)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      const body = await readFile(resolved);
      res.setHeader(
        "Content-Type",
        CONTENT_TYPES[extname(resolved).toLowerCase()] ||
          "application/octet-stream",
      );
      res.end(body);
    } catch (_e) {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/${basename(filePath)}`,
    close: () => server.close(),
  };
}
