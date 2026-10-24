
import { Router } from "express";
import { bookAppointmentController, completeAppointmentController, confirmAppointmentRescheduleController, getDoctorAppointmentsController, getPatientAppointmentsController, requestAppointmentRescheduleController } from "../controllers/appointment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { createPrescriptionController, getPatientPrescriptionsController } from "../controllers/prescription.controller.js";

const router = Router();

router.post("/", requireAuth, requireRole("patient"), bookAppointmentController);
router.get("/my-booking-slots", requireAuth, requireRole("patient"), getPatientAppointmentsController);
router.get("/doctor", requireAuth, requireRole("doctor"), getDoctorAppointmentsController);
router.patch("/:appointmentId/complete", requireAuth, requireRole("doctor"), completeAppointmentController);
router.post("/:appointmentId/prescriptions", requireAuth, requireRole("doctor"), createPrescriptionController);
router.get("/my/prescriptions", requireAuth, requireRole("patient"), getPatientPrescriptionsController);
router.post("/:appointmentId/reschedule-requests", requireAuth, requireRole("patient"), requestAppointmentRescheduleController);
router.patch("/:appointmentId/reschedule-requests/:requestId/confirm", requireAuth, requireRole("patient"), confirmAppointmentRescheduleController);


export default router;
