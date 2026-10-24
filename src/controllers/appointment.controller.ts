
import type { Request, Response } from "express";
import { bookAppointment, completeAppointment, getDoctorAppointments } from "../services/appointment.service.js";

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


import { getPatientAppointments } from "../services/appointment.service.js";

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
