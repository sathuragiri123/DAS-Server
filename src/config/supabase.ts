
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Supabase environment variables are missing");
}

export const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        realtime: {
            transport: ws as any,
        },
    }
);

export const storageBucket =
    process.env.SUPABASE_STORAGE_BUCKET;

if (!storageBucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is missing");
}
