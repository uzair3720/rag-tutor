import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { requireAuth } from "./middleware";
import { withOrg } from "./db";
import { embedTexts } from "./embeddings";

const router = Router();
router.use(requireAuth);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const searchSchema = z.object({
  question: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).default(5),
});

export async function findChunks(orgId: string, question: string, limit: number) {
  const [vector] = await embedTexts([question]);
  const literal = "[" + vector.join(",") + "]";
  return withOrg(orgId, async (client) => {
    await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
    const r = await client.query(
      `SELECT c.id, c.content, c.page_number, d.title,
              1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c
       JOIN documents d ON d.id = c.document_id AND d.org_id = c.org_id
       WHERE c.org_id = $2
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [literal, orgId, limit]
    );
    return r.rows;
  });
}

router.post("/", limiter, async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const rows = await findChunks(req.auth!.orgId, parsed.data.question, parsed.data.limit);
  res.json(rows);
});

export default router;
