export type ApiOk = {
    ok: true;
    job_id: string;
    status: "COMPLETED" | "FAILED" | "TIMEOUT" | string;
    prompt_used?: string;
    image_base64?: string;
    image_data_url?: string;
    filename?: string;
    has_input_image?: boolean;
    perspective?: string;
    is_video?: boolean;
    file_url?: string;
    runpod_response?: unknown;
    is_regenerated?: boolean;
    parent_url?: string;
    aspect_ratio?: string;
};

export type ApiErr = {
    error?: string;
    details?: string;
    ok?: false;
    status?: string;
    runpod_response?: unknown;
};

export type ApiResponse = ApiOk | ApiErr;

export type UserSession = {
  id: string;
  title: string;
  user_id: string;
  updated_at: string;
  created_at?: string;
  parent_session_id?: string | null;
  resps?: Record<string, ApiResponse>;
};
