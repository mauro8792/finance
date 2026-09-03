import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "./auth-request.js";
import { LoginRequestSchema } from "./auth.schema.js";
import { AuthService, toPublicAuthUser } from "./auth.service.js";
import { expireSessionCookie, readCookie, setSessionCookie } from "./session-cookie.js";
import type { SessionService } from "./session.service.js";

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService
  ) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const body = parseBody(LoginRequestSchema, req.body);
    const result = await this.auth.login(body.email, body.password);
    setSessionCookie(
      res,
      result.token,
      result.session.absoluteExpiresAt.getTime() - Date.now()
    );
    res.status(200).json({ user: toPublicAuthUser(result.user) });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const user = await this.auth.me(getAuthUserId(req));
    res.status(200).json({ user: toPublicAuthUser(user) });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const token = readCookie(req);
    if (token) {
      const session = await this.sessions.findValidByToken(token);
      if (session) {
        await this.sessions.revoke(session.id);
      }
    }
    expireSessionCookie(res);
    res.status(204).end();
  };
}

function parseBody<T>(schema: ZodType<T>, data: unknown): T {
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
