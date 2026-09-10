import { AppError } from "../../shared/errors/app-error.js";
import { requireIdempotencyKey } from "../corrections/correction.repository.js";
import type { CreditCardRepository } from "../credit-cards/credit-card.types.js";
import type { TransactionRepository } from "../transactions/transaction.types.js";
import type {
  CreateCreditCardPaymentInput,
  CreditCardPaymentRepository,
  CreditCardPaymentView,
  VoidPaymentAtomicResult,
} from "./credit-card-payment.types.js";

export class CreditCardPaymentService {
  constructor(
    private readonly payments: CreditCardPaymentRepository,
    private readonly cards: CreditCardRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async create(
    input: CreateCreditCardPaymentInput
  ): Promise<{ created: boolean; payment: CreditCardPaymentView }> {
    return this.payments.createPaymentAtomic(input);
  }

  async list(
    userId: string,
    creditCardId: string
  ): Promise<CreditCardPaymentView[]> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    const links = await this.payments.findByCreditCardId(card.id);
    return this.toViews(links);
  }

  async getById(
    userId: string,
    creditCardId: string,
    paymentId: string
  ): Promise<CreditCardPaymentView> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    const link = await this.payments.findByTransactionId(paymentId);
    if (!link || link.userId !== userId || link.creditCardId !== card.id) {
      throw new AppError("NOT_FOUND", "Pago no encontrado.", 404);
    }
    const views = await this.toViews([link]);
    const view = views[0];
    if (!view) {
      throw new AppError("NOT_FOUND", "Pago no encontrado.", 404);
    }
    return view;
  }

  /** P0.15: reverses the payment; bank balance and card debt restore derived. */
  async void(
    userId: string,
    creditCardId: string,
    paymentId: string,
    input: { idempotencyKey: string }
  ): Promise<VoidPaymentAtomicResult> {
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const card = await this.requireOwnedCard(userId, creditCardId);
    return this.payments.voidPaymentAtomic({
      userId,
      creditCardId: card.id,
      paymentId,
      idempotencyKey,
    });
  }

  private async toViews(
    links: Array<{
      transactionId: string;
      creditCardId: string;
      statementId: string | null;
      idempotencyKey: string;
      voidedAt: Date | null;
    }>
  ): Promise<CreditCardPaymentView[]> {
    const views: CreditCardPaymentView[] = [];
    for (const link of links) {
      const tx = await this.transactions.findById(link.transactionId);
      if (!tx || tx.accountId == null) {
        continue;
      }
      views.push({
        id: link.transactionId,
        creditCardId: link.creditCardId,
        statementId: link.statementId,
        accountId: tx.accountId,
        amount: tx.amount,
        currency: tx.currency,
        occurredAt: tx.occurredAt,
        description: tx.description,
        status: tx.status,
        idempotencyKey: link.idempotencyKey,
        voidedAt: link.voidedAt,
      });
    }
    return views;
  }

  private async requireOwnedCard(userId: string, creditCardId: string) {
    const card = await this.cards.findById(creditCardId);
    if (!card || card.userId !== userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    return card;
  }
}
