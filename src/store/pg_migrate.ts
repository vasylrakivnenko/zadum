/** `npm run db:migrate` — creates/updates the Postgres schema (DATABASE_URL required). */
import { PgStore } from "./pg_store.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const store = await PgStore.connect(url);
console.log("migrations applied");
await store.close();
