/**
 * Minimal stand-in used ONLY by credit-card.controller.test.ts (CRUD card tests).
 * Production router mounts CreditCardStatementController → CreditCardStatementService.
 */
import type { Request, Response } from "express";
import type { CreditCardStatementController } from "../credit-card-statements/credit-card-statement.controller.js";

export function createStatementControllerStub(): CreditCardStatementController {
  const notUsedInCardCrudTests = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.status(501).json({
      error: {
        code: "TEST_ONLY_STUB",
        message: "Statement routes are covered by credit-card-statement.controller.test.ts",
      },
    });
  };
  return {
    list: notUsedInCardCrudTests,
    getById: notUsedInCardCrudTests,
    project: notUsedInCardCrudTests,
    close: notUsedInCardCrudTests,
  } as unknown as CreditCardStatementController;
}
