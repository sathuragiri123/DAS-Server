
import type { Request, Response } from "express";
import { getAdminUserIds, registerDoctor } from "../services/doctor.service.js";
import { uploadDoctorCertificate, deleteDoctorCertificate, } from "../services/certificateStorage.service.js";
import { createNotification } from "../services/notification.service.js";

export const registerDoctorController = async (
    req: Request,
    res: Response
): Promise<void> => {
    let uploadedPath: string | undefined;

    try {
        const { name, email, password, specialization, qualification, bio, consultationFee, doctorNameOnCertificate, certificateSpecialization, } = req.body;

        if (!req.file) {
            res.status(400).json({
                message: "Doctor certificate is required",
            });
            return;
        }

        if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || typeof specialization !== "string" || typeof qualification !== "string" || typeof doctorNameOnCertificate !== "string" || typeof certificateSpecialization !== "string") {
            res.status(400).json({
                message: "Please provide all required registration fields",
            });
            return;
        }

        const fee = Number(consultationFee);

        if (consultationFee === undefined || String(consultationFee).trim() === "" || !Number.isFinite(fee) || fee < 0) {
            res.status(400).json({
                message: "Consultation fee must be a valid non-negative number",
            });
            return;
        }

        if (bio !== undefined && typeof bio !== "string") {
            res.status(400).json({
                message: "Bio must be a string",
            });
            return;
        }

        uploadedPath = await uploadDoctorCertificate(req.file);

        const user = await registerDoctor({
            name,
            email,
            password,
            specialization,
            qualification,
            bio,
            consultationFee: fee,
            doctorNameOnCertificate,
            certificateSpecialization,
            certificatePath: uploadedPath,
        });

        const adminIds = await getAdminUserIds();

        await Promise.all(
            adminIds.map((adminId) =>
                createNotification({
                    userId: adminId,
                    type: "doctor_registration",
                    title: "New doctor registration",
                    message: `${user.name} has registered and is awaiting admin approval.`,
                })
            )
        );

        res.status(201).json({
            message: "Doctor registered successfully. Awaiting admin approval.",
            data: user,
        });
    } catch (error: unknown) {
        if (uploadedPath) {
            try {
                await deleteDoctorCertificate(uploadedPath);
            } catch (cleanupError) {
                console.error(
                    "Could not clean up certificate after failed registration:",
                    cleanupError
                );
            }
        }

        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
            res.status(409).json({
                message: "An account with this email already exists",
            });
            return;
        }

        if (error instanceof Error) {
            const validationMessages = [
                "All required fields must be provided",
                "Password must be at least 8 characters",
                "Consultation fee must be a valid non-negative number",
            ];

            if (validationMessages.includes(error.message)) {
                res.status(400).json({
                    message: error.message,
                });
                return;
            }

            if (error.message.includes("Certificate must") || error.message === "A certificate file is required") {
                res.status(400).json({
                    message: error.message,
                });
                return;
            }
        }

        console.error("Doctor registration error:", error);

        res.status(500).json({
            message: "Unable to register doctor",
        });
    }
};
