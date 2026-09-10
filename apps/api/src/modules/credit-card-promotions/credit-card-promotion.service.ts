import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateCreditCardPromotionInput,
  CreditCardPromotionRecord,
  CreditCardPromotionRepository,
  PromotionApplyResult,
  PromotionApplySourceInput,
  PromotionPreviewResult,
  UpdateCreditCardPromotionInput,
} from "./credit-card-promotion.types.js";

export class CreditCardPromotionService {
  constructor(private readonly promotions: CreditCardPromotionRepository) {}

  async create(
    input: CreateCreditCardPromotionInput
  ): Promise<CreditCardPromotionRecord> {
    return this.promotions.create(input);
  }

  async list(userId: string): Promise<CreditCardPromotionRecord[]> {
    return this.promotions.findByUserId(userId);
  }

  async get(userId: string, id: string): Promise<CreditCardPromotionRecord> {
    const record = await this.promotions.findById(id);
    if (!record || record.userId !== userId) {
      throw new AppError("NOT_FOUND", "Promoción no encontrada.", 404);
    }
    return record;
  }

  async update(
    input: UpdateCreditCardPromotionInput
  ): Promise<CreditCardPromotionRecord> {
    return this.promotions.update(input);
  }

  async activate(
    userId: string,
    id: string
  ): Promise<CreditCardPromotionRecord> {
    return this.promotions.setActive(userId, id, true);
  }

  async deactivate(
    userId: string,
    id: string
  ): Promise<CreditCardPromotionRecord> {
    return this.promotions.setActive(userId, id, false);
  }

  async preview(
    input: PromotionApplySourceInput
  ): Promise<PromotionPreviewResult> {
    return this.promotions.preview(input);
  }

  async apply(input: PromotionApplySourceInput): Promise<PromotionApplyResult> {
    return this.promotions.apply(input);
  }
}
