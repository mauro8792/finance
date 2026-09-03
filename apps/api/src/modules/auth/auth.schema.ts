import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./password.js";

export const LoginRequestSchema = z
  .object({
    email: z
      .string({ error: "email debe ser un string." })
      .trim()
      .min(1, "email es obligatorio.")
      .email("email no es válido.")
      .max(255, "email no puede superar 255 caracteres."),
    password: z
      .string({ error: "password debe ser un string." })
      .min(MIN_PASSWORD_LENGTH, `password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`),
  })
  .strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export type PublicAuthUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};
