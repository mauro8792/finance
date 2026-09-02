export const CATEGORY_TYPES = ["EXPENSE", "INCOME", "BOTH"] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const DEFAULT_EXPENSE_CATEGORY_NAMES = [
  "Supermercado",
  "Comida",
  "Nafta",
  "Guardería",
  "Casa",
  "Seguros",
  "Servicios",
  "Salud",
  "Gym",
  "Suscripciones",
  "Hija",
  "Ocio",
  "Otros",
] as const;

export type Category = {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCategoryInput = {
  userId: string;
  name: string;
  type: CategoryType;
  isSystem?: boolean;
  isActive?: boolean;
};

export type UpdateCategoryInput = {
  name?: string;
  type?: CategoryType;
  isActive?: boolean;
};

export type CategoryRepository = {
  create(input: CreateCategoryInput): Promise<Category>;
  findById(id: string): Promise<Category | null>;
  findByUserId(userId: string): Promise<Category[]>;
  findByUserIdAndName(userId: string, name: string): Promise<Category | null>;
  update(id: string, input: UpdateCategoryInput): Promise<Category>;
};
