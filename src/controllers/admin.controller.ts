import type { Request, Response } from "express";
import { getAdminDashboardStats, getDoctorCertificateUrl, getPendingDoctors, reviewDoctorApplication, reviewDoctorCertificate, updateCommissionSettings } from "../services/admin.service.js";
import { pool } from "../config/database.js";

export const getPendingDoctorsController = async (
    _req: Request,
    res: Response
): Promise<void> => {
    try {
        const doctors = await getPendingDoctors();

        res.status(200).json({
            message: "Pending doctors retrieved successfully",
            data: doctors,
        });
    } catch (error) {
        console.error("Get pending doctors error:", error);

        res.status(500).json({
            message: "Unable to retrieve pending doctors",
        });
    }
};

export const getDoctorCertificateController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const certificateId = req.params.certificateId;

        if (typeof certificateId !== "string" || !/^\d+$/.test(certificateId)) {
            res.status(400).json({
                message: "Invalid certificate ID",
            });
            return;
        }

        const result = await pool.query(
            `SELECT certificate_url
                FROM public.doctor_certificates
                WHERE id = $1`,
            [certificateId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                message: "Certificate not found",
            });
            return;
        }

        const signedUrl = await getDoctorCertificateUrl(
            result.rows[0].certificate_url
        );

        res.status(200).json({
            message: "Certificate URL generated successfully",
            data: { signedUrl },
        });
    } catch (error) {
        console.error("Get doctor certificate error:", error);

        res.status(500).json({
            message: "Unable to access doctor certificate",
        });
    }
};

export const reviewDoctorApplicationController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const doctorId = req.params.doctorId;
        const { decision } = req.body;

        if (typeof doctorId !== "string" || !/^\d+$/.test(doctorId)) {
            res.status(400).json({
                message: "Invalid doctor ID",
            });
            return;
        }

        if (decision !== "approved" && decision !== "rejected") {
            res.status(400).json({
                message: "Decision must be approved or rejected",
            });
            return;
        }

        const adminId = req.session.userId;

        if (!adminId) {
            res.status(401).json({
                message: "Authentication required",
            });
            return;
        }

        const result = await reviewDoctorApplication(
            doctorId,
            decision,
            adminId
        );

        res.status(200).json({
            message: `Doctor application ${decision} successfully`,
            data: result,
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Doctor not found") {
                res.status(404).json({ message: error.message });
                return;
            }

            if (error.message === "All doctor certificates must be approved first") {
                res.status(400).json({ message: error.message });
                return;
            }
        }

        console.error("Review doctor application error:", error);

        res.status(500).json({
            message: "Unable to review doctor application",
        });
    }
};

export const reviewDoctorCertificateController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const certificateId = req.params.certificateId;
        const decision = req.body?.decision;

        if (typeof certificateId !== "string" || !/^\d+$/.test(certificateId)) {
            res.status(400).json({
                message: "Invalid certificate ID",
            });
            return;
        }

        if (decision !== "approved" && decision !== "rejected") {
            res.status(400).json({
                message: "Decision must be approved or rejected",
            });
            return;
        }

        const adminId = req.session.userId;

        if (!adminId) {
            res.status(401).json({
                message: "Authentication required",
            });
            return;
        }

        const result = await reviewDoctorCertificate(
            certificateId,
            decision,
            adminId
        );

        res.status(200).json({
            message: `Certificate ${decision} successfully`,
            data: result,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Certificate not found") {
            res.status(404).json({
                message: error.message,
            });
            return;
        }

        console.error("Review doctor certificate error:", error);

        res.status(500).json({
            message: "Unable to review doctor certificate",
        });
    }
};

export const updateCommissionSettingsController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { mode, value } = req.body ?? {};

        if (mode !== "fixed" && mode !== "percentage") {
            res.status(400).json({
                message: "Mode must be fixed or percentage",
            });
            return;
        }

        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            res.status(400).json({
                message: "Commission value must be a non-negative number",
            });
            return;
        }

        if (mode === "percentage" && value > 100) {
            res.status(400).json({
                message: "Percentage commission cannot exceed 100",
            });
            return;
        }

        const result = await updateCommissionSettings(mode, value);

        res.status(200).json({
            message: "Commission settings updated successfully",
            data: result,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Commission settings not found") {
            res.status(503).json({
                message: error.message,
            });
            return;
        }

        console.error("Update commission settings error:", error);

        res.status(500).json({
            message: "Unable to update commission settings",
        });
    }
};

export const getAdminDashboardStatsController = async (
    _req: Request,
    res: Response
): Promise<void> => {
    try {
        const stats = await getAdminDashboardStats();

        res.status(200).json({
            message: "Admin dashboard stats retrieved successfully",
            data: stats
        });
    } catch (error) {
        console.error("Get admin dashboard stats error:", error);

        res.status(500).json({
            message: "Unable to retrieve admin dashboard stats"
        });
    }
};