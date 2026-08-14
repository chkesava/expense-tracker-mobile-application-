import { describe, expect, it } from "vitest";

import { adaptParsedSmsToWritePayload } from "@/services/sms/expenseAdapter";
import { detectSmsTransaction } from "@/services/sms/smsDetector";
import { extractSmsFields } from "@/services/sms/smsFieldExtractor";
import { parseBankSms } from "@/services/sms/smsParser";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const TS = Date.parse("2026-08-12T10:00:00+05:30");

function sms(
  address: string,
  body: string,
  receivedAtMs = TS
): RawSmsMessage {
  return { id: "reg", address, body, receivedAtMs };
}

describe("existing SMS format regression", () => {
  it("SBI Swiggy UPI debit with last4, date, and ref", () => {
    const message = sms(
      "VK-SBIINB",
      "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI"
    );
    const fields = extractSmsFields(message);
    expect(fields.amount).toBe(450);
    expect(fields.merchant?.toLowerCase()).toContain("swiggy");
    expect(fields.bank).toBe("SBI");
    expect(fields.paymentMethod).toBe("UPI");
    expect(fields.date).toBe("2026-08-12");
    expect(fields.accountLast4).toBe("4521");
    expect(fields.externalRef).toBe("987654321012");
    expect(fields.sender).toBe("VK-SBIINB");

    const parsed = parseBankSms(message);
    expect(parsed.kind).toBe("expense");
    expect(parsed.sender).toBe("VK-SBIINB");
    expect(adaptParsedSmsToWritePayload(parsed)?.collection).toBe("expenses");
  });

  it("HDFC Zomato spent via UPI without a body date", () => {
    const message = sms("AX-HDFCBK", "INR 120 spent at Zomato via UPI");
    const fields = extractSmsFields(message);
    expect(fields.amount).toBe(120);
    expect(fields.merchant?.toLowerCase()).toContain("zomato");
    expect(fields.bank).toBe("HDFC");
    expect(fields.paymentMethod).toBe("UPI");
    expect(parseBankSms(message).kind).toBe("expense");
  });

  it("plain account debit", () => {
    const parsed = parseBankSms(
      sms("VK-HDFCBK", "Your account has been debited ₹500")
    );
    expect(parsed.kind).toBe("expense");
    expect(parsed.amount).toBe(500);
  });

  it("salary-sized credit", () => {
    const parsed = parseBankSms(
      sms("VK-SBIINB", "₹35,000 credited to your account")
    );
    expect(parsed.kind).toBe("income");
    expect(parsed.amount).toBe(35000);
    expect(adaptParsedSmsToWritePayload(parsed)?.collection).toBe("incomes");
  });

  it("IMPS fund transfer", () => {
    const parsed = parseBankSms(
      sms(
        "AX-AXISBK",
        "INR 2,000 transferred to A/c XX4521 via IMPS Ref 998877"
      )
    );
    expect(parsed.kind).toBe("transfer");
    expect(parsed.amount).toBe(2000);
    expect(parsed.accountLast4).toBe("4521");
    expect(parsed.externalRef).toBe("998877");
    expect(adaptParsedSmsToWritePayload(parsed)).toBeNull();
  });

  it("OTP is never an expense", () => {
    const parsed = parseBankSms(
      sms("VK-HDFCBK", "Your OTP is 482913. Do not share with anyone.")
    );
    expect(parsed.kind).toBe("otp");
    expect(adaptParsedSmsToWritePayload(parsed)).toBeNull();
  });

  it("promotional blast is never an expense", () => {
    expect(
      parseBankSms(
        sms("VK-PROMO", "Flat 20% off! Limited period offer. Apply now.")
      ).kind
    ).toBe("promotional");
  });

  it("statement alert stays non_financial", () => {
    expect(
      parseBankSms(
        sms("VK-ALERT", "Your statement is ready to view in net banking.")
      ).kind
    ).toBe("non_financial");
  });

  it("debit with available balance does not use the balance as the amount", () => {
    const fields = extractSmsFields(
      sms(
        "VK-HDFCBK",
        "INR 1,250.00 debited from A/C XX1234 on 10-08-26. Avl Bal INR 9,000.00"
      )
    );
    expect(fields.amount).toBe(1250);
    expect(fields.accountLast4).toBe("1234");
    expect(fields.date).toBe("2026-08-10");
  });

  it("UPI received credit", () => {
    const parsed = parseBankSms(
      sms("AX-PhonePe", "You received Rs.500 via UPI Ref 123456789012")
    );
    expect(parsed.kind).toBe("income");
    expect(parsed.amount).toBe(500);
    expect(parsed.externalRef).toBe("123456789012");
    expect(parsed.paymentMethod).toBe("UPI");
  });

  it("card spend on Amazon with last4", () => {
    const parsed = parseBankSms(
      sms(
        "VK-HDFCBK",
        "Rs.99 spent on Amazon using your card ending 4212"
      )
    );
    expect(parsed.kind).toBe("expense");
    expect(parsed.amount).toBe(99);
    expect(parsed.merchant?.toLowerCase()).toContain("amazon");
    expect(parsed.accountLast4).toBe("4212");
    expect(parsed.paymentMethod).toBe("CARD");
  });

  it("Super Card spend keeps institution from sender, not as merchant", () => {
    const parsed = parseBankSms(
      sms("VM-SUPER", "INR 899 spent on Super Card ending 4521")
    );
    expect(parsed.kind).toBe("expense");
    expect(parsed.amount).toBe(899);
    expect(parsed.accountLast4).toBe("4521");
    expect(parsed.bank).toBe("Super Money");
    expect(parsed.sender).toBe("VM-SUPER");
    // Product labels like "Super Card" are institution clues, not merchants.
    expect(parsed.merchant).toBeUndefined();
  });

  it("SWIGGY*ORDER merchant token", () => {
    const parsed = parseBankSms(
      sms(
        "VK-SBIINB",
        "Your A/c XX4521 has been debited for Rs.450 towards SWIGGY*ORDER via UPI. -SBI"
      )
    );
    expect(parsed.kind).toBe("expense");
    expect(parsed.merchant?.toLowerCase()).toContain("swiggy");
  });

  it("Netflix deducted auto-pay", () => {
    const parsed = parseBankSms(
      sms("VK-HDFCBK", "Rs 649 deducted. Netflix subscription auto-pay.")
    );
    expect(parsed.kind).toBe("expense");
    expect(parsed.amount).toBe(649);
    expect(parsed.merchant).toBe("Netflix");
  });

  it("short debit wording", () => {
    expect(parseBankSms(sms("VK-HDFCBK", "INR 100 debited")).kind).toBe(
      "expense"
    );
    expect(
      parseBankSms(sms("VM-SBIINB", "Your A/c XX4521 is debited for Rs.100")).amount
    ).toBe(100);
  });
});

