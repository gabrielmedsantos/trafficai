import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function test(url: string, name: string) {
    if (!url) return;

    const client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log(`✅ ${name} (FIXED USER) connected! Time:`, res.rows[0].now);
        await client.end();
    } catch (e: any) {
        console.log(`❌ ${name} (FIXED USER) failed:`, e.message);
    }
}

async function main() {
    console.log("Testing FIXED database connections...");
    await test(process.env.DATABASE_URL as string, "DATABASE_URL");
    await test(process.env.DIRECT_URL as string, "DIRECT_URL");
}

main();
