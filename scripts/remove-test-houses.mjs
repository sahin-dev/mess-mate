/**
 * Removes houses created by automated end-to-end runs.
 *
 * Those runs name their houses "<Something> House <epoch-ms>", so they are
 * identifiable without guessing. Everything belonging to a matched house goes:
 * its members, meals, bazar, expenses and listings. Real houses, and the demo
 * house the app builds on demand, are never matched.
 *
 * Lists what it would remove and changes nothing:
 *   node --env-file=.env scripts/remove-test-houses.mjs
 *
 * Actually removes it:
 *   node --env-file=.env scripts/remove-test-houses.mjs --delete
 */
import { setServers } from "node:dns";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is missing. Copy .env.example to .env and set it first.");
  process.exit(1);
}

const apply = process.argv.includes("--delete");

// "Nodi House 1789550659323" — a fixture name ends in a 13-digit timestamp.
const FIXTURE_NAME = /\sHouse\s1\d{12}$/;

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

const client = await connect();
try {
  const db = client.db(process.env.MONGODB_DB?.trim() || "messmate");
  const messes = await db.collection("messes").find({}).toArray();
  const fixtures = messes.filter((mess) => FIXTURE_NAME.test(mess.name ?? ""));

  if (fixtures.length === 0) {
    console.log("No test houses found. Nothing to remove.");
    process.exit(0);
  }

  const messIds = fixtures.map((mess) => mess.id);
  const owned = ["members", "meals", "bazar", "expenses", "listings", "notifications"];
  const counts = Object.fromEntries(
    await Promise.all(
      owned.map(async (name) => [
        name,
        await db.collection(name).countDocuments({ messId: { $in: messIds } }),
      ]),
    ),
  );

  console.log(`${fixtures.length} test house(s):`);
  for (const mess of fixtures) console.log(`  ${mess.name}`);
  console.log("\nattached records:");
  for (const [name, count] of Object.entries(counts)) console.log(`  ${name}: ${count}`);

  if (!apply) {
    console.log("\nDry run. Re-run with --delete to remove all of the above.");
    process.exit(0);
  }

  for (const name of owned) {
    const { deletedCount } = await db.collection(name).deleteMany({ messId: { $in: messIds } });
    console.log(`removed ${deletedCount} from ${name}`);
  }
  // Sessions pointing at a deleted house would strand those users on a blank
  // workspace, so detach them first.
  await db
    .collection("sessions")
    .updateMany(
      { activeMessId: { $in: messIds } },
      { $set: { activeMessId: null, role: null } },
    );
  const { deletedCount } = await db.collection("messes").deleteMany({ id: { $in: messIds } });
  console.log(`removed ${deletedCount} houses`);
  console.log("\nDone. Published listings are cached, so redeploy or touch /community to refresh.");
} finally {
  await client.close();
}
