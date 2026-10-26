
import type { Request, Response } from "express";
import { bookAppointment, cancelAppointment, completeAppointment, confirmAppointmentReschedule, getDoctorAppointments, getDoctorDashboardStats, getPatientDashboardStats, requestAppointmentReschedule } from "../services/appointment.service.js";
import { getPatientAppointments } from "../services/appointment.service.js";

export const bookAppointmentController = async (
    req: Request,
    res: Response
) => {
    try {
        const { doctorId, slotId } = req.body ?? {};

        if (doctorId === undefined || slotId === undefined || typeof doctorId !== "string" || typeof slotId !== "string") {
            res.status(400).json({
                message: "Doctor ID and slot ID are required as strings",
            });
            return;
        }

        const appointment = await bookAppointment({
            patientId: String(req.session.userId),
            doctorId,
            slotId,
        });

        res.status(201).json({
            message: "Appointment booked successfully",
            data: {
                appointmentId: String(appointment.id),
                patientId: String(appointment.patient_id),
                doctorId: String(appointment.doctor_id),
                slotId: String(appointment.slot_id),
                doctorFee: appointment.doctor_fee,
                commissionFee: appointment.commission_fee,
                totalFee: appointment.total_fee,
                status: appointment.status,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid patient, doctor, or slot ID" || message === "Active patient not found") {
            res.status(400).json({ message });
            return;
        }

        if (message === "Available doctor slot not found" || message === "Doctor fee or commission settings not found") {
            res.status(404).json({ message });
            return;
        }

        if (message === "Slot is not available" || message === "Slot is already booked" || message === "Cannot book a slot in the past") {
            res.status(409).json({ message });
            return;
        }

        if (message === "Invalid fee or commission settings") {
            res.status(500).json({ message });
            return;
        }

        console.error("Book appointment error:", error);
        res.status(500).json({
            message: "Failed to book appointment",
        });
    }
};

export const getPatientAppointmentsController = async (
    req: Request,
    res: Response
) => {
    try {
        const patientId = String(req.session.userId);

        const appointments = await getPatientAppointments(patientId);

        res.status(200).json({
            message: "Patient appointments retrieved successfully",
            data: appointments,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid patient ID") {
            res.status(400).json({ message });
            return;
        }

        console.error("Get patient appointments error:", error);
        res.status(500).json({
            message: "Failed to retrieve patient appointments",
        });
    }
};


export const getDoctorAppointmentsController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = String(req.session.userId);

        const appointments = await getDoctorAppointments(doctorId);

        res.status(200).json({
            message: "Doctor appointments retrieved successfully",
            data: appointments,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid doctor ID") {
            res.status(400).json({ message });
            return;
        }

        console.error("Get doctor appointments error:", error);
        res.status(500).json({
            message: "Failed to retrieve doctor appointments",
        });
    }
};

export const completeAppointmentController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = String(req.session.userId);
        const appointmentId = String(req.params.appointmentId);

        const appointment = await completeAppointment(
            doctorId,
            appointmentId
        );

        res.status(200).json({
            message: "Appointment marked as completed",
            data: appointment,
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Invalid doctor or appointment ID") {
                res.status(400).json({ message: error.message });
                return;
            }

            if (error.message === "Appointment cannot be completed before its scheduled end time") {
                res.status(409).json({ message: error.message });
                return;
            }

            if (error.message === "Appointment not found") {
                res.status(404).json({ message: error.message });
                return;
            }

            if (error.message === "Appointment does not belong to this doctor") {
                res.status(403).json({ message: "Access denied" });
                return;
            }

            if (error.message === "Appointment cannot be completed from its current status") {
                res.status(409).json({ message: error.message });
                return;
            }
        }

        console.error("Complete appointment error:", error);

        res.status(500).json({
            message: "Failed to complete appointment",
        });
    }
};

