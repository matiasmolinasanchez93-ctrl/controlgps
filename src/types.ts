export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "employee";
  active: boolean;
};
export type Project = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
  active: boolean;
  created_by?: string;
};
export type Assignment = {
  id: string;
  project_id: string;
  employee_id: string;
  active: boolean;
};
export type Attendance = {
  id: string;
  employee_id: string;
  project_id: string;
  check_in_at: string;
  check_out_at: string | null;
  check_out_reason: string | null;
};
export type LocationEvent = {
  id: string;
  attendance_session_id: string;
  employee_id: string;
  project_id: string;
  event_type: string;
  recorded_at: string;
  accuracy_m: number | null;
};
