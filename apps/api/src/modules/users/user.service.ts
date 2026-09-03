import {
  DEFAULT_USER_TIMEZONE,
  type CreateUserInput,
  type User,
  type UserRepository,
} from "./user.types.js";

export class UserService {
  constructor(private readonly users: UserRepository) {}

  async create(input: CreateUserInput): Promise<User> {
    const name = input.name.trim();

    if (!name) {
      throw new Error("El nombre es obligatorio.");
    }

    if (name.length > 120) {
      throw new Error("El nombre no puede superar 120 caracteres.");
    }

    const email = normalizeEmail(input.email);

    if (email && email.length > 255) {
      throw new Error("El email no puede superar 255 caracteres.");
    }

    return this.users.create({
      name,
      email,
      timezone: input.timezone?.trim() || DEFAULT_USER_TIMEZONE,
    });
  }

  async getById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }
}

function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}
