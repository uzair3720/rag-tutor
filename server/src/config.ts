import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  APP_DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(10),
  LLM_MODEL: z.string().default("gemini-2.5-flash"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
});

export const config = schema.parse(process.env);
