
import type { Request, Response } from "express";
import { createPrescription, getPatientPrescriptions } from "../services/prescription.service.js";

export const createPrescriptionController = async (
    req: Request,
    res: Response
) => {
    try {
        const doctorId = String(req.session.userId);
        const appointmentId = String(req.params.appointmentId);

        const { diagnosis, medicines, instructions } = req.body;

        if (diagnosis !== undefined && diagnosis !== null && typeof diagnosis !== "string") {
            res.status(400).json({
                message: "Diagnosis must be a string",
            });
            return;
        }

        if (typeof medicines !== "string" || !medicines.trim()) {
            res.status(400).json({
                message: "Medicines are required",
            });
            return;
        }

        if (instructions !== undefined && instructions !== null && typeof instructions !== "string") {
            res.status(400).json({
                message: "Instructions must be a string",
            });
            return;
        }

        const prescription = await createPrescription({
            appointmentId,
            doctorId,
            diagnosis,
            medicines,
            instructions,
        });

        res.status(201).json({
            message: "Prescription created successfully",
            data: prescription,
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Invalid appointment or doctor ID") {
                res.status(400).json({ message: error.message });
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

            if (error.message === "Prescription cannot be added to this appointment status" || error.message === "A prescription already exists for this appointment" || error.message === "Appointment could not be marked as completed") {
                res.status(409).json({ message: error.message });
                return;
            }

            if (error.message === "A prescription already exists for this appointment") {
                res.status(409).json({ message: error.message });
                return;
            }

            if (error.message === "Medicines are required") {
                res.status(400).json({ message: error.message });
                return;
            }
        }

        console.error("Create prescription error:", error);

        res.status(500).json({
            message: "Failed to create prescription",
        });
    }
};


export const getPatientPrescriptionsController = async (
    req: Request,
    res: Response
) => {
    try {
        const patientId = String(req.session.userId);

        const prescriptions = await getPatientPrescriptions(patientId);

        res.status(200).json({
            message: "Patient prescriptions retrieved successfully",
            data: prescriptions,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Invalid patient ID") {
            res.status(400).json({ message: error.message });
            return;
        }

        console.error("Get patient prescriptions error:", error);

        res.status(500).json({
            message: "Failed to retrieve prescriptions",
        });
    }
};
