import type { Request, Response } from "express";
import { getApprovedDoctors } from "../services/doctorDirectory.service.js";

export const getApprovedDoctorsController = async (
    _req: Request,
    res: Response
): Promise<void> => {
    try {
        const doctors = await getApprovedDoctors();

        res.status(200).json({
            message: "Approved doctors retrieved successfully",
            data: doctors,
        });
    } catch (error) {
        console.error("Get approved doctors error:", error);

        res.status(500).json({
            message: "Unable to retrieve approved doctors",
        });
    }
};