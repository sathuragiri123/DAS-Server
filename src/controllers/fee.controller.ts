import type { Request, Response } from "express";
import { calculateConsultationFee } from "../services/fee.service.js";

export const calculateConsultationFeeController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const doctorId = req.params.doctorId;

        if (typeof doctorId !== "string" || !/^\d+$/.test(doctorId)) {
            res.status(400).json({
                message: "Invalid doctor ID",
            });
            return;
        }

        const fee = await calculateConsultationFee(doctorId);

        res.status(200).json({
            message: "Consultation fee calculated successfully",
            data: fee,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Approved doctor not found") {
            res.status(404).json({
                message: error.message,
            });
            return;
        }

        if (error instanceof Error && error.message === "Commission settings not found") {
            res.status(503).json({
                message: error.message,
            });
            return;
        }

        console.error("Calculate consultation fee error:", error);

        res.status(500).json({
            message: "Unable to calculate consultation fee",
        });
    }
};