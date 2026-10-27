
import { Router } from "express";
import { bookAppointmentController, cancelAppointmentController, completeAppointmentController, confirmAppointmentRescheduleController, getAdminAppointmentsController, getDoctorAppointmentsController, getDoctorDashboardStatsController, getPatientAppointmentsController, getPatientDashboardStatsController, requestAppointmentRescheduleController } from "../controllers/appointment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { createPrescriptionController, getPatientPrescriptionsController } from "../controllers/prescription.controller.js";

const router = Router();

router.post("/", requireAuth, requireRole("patient"), bookAppointmentController);
router.patch("/:appointmentId/cancel", requireAuth, requireRole("doctor"), cancelAppointmentController);
router.get("/my-booking-slots", requireAuth, requireRole("patient"), getPatientAppointmentsController);
router.get("/doctor", requireAuth, requireRole("doctor"), getDoctorAppointmentsController);
router.get("/admin", requireAuth, requireRole("admin"), getAdminAppointmentsController);
router.patch("/:appointmentId/complete", requireAuth, requireRole("doctor"), completeAppointmentController);
router.post("/:appointmentId/prescriptions", requireAuth, requireRole("doctor"), createPrescriptionController);
router.get("/my/prescriptions", requireAuth, requireRole("patient"), getPatientPrescriptionsController);
router.post("/:appointmentId/reschedule-requests", requireAuth, requireRole("patient"), requestAppointmentRescheduleController);
router.patch("/:appointmentId/reschedule-requests/:requestId/confirm", requireAuth, requireRole("patient"), confirmAppointmentRescheduleController);
router.get("/doctor/dashboard/stats", requireAuth, requireRole("doctor"), getDoctorDashboardStatsController);
router.get("/my/dashboard/stats", requireAuth, requireRole("patient"), getPatientDashboardStatsController);

export default router;
