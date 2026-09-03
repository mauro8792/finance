import { AppError } from "../../shared/errors/app-error.js";
import type { User, UserRepository } from "../users/user.types.js";
import type { PublicAuthUser } from "./auth.schema.js";
import { verifyPasswordOrDummy } from "./password.js";
import type { AuthSession, SessionService } from "./session.service.js";

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionService
  ) {}

  async login(
    email: string,
    password: string
  ): Promise<{ user: User; token: string; session: AuthSession }> {
    const found = await this.users.findAuthByEmail(email.trim().toLowerCase());
    const ok = await verifyPasswordOrDummy(found?.passwordHash, password);
    if (!found || !ok) {
      throw new AppError("INVALID_CREDENTIALS", "Email o contraseña incorrectos.", 401);
    }
    const created = await this.sessions.create(found.user.id);
    return { user: found.user, token: created.token, session: created.session };
  }

  async me(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Necesitás iniciar sesión.", 401);
    }
    return user;
  }
}

export function toPublicAuthUser(user: User): PublicAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
  };
}
