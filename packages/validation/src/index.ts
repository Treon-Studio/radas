import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid().optional(),
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  isActive: z.boolean().default(true),
});

export const ProjectSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  orgId: z.string().uuid(),
});

export const StackSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  name: z.string().min(2).max(100),
  environment: z.enum(['dev', 'staging', 'prod', 'preview']),
});

export type User = z.infer<typeof UserSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Stack = z.infer<typeof StackSchema>;
