/**
 * Prepares a database for MessMate.
 *
 * This only creates indexes. Demo content is no longer written here: the app
 * builds it on demand when someone opens a demo, scoped to the current month,
 * so there is one definition of it instead of two that drift apart.
 *
 *   node --env-file=.env scripts/seed.mjs
 */
import { setServers } from "node:dns";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is missing. Copy .env.example to .env and set it first.");
  process.exit(1);
}

async function connect() {
  try {
    return await new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 }).connect();
  } catch (error) {
    // Some networks refuse SRV lookups; retry once against public resolvers.
    const srvFailure =
      uri.startsWith("mongodb+srv://") && String(error).includes("querySrv ECONNREFUSED");
    if (!srvFailure) throw error;
    setServers(["8.8.8.8", "1.1.1.1"]);
    return new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 }).connect();
  }
}

// Keep this list in step with `ensureIndexes` in src/lib/data.ts.
const indexes = [
  ["users", { email: 1 }, { unique: true }],
  ["users", { id: 1 }, { unique: true }],
  ["sessions", { token: 1 }, { unique: true }],
  ["sessions", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ["messes", { joinCode: 1 }, { unique: true }],
  ["messes", { id: 1 }, { unique: true }],
  ["members", { messId: 1, email: 1 }, { unique: true }],
  ["members", { userId: 1, status: 1 }, {}],
  ["meals", { messId: 1, userId: 1, date: 1 }, { unique: true }],
  ["meals", { messId: 1, date: 1 }, {}],
  ["expenses", { messId: 1, date: -1 }, {}],
  ["bazar", { messId: 1, date: -1 }, {}],
  ["activity", { messId: 1, createdAt: -1 }, {}],
  ["rooms", { messId: 1 }, {}],
  ["listings", { slug: 1 }, { unique: true }],
  ["listings", { messId: 1 }, {}],
  ["listings", { status: 1, publishedAt: -1 }, {}],
  ["listingPhotos", { id: 1 }, { unique: true }],
  ["listingPhotos", { listingId: 1 }, {}],
];

const client = await connect();
try {
  const db = client.db(process.env.MONGODB_DB ?? "messmate");
  for (const [collection, keys, options] of indexes) {
    await db.collection(collection).createIndex(keys, options);
    console.log(`  index ${collection} ${JSON.stringify(keys)}`);
  }
  console.log(`\nReady: ${db.databaseName} has ${indexes.length} indexes.`);
  console.log("Start the app and use the demo buttons, or sign up and create a mess.");
} finally {
  await client.close();
}
