import { AppError } from "../../shared/errors/app-error.js";
import type {
  ConfirmRecurringChargeInput,
  ConfirmRecurringChargeResult,
  CreateCreditCardRecurringChargeInput,
  CreditCardRecurringChargeRecord,
  CreditCardRecurringChargeRepository,
  RecurringChargeOutlookResult,
  UpdateCreditCardRecurringChargeInput,
} from "./credit-card-recurring-charge.types.js";

export class CreditCardRecurringChargeService {
  constructor(
    private readonly recurringCharges: CreditCardRecurringChargeRepository
  ) {}

  async create(
    input: CreateCreditCardRecurringChargeInput
  ): Promise<CreditCardRecurringChargeRecord> {
    return this.recurringCharges.create(input);
  }

  async list(
    userId: string,
    creditCardId?: string
  ): Promise<CreditCardRecurringChargeRecord[]> {
    return this.recurringCharges.findByUserId(userId, creditCardId);
  }

  async get(
    userId: string,
    id: string
  ): Promise<CreditCardRecurringChargeRecord> {
    const record = await this.recurringCharges.findById(id);
    if (!record || record.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cargo recurrente no encontrado.", 404);
    }
    return record;
  }

  async update(
    input: UpdateCreditCardRecurringChargeInput
  ): Promise<CreditCardRecurringChargeRecord> {
    return this.recurringCharges.update(input);
  }

  async activate(
    userId: string,
    id: string
  ): Promise<CreditCardRecurringChargeRecord> {
    return this.recurringCharges.setActive(userId, id, true);
  }

  async deactivate(
    userId: string,
    id: string
  ): Promise<CreditCardRecurringChargeRecord> {
    return this.recurringCharges.setActive(userId, id, false);
  }

  async confirm(
    input: ConfirmRecurringChargeInput
  ): Promise<ConfirmRecurringChargeResult> {
    return this.recurringCharges.confirmAtomic(input);
  }

  async outlook(
    userId: string,
    creditCardId: string,
    year: number,
    month: number
  ): Promise<RecurringChargeOutlookResult> {
    return this.recurringCharges.outlook(userId, creditCardId, year, month);
  }
}
