import { AppError } from "../../shared/errors/app-error.js";
import type {
  AccreditAtomicResult,
  AccreditCreditCardRefundInput,
  CreateCreditCardRefundExpectationInput,
  CreditCardRefundExpectationView,
  CreditCardRefundRepository,
} from "./credit-card-refund.types.js";

export class CreditCardRefundService {
  constructor(private readonly refunds: CreditCardRefundRepository) {}

  async createExpected(
    input: CreateCreditCardRefundExpectationInput
  ): Promise<CreditCardRefundExpectationView> {
    const result = await this.refunds.createExpectationAtomic(input);
    return result.expectation;
  }

  async listExpected(
    userId: string
  ): Promise<CreditCardRefundExpectationView[]> {
    const records = await this.refunds.findExpectationsByUserId(userId);
    const views: CreditCardRefundExpectationView[] = [];
    for (const record of records) {
      views.push(await this.refunds.buildExpectationView(record));
    }
    return views;
  }

  async getExpected(
    userId: string,
    id: string
  ): Promise<CreditCardRefundExpectationView> {
    const record = await this.refunds.findExpectationById(id);
    if (!record || record.userId !== userId) {
      throw new AppError("NOT_FOUND", "Expectativa no encontrada.", 404);
    }
    return this.refunds.buildExpectationView(record);
  }

  async cancelExpected(
    userId: string,
    id: string
  ): Promise<CreditCardRefundExpectationView> {
    const result = await this.refunds.cancelExpectationAtomic(userId, id);
    return result.expectation;
  }

  async accredit(
    input: AccreditCreditCardRefundInput
  ): Promise<AccreditAtomicResult> {
    return this.refunds.accreditAtomic(input);
  }
}
