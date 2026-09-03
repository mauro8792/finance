import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { User, UserRepository } from "../users/user.types.js";
import type { CategoryService } from "../categories/category.service.js";
import { ChatRequestSchema, ParseTransactionRequestSchema } from "./ai.schema.js";
import type { AiAssistantAskResult } from "./ai-assistant.service.js";
import { OpenAIClientError } from "./openai.errors.js";
import type { AiToolContext } from "./tools/ai-tool.types.js";
import {
  toParserAllowedCategories,
  type TransactionParserService,
} from "./transaction-parser.service.js";

export type AiChatHandler = {
  ask: (message: string, context: AiToolContext) => Promise<AiAssistantAskResult>;
};

export class AiController {
  constructor(
    private readonly parser: Pick<TransactionParserService, "parse">,
    private readonly categories: Pick<CategoryService, "list">,
    private readonly users: UserRepository,
    private readonly chatHandler: AiChatHandler
  ) {}

  parseTransaction = async (req: Request, res: Response): Promise<void> => {
    const body = parseValue(ParseTransactionRequestSchema, req.body);
    const user = await this.requireUser(req);
    const allowed = toParserAllowedCategories(await this.categories.list(user.id));
    try {
      const result = await this.parser.parse(body.text, allowed);
      res.status(200).json(result);
    } catch (error) {
      throw mapParserError(error);
    }
  };

  chat = async (req: Request, res: Response): Promise<void> => {
    const body = parseValue(ChatRequestSchema, req.body);
    const user = await this.requireUser(req);
    try {
      const result = await this.chatHandler.ask(body.message, {
        userId: user.id,
        timeZone: user.timezone,
      });
      res.status(200).json({ answer: result.answer });
    } catch (error) {
      throw mapParserError(error);
    }
  };

  private async requireUser(req: Request): Promise<User> {
    const user = await this.users.findById(getAuthUserId(req));
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Necesitás iniciar sesión.", 401);
    }
    return user;
  }
}

function parseValue<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Solicitud inválida.",
      400
    );
  }

  return parsed.data;
}

export function mapParserError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof OpenAIClientError) {
    if (error.code === "RATE_LIMIT") {
      return new AppError(
        "RATE_LIMIT",
        "El asistente alcanzó el límite de solicitudes.",
        429
      );
    }
    return new AppError(
      "AI_UNAVAILABLE",
      "El asistente no está disponible temporalmente.",
      503
    );
  }
  return new AppError("INTERNAL_ERROR", "Error interno del servidor.", 500);
}
