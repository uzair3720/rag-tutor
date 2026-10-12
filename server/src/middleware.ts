import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "./config";

const payloadSchema = z.object({
  sub: z.string().uuid(),
  org: z.string().uuid(),
});

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; orgId: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    const p = payloadSchema.parse(decoded);
    req.auth = { userId: p.sub, orgId: p.org };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
