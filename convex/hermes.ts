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
// Parse format "makanan 28000" or "gaji 5000000"

const EXPENSE_CATEGORIES = ["makanan", "transportasi", "belanja", "parkir", "tagihan"];
const INCOME_CATEGORIES = ["gaji"];

export interface ParsedTransaction {
  isValid: boolean;
  kind?: "income" | "expense";
  category?: string;
  amountIdr?: number;
  needsClarification: boolean;
  clarificationMessage?: string;
}

export const parseQuickTransaction = query({
  args: { input: v.string() },
  handler: async (_, args) => {
    const input = args.input.trim().toLowerCase();
    const parts = input.split(/\s+/);

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

    let kind: "income" | "expense";
    if (EXPENSE_CATEGORIES.includes(category)) {
      kind = "expense";
    } else if (INCOME_CATEGORIES.includes(category)) {
      kind = "income";
    } else {
      return {
        isValid: false,
        needsClarification: true,
        clarificationMessage: `Kategori "${category}" tidak dikenali. Pilihan: ${[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].join(", ")}`,
      };
    }

    return {
      isValid: true,
      kind,
      category,
      amountIdr: amount,
      needsClarification: false,
    };
  },
});
