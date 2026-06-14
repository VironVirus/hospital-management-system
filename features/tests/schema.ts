import { z } from "zod";
import { testCategories } from "@/features/tests/categories";

export const resultTypes = ["numeric", "text", "boolean", "panel"] as const;

const numericReferenceRangeSchema = z.object({
  mode: z.literal("numeric"),
  min: z.coerce.number().nullable(),
  max: z.coerce.number().nullable(),
  text: z.null(),
  options: z.null(),
  positive_label: z.null(),
  negative_label: z.null()
});

const textReferenceRangeSchema = z.object({
  mode: z.literal("text"),
  min: z.null(),
  max: z.null(),
  text: z.string().trim().min(1, "Reference range text is required"),
  options: z.null(),
  positive_label: z.null(),
  negative_label: z.null()
});

const selectReferenceRangeSchema = z.object({
  mode: z.literal("select"),
  min: z.null(),
  max: z.null(),
  text: z.string().trim().nullable(),
  options: z
    .array(z.string().trim().min(1, "Dropdown options cannot be empty"))
    .min(2, "Provide at least two dropdown options"),
  positive_label: z.null(),
  negative_label: z.null()
});

const booleanReferenceRangeSchema = z.object({
  mode: z.literal("boolean"),
  min: z.null(),
  max: z.null(),
  text: z.string().trim().nullable(),
  options: z.null(),
  positive_label: z.string().trim().min(1, "Positive label is required"),
  negative_label: z.string().trim().min(1, "Negative label is required")
});

const parameterReferenceRangeSchema = z.union([
  numericReferenceRangeSchema,
  textReferenceRangeSchema,
  selectReferenceRangeSchema,
  booleanReferenceRangeSchema
]);

const panelReferenceRangeSchema = z.object({
  mode: z.literal("panel"),
  min: z.null(),
  max: z.null(),
  text: z.string().trim().nullable(),
  options: z.null(),
  positive_label: z.null(),
  negative_label: z.null(),
  parameters: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1, "Parameter name is required"),
        result_type: z.enum(["numeric", "text", "boolean", "select"]),
        unit: z.string().trim().max(30, "Unit must be 30 characters or fewer").nullable(),
        reference_range: parameterReferenceRangeSchema
      })
    )
    .min(1, "Add at least one parameter")
});

export const referenceRangeSchema = z.union([
  numericReferenceRangeSchema.superRefine((value, ctx) => {
    if (value.min === null && value.max === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least a minimum or maximum value"
      });
    }

    if (
      value.min !== null &&
      value.max !== null &&
      Number(value.min) > Number(value.max)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum reference value cannot exceed maximum"
      });
    }
  }),
  textReferenceRangeSchema,
  selectReferenceRangeSchema,
  booleanReferenceRangeSchema,
  panelReferenceRangeSchema
]);

export const testFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    test_code: z.string().trim().max(20, "Test ID must be 20 characters or fewer").optional(),
    name: z.string().trim().min(2, "Test name is required"),
    category: z.enum(testCategories).nullable(),
    price: z.coerce.number().min(0, "Price must be zero or higher"),
    result_type: z.enum(resultTypes),
    unit: z.string().trim().max(30, "Unit must be 30 characters or fewer").nullable(),
    is_active: z.boolean(),
    reference_range: referenceRangeSchema
  })
  .superRefine((value, ctx) => {
    if (value.result_type === "numeric" && value.reference_range.mode !== "numeric") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference_range"],
        message: "Numeric tests require a numeric reference range"
      });
    }

    if (value.result_type === "boolean" && value.reference_range.mode !== "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference_range"],
        message: "Positive/negative tests require boolean labels"
      });
    }

    if (
      value.result_type === "text" &&
      !["text", "select"].includes(value.reference_range.mode)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference_range"],
        message: "Text tests use text guidance or dropdown options"
      });
    }

    if (value.result_type === "panel" && value.reference_range.mode !== "panel") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference_range"],
        message: "Panel tests require at least one parameter"
      });
    }
  });

export type TestFormValues = z.infer<typeof testFormSchema>;
