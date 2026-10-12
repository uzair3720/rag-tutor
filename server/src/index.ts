import "dotenv/config";
import express from "express";
import { Pool } from "pg";

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get("/health", async (_req, res) => {
  const r = await pool.query("SELECT 1 AS ok");
  res.json({ server: "up", db: r.rows[0].ok === 1 });
});

app.listen(process.env.PORT, () => console.log("running"));
