export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateDatabase } = await import("@/lib/db");
    await migrateDatabase();
  }
}