export const requestAppointmentRescheduleController = async (
    req: Request,
    res: Response
) => {
    try {
        const patientId = String(req.session.userId);
        const appointmentId = String(req.params.appointmentId);
        const { proposedSlotId } = req.body;

        if (typeof proposedSlotId !== "string" && typeof proposedSlotId !== "number") {
            res.status(400).json({
                message: "A valid proposedSlotId is required",
            });
            return;
        }

        const request = await requestAppointmentReschedule(
            patientId,
            appointmentId,
            String(proposedSlotId)
        );

        res.status(201).json({
            message: "Reschedule request created successfully",
            data: request,
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Invalid patient, appointment, or slot ID") {
                res.status(400).json({ message: error.message });
                return;
            }

            if (error.message === "Appointment not found") {
                res.status(404).json({ message: error.message });
                return;
            }

            if (error.message === "Appointment does not belong to this patient") {
                res.status(403).json({ message: "Access denied" });
                return;
            }

            if (error.message === "Appointments cannot be rescheduled within 24 hours") {
                res.status(409).json({ message: error.message });
                return;
            }

            if (error.message === "Appointment cannot be rescheduled from its current status" || error.message === "Rescheduling must use the same doctor" || error.message === "Proposed slot is not available" || error.message === "A reschedule request is already pending") {
                res.status(409).json({ message: error.message });
                return;
            }

            if (error.message === "Proposed slot not found") {
                res.status(404).json({ message: error.message });
                return;
            }
        }

        console.error("Request appointment reschedule error:", error);

        res.status(500).json({
            message: "Failed to create reschedule request",
        });
    }
};


export const confirmAppointmentRescheduleController = async (
    req: Request,
    res: Response
) => {
    try {
        const patientId = String(req.session.userId);
        const appointmentId = String(req.params.appointmentId);
        const requestId = String(req.params.requestId);

        const appointment = await confirmAppointmentReschedule(
            patientId,
            appointmentId,
            requestId
        );

        res.status(200).json({
            message: "Appointment rescheduled successfully",
            data: appointment
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";

        const statusMap: Record<string, number> = {
            "Invalid patient, appointment, or request ID": 400,
            "Reschedule request not found": 404,
            "Proposed slot not found": 404,
            "Appointment does not belong to this patient": 403,
            "Reschedule request is not pending": 409,
            "Appointment cannot be rescheduled from its current status": 409,
            "Appointments cannot be rescheduled within 24 hours": 409,
            "Rescheduling must use the same doctor": 409,
            "Proposed slot is not available": 409,
            "Proposed slot is already booked": 409
        };

        res.status(statusMap[message] ?? 500).json({ message });
    }
};

export const getDoctorDashboardStatsController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const doctorId = String(req.session.userId);

        const stats = await getDoctorDashboardStats(doctorId);

        res.status(200).json({
            message: "Doctor dashboard stats retrieved successfully",
            data: stats
        });
    } catch (error) {
        console.error("Get doctor dashboard stats error:", error);

        res.status(500).json({
            message: "Unable to retrieve doctor dashboard stats"
        });
    }
};

export const getPatientDashboardStatsController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const patientId = String(req.session.userId);

        const stats = await getPatientDashboardStats(patientId);

        res.status(200).json({
            message: "Patient dashboard stats retrieved successfully",
            data: stats
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";

        if (message === "Invalid patient ID") {
            res.status(400).json({ message });
            return;
        }

        console.error("Get patient dashboard stats error:", error);

        res.status(500).json({
            message: "Unable to retrieve patient dashboard stats"
        });
    }
};


export const cancelAppointmentController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = String(req.session.userId);
        const appointmentId = String(req.params.appointmentId);

        const appointment = await cancelAppointment(
            doctorId,
            appointmentId
        );

        res.status(200).json({
            message: "Appointment cancelled successfully",
            data: appointment,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Internal server error";

        const statusMap: Record<string, number> = {
            "Invalid doctor or appointment ID": 400,
            "Appointment not found": 404,
            "Appointment does not belong to this doctor": 403,
            "Appointments cannot be cancelled within 3 hours": 409,
            "Appointment cannot be cancelled from its current status": 409,
        };

        if (statusMap[message]) {
            res.status(statusMap[message]).json({ message });
            return;
        }

        console.error("Cancel appointment error:", error);

        res.status(500).json({
            message: "Failed to cancel appointment",
        });
    }
};
