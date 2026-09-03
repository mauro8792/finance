import { z } from "zod";

export const ParseTransactionRequestSchema = z
  .object({
    text: z
      .string({ error: "text debe ser un string." })
      .trim()
      .min(1, "text es obligatorio.")
      .max(2000, "text no puede superar 2000 caracteres."),
  })
  .strict();

export type ParseTransactionRequest = z.infer<typeof ParseTransactionRequestSchema>;

export const ChatRequestSchema = z
  .object({
    message: z
      .string({ error: "message debe ser un string." })
      .trim()
      .min(1, "message es obligatorio.")
      .max(4000, "message no puede superar 4000 caracteres."),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatResponse = {
  answer: string;
};
