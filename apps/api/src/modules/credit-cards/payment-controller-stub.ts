/**
 * Minimal stand-in used ONLY by credit-card.controller.test.ts (CRUD card tests).
 * Production router mounts CreditCardPaymentController → CreditCardPaymentService.
 */
import type { Request, Response } from "express";
import type { CreditCardPaymentController } from "../credit-card-payments/credit-card-payment.controller.js";

export function createPaymentControllerStub(): CreditCardPaymentController {
  const notUsedInCardCrudTests = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.status(501).json({
      error: {
        code: "TEST_ONLY_STUB",
        message: "Payment routes are covered by credit-card-payment tests",
      },
    });
  };
  return {
    list: notUsedInCardCrudTests,
    getById: notUsedInCardCrudTests,
    create: notUsedInCardCrudTests,
    void: notUsedInCardCrudTests,
  } as unknown as CreditCardPaymentController;
}
