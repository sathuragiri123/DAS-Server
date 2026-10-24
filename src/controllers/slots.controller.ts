
import type { Request, Response } from "express";
import { getAvailableDoctorSlots } from "../services/slots.service.js";

export const getAvailableDoctorSlotsController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = req.params.doctorId;
        const date = req.query.date;

        if (typeof doctorId !== "string" || typeof date !== "string") {
            res.status(400).json({
                message: "Doctor ID and date are required",
            });
            return;
        }

        const slots = await getAvailableDoctorSlots(doctorId, date);

        res.status(200).json({
            message: "Doctor slots retrieved successfully",
            data: slots,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid doctor ID" || message === "Invalid date") {
            res.status(400).json({ message });
            return;
        }

        if (message === "Approved doctor not found") {
            res.status(404).json({ message });
            return;
        }

        console.error("Get doctor slots error:", error);
        res.status(500).json({
            message: "Failed to retrieve doctor slots",
        });
    }
};
