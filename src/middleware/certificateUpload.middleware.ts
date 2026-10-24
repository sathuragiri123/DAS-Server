
import multer from "multer";
import type { Request } from "express";

const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
];

export const certificateUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        callback
    ) => {
        if (!allowedTypes.includes(file.mimetype)) {
            callback(
                new Error("Certificate must be a PDF, JPEG, or PNG file")
            );
            return;
        }

        callback(null, true);
    },
});
