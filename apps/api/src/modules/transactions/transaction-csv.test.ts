import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSV_DELIMITER,
  TRANSACTION_CSV_HEADERS,
  buildTransactionsCsv,
  escapeCsvField,
  formatCsvDate,
} from "./transaction-csv.js";
import type { Transaction } from "./transaction.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";

const lookups = {
  accountNameById: { "acc-1": "Efectivo" },
  categoryNameById: { "cat-1": "Comida" },
  timeZone: DEFAULT_USER_TIMEZONE,
};

function expense(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    userId: "user-1",
    accountId: "acc-1",
    categoryId: "cat-1",
    type: "EXPENSE",
    status: "ACTIVE",
    amount: "15000.00",
    currency: "ARS",
    description: "Super",
    occurredAt: new Date("2026-08-15T15:00:00.000Z"),
    paymentMethod: "CASH",
    isFixed: false,
    reimbursementStatus: "NONE",
    relatedTransactionId: null,
    metadata: null,
    createdAt: new Date("2026-08-15T15:00:00.000Z"),
    updatedAt: new Date("2026-08-15T15:00:00.000Z"),
    ...overrides,
  };
}

function parseCsv(csv: string): string[][] {
  const text = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === CSV_DELIMITER) {
      row.push(field);
      field = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.length > 1 || item[0] !== "");
}

test("escapeCsvField quotes semicolons, quotes and newlines and keeps commas unquoted", () => {
  assert.equal(escapeCsvField("Leche, pan"), "Leche, pan");
  assert.equal(escapeCsvField("almuerzo; extra"), '"almuerzo; extra"');
  assert.equal(escapeCsvField('Dijo "hola"'), '"Dijo ""hola"""');
  assert.equal(escapeCsvField("linea1\nlinea2"), '"linea1\nlinea2"');
  assert.equal(escapeCsvField("Café"), "Café");
});

test("CSV uses semicolon delimiter, UTF-8 BOM and accented headers", () => {
  const csv = buildTransactionsCsv([], lookups);
  const bom = Buffer.from(csv, "utf8").subarray(0, 3);
  assert.deepEqual([...bom], [0xef, 0xbb, 0xbf]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.equal(CSV_DELIMITER, ";");
  assert.equal(csv.includes("sep="), false);

  const [header] = parseCsv(csv);
  assert.deepEqual(header, [...TRANSACTION_CSV_HEADERS]);
  assert.equal(header?.length, TRANSACTION_CSV_HEADERS.length);
  assert.equal(header?.[2], "Categoría");
  assert.equal(header?.[3], "Descripción");
  assert.equal(header?.[8], "Clasificación");
  assert.doesNotMatch(csv, /CategorÃ­a|DescripciÃ³n|ClasificaciÃ³n/);
  assert.equal(csv.includes("userId"), false);
  assert.equal(csv.includes("tx-1"), false);
});

test("CSV row preserves UTF-8, quoted specials and the expected field count", () => {
  const csv = buildTransactionsCsv(
    [
      expense({
        description: "Café, medialunas",
        reimbursementStatus: "PARTIAL",
      }),
      expense({
        description: "Ñandú en Muñoz",
      }),
      expense({
        description: "áéíóú",
      }),
      expense({
        description: "almuerzo; extra",
      }),
      expense({
        description: 'Sueldo "agosto"',
      }),
      expense({
        description: "linea1\nlinea2",
      }),
      expense({
        type: "INCOME",
        categoryId: "cat-1",
        amount: "3500000.00",
        description: "indemnización",
        paymentMethod: null,
        metadata: { incomeKind: "OPERATING" },
        occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      }),
    ],
    lookups
  );

  const rows = parseCsv(csv);
  assert.equal(rows[0]?.length, TRANSACTION_CSV_HEADERS.length);
  for (const row of rows) {
    assert.equal(row.length, TRANSACTION_CSV_HEADERS.length);
  }

  const descriptions = rows.slice(1).map((row) => row[3]);
  assert.equal(descriptions[0], "Café, medialunas");
  assert.equal(descriptions[1], "Ñandú en Muñoz");
  assert.equal(descriptions[2], "áéíóú");
  assert.equal(descriptions[3], "almuerzo; extra");
  assert.equal(descriptions[4], 'Sueldo "agosto"');
  assert.equal(descriptions[5], "linea1\nlinea2");
  assert.equal(descriptions[6], "indemnización");
  assert.match(csv, /""agosto""/);
  assert.match(csv, /15000\.00/);
  assert.match(csv, /3500000\.00/);
  assert.match(csv, /Efectivo/);
  assert.match(csv, /Comida/);
  assert.match(csv, /Ingreso normal/);
  assert.match(csv, /Parcial/);
  assert.doesNotMatch(csv, /indemnizaciÃ³n|Ã±|Ã¡/);
  assert.doesNotMatch(csv, /user-1|acc-1|cat-1|tx-1/);
  assert.equal(
    formatCsvDate(new Date("2026-08-15T15:00:00.000Z"), DEFAULT_USER_TIMEZONE),
    "2026-08-15"
  );
});

test("buildTransactionsCsv labels TRANSFER legs as Transferencia without grouping", () => {
  const transferId = "transfer-1";
  const csv = buildTransactionsCsv(
    [
      expense({
        id: "tx-out",
        type: "TRANSFER",
        categoryId: null,
        amount: "95.78",
        description: "Mover",
        paymentMethod: null,
        metadata: { transferId, direction: "OUT" },
      }),
      expense({
        id: "tx-in",
        type: "TRANSFER",
        accountId: "acc-1",
        categoryId: null,
        amount: "95.78",
        description: "Mover",
        paymentMethod: null,
        metadata: { transferId, direction: "IN" },
        occurredAt: new Date("2026-08-15T15:00:00.000Z"),
      }),
    ],
    lookups
  );
  const rows = parseCsv(csv).slice(1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.[1], "Transferencia");
  assert.equal(rows[1]?.[1], "Transferencia");
});
