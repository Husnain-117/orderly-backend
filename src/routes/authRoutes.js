import { Router } from 'express';
import { listDistributors } from '../controllers/authController.js';
import { sendOtp, verifyOtp, register, login, logout, me, forgotPasswordSendOtp, resetPassword, getProfile, updateProfile } from '../controllers/authController.js';

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

export default router;
