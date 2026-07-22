export type PatientOption = {
  id: string;
  name: string;
  hospital_id: string | null;
  lab_id: string;
  phone: string | null;
};

export type Encounter = {
  id: string;
  facility_id: string;
  patient_id: string;
  encounter_number: string;
  encounter_type: "Outpatient" | "Emergency" | "Inpatient" | "Telemedicine";
  status: "Open" | "Admitted" | "Discharged" | "Cancelled";
  presenting_complaint: string | null;
  attending_clinician: string | null;
  started_at: string;
  ended_at: string | null;
  patients: PatientOption | null;
};

export type VitalSign = {
  id: string;
  encounter_id: string;
  temperature_c: number | null;
  pulse_bpm: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  oxygen_saturation: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  blood_glucose_mmol: number | null;
  pain_score: number | null;
  notes: string | null;
  measured_at: string;
};

export type ClinicalNote = {
  id: string;
  encounter_id: string;
  note_type:
    | "Clinical Presentation"
    | "Progress Note"
    | "Procedure Note"
    | "Nursing Note"
    | "Discharge Summary"
    | "Clinical Report";
  chief_complaint: string | null;
  history_of_presenting_illness: string | null;
  examination: string | null;
  assessment: string | null;
  plan: string | null;
  report_title: string | null;
  authored_at: string;
};

export type Diagnosis = {
  id: string;
  encounter_id: string;
  diagnosis_name: string;
  icd10_code: string | null;
  diagnosis_type: "Working" | "Differential" | "Confirmed" | "Final";
  status: "Active" | "Resolved" | "Ruled Out";
  notes: string | null;
  diagnosed_at: string;
};

export type Ward = {
  id: string;
  facility_id: string;
  name: string;
  code: string;
  ward_type: string;
  capacity: number;
  location: string | null;
  gender_restriction: "Any" | "Female" | "Male" | "Paediatric";
  is_active: boolean;
  beds: Bed[] | null;
};

export type Bed = {
  id: string;
  facility_id: string;
  ward_id: string;
  bed_number: string;
  status: "Available" | "Occupied" | "Reserved" | "Maintenance";
  notes: string | null;
};

export type Admission = {
  id: string;
  patient_id: string;
  encounter_id: string;
  ward_id: string;
  bed_id: string | null;
  status: "Admitted" | "Transferred" | "Discharged" | "Cancelled";
  admission_reason: string | null;
  admitted_at: string;
  discharged_at: string | null;
  patients: PatientOption | null;
  wards: Pick<Ward, "id" | "name" | "code"> | null;
  beds: Pick<Bed, "id" | "bed_number"> | null;
  clinical_encounters: Pick<Encounter, "id" | "encounter_number"> | null;
};

export type Medication = {
  id: string;
  facility_id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string;
  dosage_form: string;
  route: string | null;
  unit: string;
  unit_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  batch_number: string | null;
  expiry_date: string | null;
  storage_location: string | null;
  is_controlled: boolean;
  is_active: boolean;
};

export type PrescriptionItem = {
  id: string;
  medication_id: string | null;
  medication_name: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string | null;
  quantity: number;
  dispensed_quantity: number;
  instructions: string | null;
  unit_price: number;
};

export type Prescription = {
  id: string;
  patient_id: string;
  encounter_id: string;
  status: "Pending" | "Partially Dispensed" | "Dispensed" | "Cancelled";
  notes: string | null;
  prescribed_at: string;
  dispensed_at: string | null;
  patients: PatientOption | null;
  clinical_encounters: Pick<Encounter, "id" | "encounter_number"> | null;
  prescription_items: PrescriptionItem[] | null;
};

export type EncounterCharge = {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  amount_paid: number;
  payment_status: "Unpaid" | "Partial" | "Paid" | "Waived";
  charged_at: string;
  patients: PatientOption | null;
  clinical_encounters: Pick<Encounter, "id" | "encounter_number"> | null;
};

export type RadiologyService = {
  id: string;
  facility_id: string;
  name: string;
  modality: "X-Ray" | "Ultrasound" | "CT" | "MRI" | "Mammography" | "Fluoroscopy" | "Other";
  body_part: string | null;
  preparation_instructions: string | null;
  unit_price: number;
  is_active: boolean;
};

export type RadiologyReport = {
  id: string;
  request_id: string;
  findings: string;
  impression: string;
  recommendation: string | null;
  pacs_reference: string | null;
  reported_at: string;
  verified_at: string | null;
};

export type RadiologyRequest = {
  id: string;
  facility_id: string;
  request_number: string;
  patient_id: string;
  encounter_id: string | null;
  service_id: string;
  clinical_indication: string;
  priority: "Routine" | "Urgent" | "Emergency";
  status: "Requested" | "Scheduled" | "In Progress" | "Completed" | "Cancelled";
  scheduled_at: string | null;
  requested_at: string;
  completed_at: string | null;
  patients: PatientOption | null;
  clinical_encounters: Pick<Encounter, "id" | "encounter_number"> | null;
  radiology_services: Pick<RadiologyService, "id" | "name" | "modality" | "unit_price"> | null;
  radiology_reports: RadiologyReport[] | null;
};
