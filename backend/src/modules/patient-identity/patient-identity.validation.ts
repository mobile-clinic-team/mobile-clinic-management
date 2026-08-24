import { z } from 'zod';

const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);

// Matches the DB CHECK constraint `email ~* '^[A-Za-z0-9._%+-]+@...'`
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format');

// Reasonable minimum strength; adjust to org security policy.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1, 'Full name is required').max(150),
  phoneNumber: z.string().trim().max(20).optional(),
  dob: z.string().date('dob must be an ISO date (YYYY-MM-DD)').optional(),
  gender: genderEnum.optional(),
  address: z.string().trim().max(2000).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150).optional(),
    phoneNumber: z.string().trim().max(20).optional(),
    dob: z.string().date('dob must be an ISO date (YYYY-MM-DD)').optional(),
    gender: genderEnum.optional(),
    address: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});
