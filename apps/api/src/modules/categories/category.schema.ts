import { z } from "zod";
import { CATEGORY_TYPES } from "./category.types.js";

export const CategoryTypeSchema = z.enum(CATEGORY_TYPES);

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  type: CategoryTypeSchema,
});

export const UpdateCategorySchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio.").max(120).optional(),
    type: CategoryTypeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.type !== undefined ||
      value.isActive !== undefined,
    { message: "Debe enviarse al menos un campo para actualizar." }
  );

export const CategoryIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});