describe("Indian wording and new kinds", () => {
  it("maps paid / spent / withdrawn / received", () => {
    expect(
      detectSmsTransaction(sms("VK-HDFCBK", "Rs.200 paid from Paytm Wallet")).kind
    ).toBe("expense");
    expect(
      detectSmsTransaction(sms("AX-HDFCBK", "INR 50 spent")).kind
    ).toBe("expense");
    expect(
      detectSmsTransaction(
        sms("VK-SBIINB", "INR 2000 withdrawn from ATM from A/c XX4521")
      ).kind
    ).toBe("atm_withdrawal");
    expect(
      detectSmsTransaction(
        sms("AX-PhonePe", "You received Rs.500 via UPI Ref 123456789012")
      ).kind
    ).toBe("income");
  });

  it("writes refunds as income and ATM withdrawals as expenses", () => {
    const refund = parseBankSms(
      sms("VK-HDFCBK", "Rs.200 refunded to your A/c XX4521")
    );
    expect(refund.kind).toBe("refund");
    expect(refund.incomeSource).toBe("Refund");
    expect(adaptParsedSmsToWritePayload(refund)?.collection).toBe("incomes");

    const atm = parseBankSms(
      sms("VK-SBIINB", "INR 2000 withdrawn from ATM from A/c XX4521")
    );
    expect(atm.kind).toBe("atm_withdrawal");
    expect(atm.paymentMethod).toBe("ATM");
    expect(adaptParsedSmsToWritePayload(atm)?.collection).toBe("expenses");
  });

  it("does not write unknown or credit-card bill payments as expenses", () => {
    const unknown = parseBankSms(sms("VK-HDFCBK", "INR 500. Avl Bal INR 9,000.00"));
    expect(unknown.kind).toBe("unknown");
    expect(adaptParsedSmsToWritePayload(unknown)).toBeNull();

    const bill = parseBankSms(
      sms(
        "VK-HDFCBK",
        "Payment of Rs.5000 received towards your HDFC Credit Card ending 4521"
      )
    );
    expect(bill.kind).toBe("credit_card_payment");
    expect(adaptParsedSmsToWritePayload(bill)).toBeNull();
  });
});
