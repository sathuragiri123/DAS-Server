import type { Request, Response } from "express";
import { getAdminDashboardStats, getAdminPatients, getCommissionSettings, getDoctorCertificateUrl, getPendingDoctors, reviewDoctorApplication, reviewDoctorCertificate, updateCommissionSettings } from "../services/admin.service.js";
import { pool } from "../config/database.js";
import { createNotification } from "../services/notification.service.js";

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

        try {
            await createNotification({
                userId: doctorId,
                type: "doctor_application_review",
                title:
                    decision === "approved"
                        ? "Doctor application approved"
                        : "Doctor application rejected",
                message:
                    decision === "approved"
                        ? "Congratulations! Your doctor application has been approved. You can now access doctor features."
                        : "Your doctor application has been rejected. Please contact the administrator for more information.",
            });
        } catch (notificationError) {
            console.error(
                "Failed to create doctor review notification:",
                notificationError
            );
        }

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


export const getAdminPatientsController = async (
    req: Request,
    res: Response
) => {
    try {
        const patients = await getAdminPatients();

        res.status(200).json({
            message: "Patients retrieved successfully",
            data: patients,
        });
    } catch (error) {
        console.error("Get admin patients error:", error);

        res.status(500).json({
            message: "Unable to retrieve patients",
        });
    }
};

export const getCommissionSettingsController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const settings = await getCommissionSettings();

        res.status(200).json({
            message: "Commission settings retrieved successfully",
            data: settings,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Commission settings not found"
        ) {
            res.status(503).json({ message: error.message });
            return;
        }

        console.error("Get commission settings error:", error);

        res.status(500).json({
            message: "Unable to retrieve commission settings",
        });
    }
};