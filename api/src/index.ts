import "dotenv/config";
import express from "express";
import cors from "cors";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./services/turso.js";
import gamesRouter from "./routes/games.js";
import playersRouter from "./routes/players.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

app.use(cors());
app.use(express.json());

// Routes
app.use("/games", gamesRouter);
app.use("/players", playersRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function main() {
  console.log("Initializing database...");
  await initDb();
  console.log("Database ready.");

  // HTTP listener (for watch / curl / non-browser clients)
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`API running on http://0.0.0.0:${PORT}`);
  });

  // HTTPS listener (for Safari web app — fixes mixed content)
  try {
    const certDir = path.resolve(__dirname, "../../web/certificates");
    const sslOptions = {
      key: fs.readFileSync(path.join(certDir, "localhost-key.pem")),
      cert: fs.readFileSync(path.join(certDir, "localhost.pem")),
    };
    https.createServer(sslOptions, app).listen(Number(HTTPS_PORT), "0.0.0.0", () => {
      console.log(`API running on https://0.0.0.0:${HTTPS_PORT}`);
    });
  } catch (err) {
    console.warn("HTTPS certs not found, skipping HTTPS listener:", err);
  }
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
