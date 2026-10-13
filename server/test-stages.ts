import { readFileSync } from "fs";
import { extractText, getDocumentProxy } from "unpdf";
import { chunkPages } from "./src/chunker";
import { embedTexts } from "./src/embeddings";

async function main() {
  const t0 = Date.now();
  const log = (m: string) => console.log(((Date.now() - t0) / 1000).toFixed(1) + "s", m);

  const buf = readFileSync("/home/uzair/Downloads/interview_prep.pdf");
  log("file read: " + buf.length + " bytes");

  const pdf = await getDocumentProxy(new Uint8Array(buf));
  log("pdf opened, pages: " + pdf.numPages);

  const result = await extractText(pdf, { mergePages: false });
  log("text extracted, pages: " + result.text.length);

  const chunks = chunkPages(result.text);
  log("chunks: " + chunks.length);

  const v = await embedTexts([chunks[0].text]);
  log("embedding ok, size: " + v[0].length);
}

main().catch((e) => console.error("ERROR:", e));
