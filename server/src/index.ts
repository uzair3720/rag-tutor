import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { pool } from "./db";
import authRouter from "./auth";
import documentsRouter from "./documents";
import searchRouter from "./search";
import askRouter from "./ask";
import quizRouter from "./quiz";
import { requireAuth } from "./middleware";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ server: "up", db: true });
});

app.use("/auth", authRouter);
app.use("/documents", documentsRouter);
app.use("/search", searchRouter);
app.use("/ask", askRouter);
app.use("/quiz", quizRouter);

app.get("/me", requireAuth, (req, res) => {
  res.json(req.auth);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: "Server error" });
});

app.listen(config.PORT, (err?: Error) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log("running");
});
