import { Router, Response } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { config } from "./config";

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  orgName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

const dummyHashPromise = argon2.hash("dummy-password-for-timing", {
  type: argon2.argon2id,
});

function setSession(res: Response, userId: string, orgId: string) {
  const token = jwt.sign({ sub: userId, org: orgId }, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
  res.cookie("token", token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 1000,
  });
}

router.post("/register", limiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { orgName, email, password } = parsed.data;
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const org = await client.query(
      "INSERT INTO organizations(name) VALUES ($1) RETURNING id",
      [orgName]
    );
    const user = await client.query(
      "INSERT INTO users(org_id, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [org.rows[0].id, email, hash]
    );
    await client.query("COMMIT");
    setSession(res, user.rows[0].id, org.rows[0].id);
    res.status(201).json({ ok: true });
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    throw err;
  } finally {
    client.release();
  }
});

router.post("/login", limiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  const result = await pool.query(
    "SELECT id, org_id, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  const hash = user ? user.password_hash : await dummyHashPromise;
  const ok = await argon2.verify(hash, password);
  if (!user || !ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  setSession(res, user.id, user.org_id);
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export default router;
