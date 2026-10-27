/**
 * Hermes / AI Team Tool Contract
 *
 * This module defines the backend interface for potential AI assistant integration.
 * Currently, NO AI model is connected. These functions serve as the tool contract
 * that an AI orchestrator (Hermes) would call once configured.
 *
 * Status: NOT CONNECTED
 * - No API keys stored
 * - No model inference happening
 * - Functions are standard Convex mutations/queries that validate input
 *
 * Available tools for future Hermes integration:
 * 1. createTransaction - Add income/expense via chat format
 * 2. createTask - Create a task with optional reminder
 * 3. completeTask - Mark task as done
 * 4. getSummary - Get financial summary for date range
 * 5. getMealPlan - Get meal plan for a specific date
 *
 * Design principles:
 * - Ambiguous input MUST trigger clarification, not guessed writes
 * - Explicit format (e.g. "makanan 28000") can be recorded without re-asking
 * - All numbers from Convex results, not model calculations
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { isIncomeCategory, resolveExpenseCategory } from "./lib/categories";

const OWNER_ID = "default-user";

// ─── AI Team Status ────────────────────────────────────────────────────

export interface AITeamRole {
  id: string;
  name: string;
  description: string;
  status: "connected" | "not_connected" | "error";
  lastActivity?: string;
  capabilities: string[];
}

export const getTeamStatus = query({
  args: {},
  handler: async (ctx) => {
    // Get recent audit logs for activity display
    const recentLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .order("desc")
      .take(5);

    const roles = [
      {
        id: "finance",
        name: "Keuangan",
        description: "Mengelola transaksi, ringkasan keuangan, dan laporan",
        status: "not_connected" as const,
        capabilities: [
          "createTransaction",
          "getSummary",
          "listTransactions",
        ],
        lastActivity: recentLogs
          .filter((l) => l.entityType === "transaction")
          .map((l) => l.summary)[0] ?? null,
      },
      {
        id: "meals",
        name: "Menu & Belanja",
        description: "Merencanakan menu, mengelola resep, dan daftar belanja",
        status: "not_connected" as const,
        capabilities: [
          "getMealPlan",
          "createRecipe",
          "generateShoppingList",
        ],
        lastActivity: recentLogs
          .filter((l) => l.entityType === "recipe" || l.entityType === "mealPlan")
          .map((l) => l.summary)[0] ?? null,
      },
      {
        id: "tasks",
        name: "Tugas",
        description: "Mengelola tugas, pengingat, dan jadwal",
        status: "not_connected" as const,
        capabilities: [
          "createTask",
          "completeTask",
          "getDueReminders",
        ],
        lastActivity: recentLogs
          .filter((l) => l.entityType === "task")
          .map((l) => l.summary)[0] ?? null,
      },
    ];

    return {
      hermesConnected: false,
      message: "Hermes belum tersambung. Hubungkan melalui konfigurasi untuk mengaktifkan asisten AI.",
      roles,
      recentActivity: recentLogs.map((l) => ({
        action: l.action,
        summary: l.summary,
        changedAt: l.changedAt,
        entityType: l.entityType,
      })),
    };
  },
});

// ─── Quick Transaction Parser ──────────────────────────────────────────
// Parse "<kategori atau item> <nominal>", e.g. "makanan 28000", "tissue 5000", "gaji 5000000"

export interface ParsedTransaction {
  isValid: boolean;
  kind?: "income" | "expense";
  category?: string;
  item?: string;
  amountIdr?: number;
  needsClarification: boolean;
  clarificationMessage?: string;
  needsCategory?: boolean;
}

export const parseQuickTransaction = query({
  args: { input: v.string() },
  handler: async (ctx, args): Promise<ParsedTransaction> => {
    const input = args.input.trim().toLowerCase();
    const parts = input.split(/\s+/);

    if (parts.length < 2) {
      return {
        isValid: false,
        needsClarification: true,
        clarificationMessage: 'Format: "kategori nominal", contoh: "makanan 28000"',
      };
    }

    const amountToken = parts[parts.length - 1];
    const label = parts.slice(0, -1).join(" ");
    const digits = amountToken.replace(/^rp/i, "").replace(/[.,]/g, "");
    const amount = /^\d+$/.test(digits) ? Number(digits) : NaN;

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return {
        isValid: false,
        needsClarification: true,
        clarificationMessage: `Nominal "${amountToken}" tidak valid. Gunakan angka bulat positif.`,
      };
    }

    if (isIncomeCategory(label)) {
      return { isValid: true, kind: "income", category: label, amountIdr: amount, needsClarification: false };
    }

    const resolved = await resolveExpenseCategory(ctx, label, OWNER_ID);
    if (resolved) {
      return {
        isValid: true,
        kind: "expense",
        category: resolved.name,
        item: resolved.item,
        amountIdr: amount,
        needsClarification: false,
      };
    }

    return {
      isValid: true,
      kind: "expense",
      category: "Belum dikategorikan",
      item: label,
      amountIdr: amount,
      needsCategory: true,
      needsClarification: false,
    };
  },
});
