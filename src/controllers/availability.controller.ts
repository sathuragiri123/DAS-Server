
import type { Request, Response } from "express";
import { createDoctorAvailability, getMyDoctorAvailability, markDoctorAvailabilityUnavailable, markDoctorTimeRangeUnavailable } from "../services/availability.service.js";

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


export const markDoctorAvailabilityUnavailableController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = String(req.session.userId);
        const availabilityId = String(req.params.availabilityId);

        const result = await markDoctorAvailabilityUnavailable(
            doctorId,
            availabilityId
        );

        res.status(200).json({
            message: "Availability marked unavailable successfully",
            data: result
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";

        const statusMap: Record<string, number> = {
            "Invalid doctor or availability ID": 400,
            "Availability not found": 404,
            "Availability is not available": 409
        };

        res.status(statusMap[message] ?? 500).json({ message });
    }
};

export const markDoctorTimeRangeUnavailableController = async (
    req: Request,
    res: Response
) => {
    try {
        const {
            availabilityDate,
            startTime,
            endTime,
            reason,
        } = req.body ?? {};

        if (!availabilityDate || !startTime || !endTime) {
            res.status(400).json({
                message: "Availability date, start time, and end time are required",
            });
            return;
        }

        if (reason !== undefined && typeof reason !== "string") {
            res.status(400).json({
                message: "Reason must be a string",
            });
            return;
        }

        const result = await markDoctorTimeRangeUnavailable({
            doctorId: String(req.session.userId),
            availabilityDate,
            startTime,
            endTime,
            reason,
        });

        res.status(200).json({
            message: "Selected time range marked unavailable successfully",
            data: result,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Internal server error";

        const statusMap: Record<string, number> = {
            "Invalid doctor ID": 400,
            "Invalid availability date": 400,
            "Invalid time format": 400,
            "End time must be after start time": 400,
            "Unavailable period must start in the future": 400,
            "No available schedule overlaps the selected time range": 404,
            "No appointment slots overlap the selected time range": 404,
        };

        const status = statusMap[message];

        if (status) {
            res.status(status).json({ message });
            return;
        }

        console.error("Mark time range unavailable error:", error);
        res.status(500).json({
            message: "Failed to mark selected time range unavailable",
        });
    }
};

export const getMyDoctorAvailabilityController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = String(req.session.userId);

        const result = await getMyDoctorAvailability(doctorId);

        res.status(200).json({
            message: "Doctor availability retrieved successfully",
            data: result,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid doctor ID") {
            res.status(400).json({ message });
            return;
        }

        console.error("Get doctor availability error:", error);

        res.status(500).json({
            message: "Failed to retrieve doctor availability",
        });
    }
};