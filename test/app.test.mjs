import test from "node:test";
import assert from "node:assert/strict";

// ─── 1. Currency Formatting & Parsing Tests ─────────────────────────────────

function formatIdr(amount) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function parseIdr(str) {
  const cleaned = str.replace(/[Rp.,\s]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

test("Validasi Nominal IDR", async (t) => {
  await t.test("format IDR Indonesia: Rp28.000 dan Rp5.000.000", () => {
    assert.equal(formatIdr(28000), "Rp28.000");
    assert.equal(formatIdr(5000000), "Rp5.000.000");
    assert.equal(formatIdr(0), "Rp0");
  });

  await t.test("nominal harus integer positif, bukan float atau negatif", () => {
    assert.equal(parseIdr("28000"), 28000);
    assert.equal(parseIdr("Rp 28.000"), 28000);
    assert.equal(parseIdr("Rp5.000.000"), 5000000);
    assert.equal(parseIdr("-50000"), null);
    assert.equal(parseIdr("0"), null);
    assert.equal(parseIdr("abc"), null);
  });
});

// ─── 2. Category Validation & Quick Transaction Parser ──────────────────────

const EXPENSE_CATEGORIES = ["makanan", "transportasi", "belanja", "parkir", "tagihan"];
const INCOME_CATEGORIES = ["gaji"];

function parseQuickTransaction(input) {
  const trimmed = input.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    return {
      isValid: false,
      needsClarification: true,
      clarificationMessage: 'Format: "kategori nominal", contoh: "makanan 28000"',
    };
  }

  const category = parts[0];
  const amountStr = parts[1].replace(/[.,]/g, "");
  const amount = parseInt(amountStr, 10);

  if (isNaN(amount) || amount <= 0) {
    return {
      isValid: false,
      needsClarification: true,
      clarificationMessage: `Nominal "${parts[1]}" tidak valid. Gunakan angka bulat positif.`,
    };
  }

  let kind;
  if (EXPENSE_CATEGORIES.includes(category)) {
    kind = "expense";
  } else if (INCOME_CATEGORIES.includes(category)) {
    kind = "income";
  } else {
    return {
      isValid: false,
      needsClarification: true,
      clarificationMessage: `Kategori "${category}" tidak dikenali.`,
    };
  }

  return {
    isValid: true,
    kind,
    category,
    amountIdr: amount,
    needsClarification: false,
  };
}

test("Validasi Kategori dan Parser Transaksi Cepat", async (t) => {
  await t.test("makanan 28000 diparse sebagai pengeluaran valid", () => {
    const res = parseQuickTransaction("makanan 28000");
    assert.equal(res.isValid, true);
    assert.equal(res.kind, "expense");
    assert.equal(res.category, "makanan");
    assert.equal(res.amountIdr, 28000);
    assert.equal(res.needsClarification, false);
  });

  await t.test("gaji 5000000 diparse sebagai pemasukan valid", () => {
    const res = parseQuickTransaction("gaji 5000000");
    assert.equal(res.isValid, true);
    assert.equal(res.kind, "income");
    assert.equal(res.category, "gaji");
    assert.equal(res.amountIdr, 5000000);
  });

  await t.test("input ambigu atau kategori tidak valid memicu klarifikasi", () => {
    const res1 = parseQuickTransaction("makanan");
    assert.equal(res1.isValid, false);
    assert.equal(res1.needsClarification, true);

    const res2 = parseQuickTransaction("crypto 500000");
    assert.equal(res2.isValid, false);
    assert.equal(res2.needsClarification, true);
  });
});

// ─── 3. Asia/Jakarta Timezone & Monday-Sunday Range Tests ────────────────────

const TIMEZONE = "Asia/Jakarta";

function dateKeyToEpoch(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const jakartaStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+07:00`;
  return new Date(jakartaStr).getTime();
}

function getWeekRangeForDate(date) {
  // Convert date to Jakarta time representation
  const jakartaDateStr = date.toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // YYYY-MM-DD
  const [y, m, d] = jakartaDateStr.split("-").map(Number);
  const localDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = localDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(localDate);
  monday.setUTCDate(localDate.getUTCDate() + diffToMonday);

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  const monStr = monday.toISOString().slice(0, 10);
  const nextMonStr = nextMonday.toISOString().slice(0, 10);

  return {
    start: dateKeyToEpoch(monStr),
    end: dateKeyToEpoch(nextMonStr) - 1,
    monStr,
    nextMonStr,
  };
}

test("Perhitungan Rentang Mingguan (Senin 00:00 sampai Minggu 23:59:59 Asia/Jakarta)", async (t) => {
  await t.test("Hari Kamis (2026-10-15) menghasilkan minggu Senin 2026-10-12 s/d Minggu 2026-10-18", () => {
    // 2026-10-15 is a Thursday
    const thursday = new Date("2026-10-15T12:00:00+07:00");
    const range = getWeekRangeForDate(thursday);

    assert.equal(range.monStr, "2026-10-12");
    // Start must be Monday 00:00:00 WIB
    const startDate = new Date(range.start);
    const startJakarta = startDate.toLocaleString("en-US", { timeZone: TIMEZONE });
    assert.match(startJakarta, /10\/12\/2026, 12:00:00 AM/);

    // End must be Sunday 23:59:59.999 WIB
    const endDate = new Date(range.end);
    const endJakarta = endDate.toLocaleString("en-US", { timeZone: TIMEZONE });
    assert.match(endJakarta, /10\/18\/2026, 11:59:59 PM/);
  });

  await t.test("Hari Minggu (2026-10-18) tetap berada di minggu yang sama", () => {
    const sunday = new Date("2026-10-18T23:00:00+07:00");
    const range = getWeekRangeForDate(sunday);
    assert.equal(range.monStr, "2026-10-12");
  });

  await t.test("Waktu subuh 01:00 WIB tidak bergeser tanggal karena UTC", () => {
    // 01:00 WIB on Oct 15 is 18:00 UTC on Oct 14
    const earlyMorning = new Date("2026-10-15T01:00:00+07:00");
    const jakartaDateStr = earlyMorning.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
    assert.equal(jakartaDateStr, "2026-10-15");
  });
});

// ─── 4. Reminder Idempotency & Duplicate Prevention Tests ───────────────────

class MockNotificationStore {
  constructor() {
    this.logs = new Map();
  }

  scheduleReminder(ownerId, taskId, scheduledAt) {
    const idempotencyKey = `${taskId}_${scheduledAt}`;
    if (this.logs.has(idempotencyKey)) {
      return { success: false, reason: "DUPLICATE_REMINDER_PREVENTED", log: this.logs.get(idempotencyKey) };
    }

    const record = {
      idempotencyKey,
      ownerId,
      taskId,
      scheduledAt,
      status: "scheduled",
      createdAt: Date.now(),
    };
    this.logs.set(idempotencyKey, record);
    return { success: true, log: record };
  }
}

test("Pencegahan Reminder Duplikat dengan Idempotency Key", async (t) => {
  await t.test("jadwal reminder pertama berhasil, yang kedua dicegah", () => {
    const store = new MockNotificationStore();
    const taskId = "task-abc-123";
    const scheduledAt = 1792060000000;

    const first = store.scheduleReminder("user-1", taskId, scheduledAt);
    assert.equal(first.success, true);
    assert.equal(first.log.status, "scheduled");

    const second = store.scheduleReminder("user-1", taskId, scheduledAt);
    assert.equal(second.success, false);
    assert.equal(second.reason, "DUPLICATE_REMINDER_PREVENTED");
  });
});

// ─── 5. Data Ownership Isolation Tests ──────────────────────────────────────

class MockDatabase {
  constructor() {
    this.data = [];
  }

  insert(record) {
    this.data.push(record);
  }

  getByOwner(ownerId) {
    return this.data.filter((r) => r.ownerId === ownerId);
  }

  modify(ownerId, id, patch) {
    const item = this.data.find((r) => r.id === id);
    if (!item) throw new Error("Not found");
    if (item.ownerId !== ownerId) throw new Error("UNAUTHORIZED: Data bukan milik pengguna");
    Object.assign(item, patch);
    return item;
  }
}

test("Isolasi Kepemilikan Data (ownerId)", async (t) => {
  await t.test("pengguna hanya bisa melihat dan memodifikasi data miliknya", () => {
    const db = new MockDatabase();
    db.insert({ id: "tx-1", ownerId: "user-alpha", amountIdr: 50000 });
    db.insert({ id: "tx-2", ownerId: "user-beta", amountIdr: 100000 });

    const alphaTxs = db.getByOwner("user-alpha");
    assert.equal(alphaTxs.length, 1);
    assert.equal(alphaTxs[0].id, "tx-1");

    assert.throws(() => {
      db.modify("user-alpha", "tx-2", { amountIdr: 200000 });
    }, /UNAUTHORIZED/);
  });
});

// ─── 6. WhatsApp Fail-Closed Safeguard Tests ─────────────────────────────────

function evaluateWhatsAppSend({ isWabaEnabled, estimatedCostIdr, monthlySpentIdr, budgetLimitIdr }) {
  if (!isWabaEnabled) {
    return { allowed: false, reason: "WABA_DISABLED_PENDING_REVIEW" };
  }
  if (!estimatedCostIdr || estimatedCostIdr <= 0) {
    return { allowed: false, reason: "FAIL_CLOSED_UNKNOWN_COST" };
  }
  if (monthlySpentIdr + estimatedCostIdr > budgetLimitIdr) {
    return { allowed: false, reason: "BUDGET_LIMIT_EXCEEDED" };
  }
  return { allowed: true };
}

test("WhatsApp Fail-Closed Guard", async (t) => {
  await t.test("pengiriman WA ditolak secara default saat WABA belum aktif", () => {
    const res = evaluateWhatsAppSend({
      isWabaEnabled: false,
      estimatedCostIdr: 500,
      monthlySpentIdr: 10000,
      budgetLimitIdr: 50000,
    });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "WABA_DISABLED_PENDING_REVIEW");
  });

  await t.test("pengiriman WA fail-closed bila biaya tidak diketahui", () => {
    const res = evaluateWhatsAppSend({
      isWabaEnabled: true,
      estimatedCostIdr: null,
      monthlySpentIdr: 10000,
      budgetLimitIdr: 50000,
    });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "FAIL_CLOSED_UNKNOWN_COST");
  });

  await t.test("pengiriman WA ditolak bila melebihi budget Rp50.000/bulan", () => {
    const res = evaluateWhatsAppSend({
      isWabaEnabled: true,
      estimatedCostIdr: 2000,
      monthlySpentIdr: 49000,
      budgetLimitIdr: 50000,
    });
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "BUDGET_LIMIT_EXCEEDED");
  });
});
