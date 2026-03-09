const kuzu = require('kuzu');
const path = require('path');
const fs = require('fs');

async function test() {
    const dbPath = path.join(process.cwd(), 'data', 'kuzu_test');
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    console.log("Initializing DB at:", dbPath);
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);

    console.log("Creating table...");
    await conn.query("CREATE NODE TABLE Test(id SERIAL, name STRING, PRIMARY KEY (id))");

    console.log("Inserting data...");
    await conn.query("CREATE (:Test {name: 'Hello World'})");

    console.log("Querying data...");
    const res = await conn.query("MATCH (t:Test) RETURN t.name");
    const row = await res.getNext();
    console.log("Result:", row[0]);

    await db.close();
    console.log("Done");
}

test().catch(err => {
    console.error("Test Failed:", err);
    process.exit(1);
});
