/** Gemini / Imagen model options used by Text + Image Generator nodes */

export type ImageModelOption = {
  value: string;
  label: string;
};

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    value: "nano-banana-pro-preview",
    label: "Nano Banana Pro Preview",
  },
  {
    value: "nano-banana-pro",
    label: "Nano Banana Pro",
  },
  {
    value: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
  },
  {
    value: "imagen-3.0-generate-001",
    label: "Imagen 3",
  },
];

/** Default model (was labeled "Auto" in the UI) */
export const DEFAULT_IMAGE_MODEL = "nano-banana-pro-preview";
