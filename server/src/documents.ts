import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { createHash } from "crypto";
import rateLimit from "express-rate-limit";
import { extractText, getDocumentProxy } from "unpdf";
import { requireAuth } from "./middleware";
import { withOrg } from "./db";
import { chunkPages } from "./chunker";
import { embedTexts } from "./embeddings";

const MAX_PAGES = 200;
const MAX_CHUNKS = 2000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function uploadOne(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Upload failed" });
      return;
    }
    next();
  });
}

function cleanTitle(name: string): string {
  const t = name
    .replace(/\.pdf$/i, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
  return t || "Untitled";
}

const router = Router();
router.use(requireAuth);

router.post("/", limiter, uploadOne, async (req, res) => {
  const orgId = req.auth!.orgId;
  const file = req.file;
  if (!file || file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    res.status(400).json({ error: "A PDF file is required" });
    return;
  }

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    if (pdf.numPages > MAX_PAGES) {
      res.status(400).json({ error: "PDF has too many pages" });
      return;
    }
    const result = await extractText(pdf, { mergePages: false });
    pages = result.text;
  } catch {
    res.status(400).json({ error: "Could not read this PDF" });
    return;
  }

  const chunks = chunkPages(pages);
  if (chunks.length === 0) {
    res.status(400).json({ error: "No readable text found in this PDF" });
    return;
  }
  if (chunks.length > MAX_CHUNKS) {
    res.status(400).json({ error: "Document is too large" });
    return;
  }

  const pageNums = chunks.map((c) => c.page);
  const indexes = chunks.map((c) => c.index);
  const contents = chunks.map((c) => c.text);
  const hashes = chunks.map((c) => createHash("sha256").update(c.text).digest("hex"));
  const title = cleanTitle(file.originalname);

  const vectors = await embedTexts(contents);
  const embeds = vectors.map((v) => "[" + v.join(",") + "]");

  const doc = await withOrg(orgId, async (client) => {
    const d = await client.query(
      "INSERT INTO documents(org_id, title) VALUES ($1, $2) RETURNING id, title, created_at",
      [orgId, title]
    );
    await client.query(
      `INSERT INTO chunks(document_id, org_id, page_number, chunk_index, content, content_hash, embedding)
       SELECT $1::uuid, $2::uuid, t.p, t.i, t.c, t.h, t.e::vector
       FROM unnest($3::int[], $4::int[], $5::text[], $6::text[], $7::text[]) AS t(p, i, c, h, e)`,
      [d.rows[0].id, orgId, pageNums, indexes, contents, hashes, embeds]
    );
    return d.rows[0];
  });

  res.status(201).json({ ...doc, chunkCount: chunks.length });
});

router.get("/", async (req, res) => {
  const orgId = req.auth!.orgId;
  const rows = await withOrg(orgId, async (client) => {
    const r = await client.query(
      "SELECT id, title, created_at FROM documents WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50",
      [orgId]
    );
    return r.rows;
  });
  res.json(rows);
});

export default router;
