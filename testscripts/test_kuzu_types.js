const kuzu = require('kuzu');
const path = require('path');
const fs = require('fs');

async function test() {
    const dbPath = path.join(process.cwd(), 'data', 'kuzu_test_simple');
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    console.log("Initializing DB at:", dbPath);
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);

    console.log("Creating table with SERIAL PRIMARY KEY...");
    try {
        await conn.query("CREATE NODE TABLE Test(id SERIAL, name STRING, PRIMARY KEY (id))");
        console.log("✅ Table created");
    } catch (e) {
        console.error("❌ CREATE failed:", e.message);
    }

    await db.close();
}

test().catch(err => {
    console.error("Test Failed:", err);
    process.exit(1);
});
