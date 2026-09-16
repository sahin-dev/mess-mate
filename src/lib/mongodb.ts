import { Db, MongoClient } from "mongodb";
import { setServers } from "node:dns";
import { mongoDbName, mongoUri } from "@/lib/env";

const globalForMongo = globalThis as typeof globalThis & {
  messMateMongoClient?: Promise<MongoClient>;
};

export async function getDb(): Promise<Db> {
  if (!globalForMongo.messMateMongoClient) {
    // Cache the promise, not the client, so concurrent callers share one connect().
    globalForMongo.messMateMongoClient = connectMongo().catch((error) => {
      // A failed connect must not be cached, or every later request inherits it.
      globalForMongo.messMateMongoClient = undefined;
      throw error;
    });
  }
  const client = await globalForMongo.messMateMongoClient;
  return client.db(mongoDbName());
}

const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10_000,
  retryWrites: true,
} as const;

async function connectMongo() {
  const uri = mongoUri();
  try {
    return await new MongoClient(uri, options).connect();
  } catch (error) {
    // Some networks refuse SRV lookups; retry once against public resolvers.
    const isSrvDnsFailure =
      uri.startsWith("mongodb+srv://") &&
      error instanceof Error &&
      error.message.includes("querySrv ECONNREFUSED");
    if (!isSrvDnsFailure) throw error;
    setServers(["8.8.8.8", "1.1.1.1"]);
    return new MongoClient(uri, options).connect();
  }
}
