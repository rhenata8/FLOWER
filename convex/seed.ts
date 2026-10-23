import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const OWNER_ID = "default-user";

export const seedSampleData = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if data already exists to avoid duplicating seeds
    const existingTx = await ctx.db
      .query("transactions")
      .withIndex("by_owner", (q) => q.eq("ownerId", OWNER_ID))
      .first();

    if (existingTx) {
      return { message: "Data contoh fiktif sudah pernah dimuat sebelumnya." };
    }

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 1. Fictional Transactions
    const txSamples = [
      { kind: "income" as const, category: "gaji", amountIdr: 5000000, note: "Gaji bulanan", daysAgo: 3 },
      { kind: "expense" as const, category: "makanan", amountIdr: 28000, note: "Makan siang nasi padang", daysAgo: 0 },
      { kind: "expense" as const, category: "transportasi", amountIdr: 35000, note: "Bensin motor", daysAgo: 1 },
      { kind: "expense" as const, category: "belanja", amountIdr: 120000, note: "Belanja bahan sayur & buah", daysAgo: 2 },
      { kind: "expense" as const, category: "parkir", amountIdr: 5000, note: "Parkir minimarket", daysAgo: 0 },
      { kind: "expense" as const, category: "tagihan", amountIdr: 350000, note: "Tagihan internet WiFi", daysAgo: 4 },
    ];

    for (const tx of txSamples) {
      await ctx.db.insert("transactions", {
        ownerId: OWNER_ID,
        kind: tx.kind,
        category: tx.category,
        amountIdr: tx.amountIdr,
        occurredAt: now - tx.daysAgo * oneDay,
        note: tx.note,
        source: "seed",
        createdAt: now,
        updatedAt: now,
      });
    }

    // 2. Fictional Tasks
    const taskSamples = [
      {
        title: "Bayar tagihan listrik PLN",
        description: "Gunakan mobile banking sebelum jam 20:00",
        dueAt: now + 4 * 60 * 60 * 1000, // today in 4 hours
        remindAt: now + 2 * 60 * 60 * 1000,
        timezone: "Asia/Jakarta",
        status: "pending" as const,
        repeatRule: "monthly",
      },
      {
        title: "Beli susu almond & buah naga",
        description: "Untuk sarapan sehat pagi",
        dueAt: now + oneDay,
        timezone: "Asia/Jakarta",
        status: "pending" as const,
      },
      {
        title: "Olahraga pagi jalan santai 30 menit",
        description: "Keliling taman komplek",
        dueAt: now - 8 * 60 * 60 * 1000,
        timezone: "Asia/Jakarta",
        status: "completed" as const,
        completedAt: now - 7 * 60 * 60 * 1000,
        repeatRule: "daily",
      },
      {
        title: "Rencanakan menu masakan minggu depan",
        description: "Cek bahan di kulkas dan resep baru",
        dueAt: now + 3 * oneDay,
        timezone: "Asia/Jakarta",
        status: "pending" as const,
        repeatRule: "weekly",
      },
    ];

    for (const task of taskSamples) {
      await ctx.db.insert("tasks", {
        ownerId: OWNER_ID,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt,
        remindAt: task.remindAt,
        timezone: task.timezone,
        status: task.status,
        repeatRule: task.repeatRule,
        completedAt: task.completedAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3. Fictional Ingredients
    const ingredientData = [
      { name: "Ayam Fillet", unit: "gram", currentPriceIdr: 55 },      // Rp55/gram -> Rp55.000/kg
      { name: "Beras Pandan Wangi", unit: "kg", currentPriceIdr: 15000 },
      { name: "Telur Ayam", unit: "butir", currentPriceIdr: 2500 },
      { name: "Bawang Merah", unit: "gram", currentPriceIdr: 45 },
      { name: "Bawang Putih", unit: "gram", currentPriceIdr: 40 },
      { name: "Kangkung", unit: "ikat", currentPriceIdr: 4000 },
      { name: "Minyak Goreng", unit: "ml", currentPriceIdr: 18 },       // Rp18/ml -> Rp18.000/liter
      { name: "Kecap Manis", unit: "ml", currentPriceIdr: 25 },
    ];

    const ingredientMap: Record<string, { id: Id<"ingredients">; unit: string }> = {};
    for (const ing of ingredientData) {
      const id = await ctx.db.insert("ingredients", {
        ownerId: OWNER_ID,
        name: ing.name,
        unit: ing.unit,
        currentPriceIdr: ing.currentPriceIdr,
        updatedAt: now,
      });
      ingredientMap[ing.name] = { id, unit: ing.unit };
    }

    // 4. Fictional Recipes
    const ayamGorengId = await ctx.db.insert("recipes", {
      ownerId: OWNER_ID,
      name: "Ayam Goreng Gurih",
      servings: 4,
      instructions: "1. Cuci bersih ayam.\n2. Ungkep dengan bumbu bawang & rempah.\n3. Goreng dalam minyak panas hingga kecokelatan.",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("recipeIngredients", {
      recipeId: ayamGorengId,
      ingredientId: ingredientMap["Ayam Fillet"].id,
      quantity: 500,
      unit: "gram",
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId: ayamGorengId,
      ingredientId: ingredientMap["Bawang Putih"].id,
      quantity: 30,
      unit: "gram",
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId: ayamGorengId,
      ingredientId: ingredientMap["Minyak Goreng"].id,
      quantity: 150,
      unit: "ml",
    });

    const tumisKangkungId = await ctx.db.insert("recipes", {
      ownerId: OWNER_ID,
      name: "Tumis Kangkung Bawang",
      servings: 2,
      instructions: "1. Petik dan cuci kangkung.\n2. Tumis irisan bawang merah & bawang putih.\n3. Masukkan kangkung, oseng cepat dengan sedikit kecap manis.",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("recipeIngredients", {
      recipeId: tumisKangkungId,
      ingredientId: ingredientMap["Kangkung"].id,
      quantity: 2,
      unit: "ikat",
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId: tumisKangkungId,
      ingredientId: ingredientMap["Bawang Merah"].id,
      quantity: 20,
      unit: "gram",
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId: tumisKangkungId,
      ingredientId: ingredientMap["Bawang Putih"].id,
      quantity: 15,
      unit: "gram",
    });

    // 5. Initial Audit Log
    await ctx.db.insert("auditLogs", {
      ownerId: OWNER_ID,
      entityType: "system",
      entityId: "seed-init",
      action: "seed",
      summary: "Inisialisasi data contoh fiktif aplikasi",
      changedAt: now,
    });

    return {
      success: true,
      message: "Data contoh fiktif (keuangan, tugas, resep, bahan) berhasil dimuat!",
    };
  },
});

export const clearAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const deletedCounts: Record<string, number> = {
      transactions: 0,
      tasks: 0,
      recipes: 0,
      ingredients: 0,
      recipeIngredients: 0,
      mealPlans: 0,
      shoppingListItems: 0,
      notificationLogs: 0,
      auditLogs: 0,
      budgetCategories: 0,
      budgets: 0,
      savings: 0,
      savingContributions: 0,
    };

    for await (const doc of ctx.db.query("transactions")) {
      await ctx.db.delete(doc._id);
      deletedCounts.transactions++;
    }

    for await (const doc of ctx.db.query("tasks")) {
      await ctx.db.delete(doc._id);
      deletedCounts.tasks++;
    }

    for await (const doc of ctx.db.query("recipes")) {
      await ctx.db.delete(doc._id);
      deletedCounts.recipes++;
    }

    for await (const doc of ctx.db.query("ingredients")) {
      await ctx.db.delete(doc._id);
      deletedCounts.ingredients++;
    }

    for await (const doc of ctx.db.query("recipeIngredients")) {
      await ctx.db.delete(doc._id);
      deletedCounts.recipeIngredients++;
    }

    for await (const doc of ctx.db.query("mealPlans")) {
      await ctx.db.delete(doc._id);
      deletedCounts.mealPlans++;
    }

    for await (const doc of ctx.db.query("shoppingListItems")) {
      await ctx.db.delete(doc._id);
      deletedCounts.shoppingListItems++;
    }

    for await (const doc of ctx.db.query("notificationLogs")) {
      await ctx.db.delete(doc._id);
      deletedCounts.notificationLogs++;
    }

    for await (const doc of ctx.db.query("auditLogs")) {
      await ctx.db.delete(doc._id);
      deletedCounts.auditLogs++;
    }

    for await (const doc of ctx.db.query("budgetCategories")) {
      await ctx.db.delete(doc._id);
      deletedCounts.budgetCategories++;
    }

    for await (const doc of ctx.db.query("budgets")) {
      await ctx.db.delete(doc._id);
      deletedCounts.budgets++;
    }

    for await (const doc of ctx.db.query("savings")) {
      await ctx.db.delete(doc._id);
      deletedCounts.savings++;
    }

    for await (const doc of ctx.db.query("savingContributions")) {
      await ctx.db.delete(doc._id);
      deletedCounts.savingContributions++;
    }

    return {
      success: true,
      message: "Semua data transaksi, tugas, resep, bahan, perencana menu, dan riwayat log berhasil dihapus bersih.",
      deletedCounts,
    };
  },
});

