import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  router.post("/login", controller.login);
  router.get("/me", requireAuth, controller.me);
  router.post("/logout", controller.logout);
  return router;
}

const sessions = new SessionService();
const users = new PrismaUserRepository();

export const authRouter = createAuthRouter(
  new AuthController(new AuthService(users, sessions), sessions)
);
