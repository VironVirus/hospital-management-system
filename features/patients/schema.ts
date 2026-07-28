import { z } from "zod";
import { getNigeriaLgas } from "@/lib/nigeria-locations";

export const sexOptions = ["Female", "Male", "Other"] as const;

function isValidDateInput(value: string) {
  if (!value) {
    return true;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export const patientFormSchema = z.object({
  lab_id: z.string().trim().max(40, "Hospital ID must be 40 characters or fewer"),
  name: z.string().trim().min(2, "Enter the patient's full name"),
  phone: z.string().trim().max(20, "Phone number is too long"),
  dob: z
    .string()
    .trim()
    .refine(isValidDateInput, "Enter a valid date of birth"),
  sex: z.union([z.literal(""), z.enum(sexOptions)]),
  address: z.string().trim().max(300, "Address is too long"),
  email: z
    .string()
    .trim()
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Enter a valid email address"
    }),
  emergency_contact: z
    .string()
    .trim()
    .max(120, "Emergency contact is too long"),
  national_id: z.string().trim().max(40, "National ID is too long"),
  lga: z.string().trim().min(1, "Select a local government area").max(120, "LGA is too long"),
  state: z.string().trim().min(1, "Select a state").max(120, "State is too long"),
  notes: z.string().trim().max(400, "Notes are too long"),
  ndpr_consent: z.boolean().refine((value) => value, {
    message: "Patient consent is required before registration"
  })
}).superRefine((value, context) => {
  const lgas = getNigeriaLgas(value.state);
  if (value.state && value.lga && lgas.length > 0 && !lgas.some((lga) => lga === value.lga)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select a local government area from the chosen state",
      path: ["lga"]
    });
  }
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export const initialPatientFormState: PatientFormValues = {
  lab_id: "",
  name: "",
  phone: "",
  dob: "",
  sex: "",
  address: "",
  email: "",
  emergency_contact: "",
  national_id: "",
  lga: "",
  state: "",
  notes: "",
  ndpr_consent: false
};
