
import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./config/database.js";

import authRoutes from "./routes/auth.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import { startReminderScheduler } from "./services/reminderScheduler.service.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const allowedOrigins = ["http://localhost:5173", "https://carepoint-cp.vercel.app",];
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from the .env file");
}

const PgSession = connectPgSimple(session);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);

app.use(
    session({
        store: new PgSession({
            pool,
            tableName: "user_sessions",
            createTableIfMissing: true,
        }),
        name: "doctor_appointment_sid",
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 1000 * 60 * 60 * 24,
        },
    })
);

app.get("/api/health", async (_req, res) => {
    try {
        await pool.query("SELECT 1");

        res.status(200).json({
            message: "Doctor Appointment System API is running",
            database: "connected",
        });
    } catch (error) {
        console.error("Health check failed:", error);

        res.status(503).json({
            message: "Database connection unavailable",
        });
    }
});

app.use("/api/auth", authRoutes);

app.use("/api/doctors", doctorRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/appointments", appointmentRoutes);

app.use("/api/notifications", notificationsRoutes);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    startReminderScheduler();
});
