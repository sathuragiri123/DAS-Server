
import cron from "node-cron";
import { processDueReminders } from "./reminderProcessor.service.js";

export const startReminderScheduler = () => {
    cron.schedule("* * * * *", async () => {
        try {
            const result = await processDueReminders();

            if (result.processed > 0) {
                console.log(
                    `Processed ${result.processed} appointment reminder(s).`
                );
            }
        } catch (error) {
            console.error("Reminder scheduler error:", error);
        }
    });

    console.log("Appointment reminder scheduler started.");
};
