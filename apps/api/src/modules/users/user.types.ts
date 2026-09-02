export const DEFAULT_USER_TIMEZONE = "America/Argentina/Buenos_Aires";

export type User = {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  name: string;
  email?: string | null;
  timezone?: string;
};

export type UserRepository = {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findFirst(): Promise<User | null>;
};
