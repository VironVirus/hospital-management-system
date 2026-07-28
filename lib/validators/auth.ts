import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your login ID"),
  password: z.string().min(1, "Enter your password")
});

export type LoginFormValues = z.infer<typeof loginSchema>;
