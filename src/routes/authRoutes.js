import { Router } from 'express';
import { listDistributors } from '../controllers/authController.js';
import { sendOtp, verifyOtp, register, login, logout, me, forgotPasswordSendOtp, resetPassword, getProfile, updateProfile, salespersonRequestLink, salespersonLinkStatus, distributorListSalespersonRequests, distributorApproveSalespersonRequest, distributorRejectSalespersonRequest, distributorListSalespersons, distributorUnlinkSalesperson } from '../controllers/authController.js';

const router = Router();

// Public: list all distributors
router.get('/distributors', listDistributors);

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', me);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/forgot-password/send-otp', forgotPasswordSendOtp);
router.post('/forgot-password/reset', resetPassword);

// Salesperson first-login linking flow
router.post('/salesperson/link-request', salespersonRequestLink);
router.get('/salesperson/link-status', salespersonLinkStatus);

// Distributor review/approval of salesperson link requests
router.get('/distributor/sales-requests', distributorListSalespersonRequests);
router.post('/distributor/sales-requests/:id/approve', distributorApproveSalespersonRequest);
router.post('/distributor/sales-requests/:id/reject', distributorRejectSalespersonRequest);

// Distributor manage linked salespersons
router.get('/distributor/salespersons', distributorListSalespersons);
router.delete('/distributor/salespersons/:salespersonId', distributorUnlinkSalesperson);

export default router;
