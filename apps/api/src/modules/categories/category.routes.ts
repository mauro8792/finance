import { Router } from "express";
import { PrismaUserRepository } from "../users/user.repository.js";
import { CategoryController } from "./category.controller.js";
import { PrismaCategoryRepository } from "./category.repository.js";
import { CategoryService } from "./category.service.js";

export const categoryRouter = Router();

const controller = new CategoryController(
  new CategoryService(new PrismaCategoryRepository()),
  new PrismaUserRepository()
);

categoryRouter.get("/", controller.list);
categoryRouter.post("/", controller.create);
categoryRouter.patch("/:id", controller.update);
