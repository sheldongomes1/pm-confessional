import path from "node:path";
import fs from "node:fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production (e.g. Cloud Run) the API server also serves the built React
// SPA so the frontend's relative `/api/...` calls work from a single origin —
// no CORS, no second URL. Set PUBLIC_DIR to the Vite build output
// (artifacts/pm-confessional/dist/public). Left unset during local `pnpm dev`,
// where Vite serves the frontend on its own port, so this block is a no-op.
const publicDir = process.env["PUBLIC_DIR"];

if (publicDir) {
  const resolvedPublicDir = path.resolve(publicDir);
  const indexHtml = path.join(resolvedPublicDir, "index.html");

  if (!fs.existsSync(indexHtml)) {
    logger.warn(
      { publicDir: resolvedPublicDir },
      "PUBLIC_DIR is set but index.html was not found; static SPA serving disabled",
    );
  } else {
    logger.info({ publicDir: resolvedPublicDir }, "Serving static SPA");

    // Hashed assets can be cached aggressively; index.html must not be.
    app.use(
      express.static(resolvedPublicDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );

    // SPA history-fallback. Express 5 uses path-to-regexp v6, where the old
    // `app.get("*")` wildcard throws — so we use a trailing middleware that
    // serves index.html for non-API GET/HEAD navigations and lets everything
    // else fall through to the 404 handler.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(indexHtml);
    });
  }
}

export default app;
