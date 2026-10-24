
import type { Request, Response } from "express";
import { createDoctorAvailability } from "../services/availability.service.js";

export const createAvailabilityController = async (
    req: Request,
    res: Response
) => {
    try {
        const { availabilityDate, startTime, endTime, slotDurationMinutes, maxAppointments } = req.body ?? {};

        if (!availabilityDate || !startTime || !endTime || slotDurationMinutes === undefined || maxAppointments === undefined) {
            res.status(400).json({
                message: "Availability date, start time, end time, slot duration, and maximum appointments are required",
            });
            return;
        }

        const result = await createDoctorAvailability({
            doctorId: String(req.session.userId),
            availabilityDate,
            startTime,
            endTime,
            slotDurationMinutes: Number(slotDurationMinutes),
            maxAppointments: Number(maxAppointments),
        });

        res.status(201).json({
            message: "Doctor availability created successfully",
            data: result,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid doctor ID" || message === "Slot duration must be a positive integer" || message === "Maximum appointments must be a positive integer" || message === "Invalid availability date" || message === "End time must be after start time" || message === "Availability times must fall on the selected date" || message === "Availability must start in the future" || message === "Approved doctor not found" || message === "Maximum appointments exceeds available slots") {
            res.status(400).json({ message });
            return;
        }

        console.error("Create availability error:", error);
        res.status(500).json({ message: "Failed to create doctor availability" });
    }
};
