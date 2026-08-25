/** Shared Style / Perspective options for Text + Image Generator nodes */

export type StylePrompt = {
  title: string;
  type: string;
  prompt?: string;
};

export const DEFAULT_STYLE_PROMPTS: StylePrompt[] = [
  { title: "Custom Scene", type: "Other" },
  { title: "Photorealistic Exterior", type: "Exterior" },
  { title: "Night Shot", type: "Exterior" },
  { title: "Sunset/Golden Hour", type: "Exterior" },
  { title: "Photorealistic Interior", type: "Interior" },
  { title: "Living Room Design", type: "Interior" },
  { title: "Bedroom Design", type: "Interior" },
  { title: "Kitchen & Dining", type: "Interior" },
  { title: "Bathroom Design", type: "Interior" },
  { title: "Floor Plan to 3D", type: "Plan" },
  { title: "Architectural Plan, Elevation & Section", type: "Plan" },
  { title: "Physical Model", type: "Model" },
  { title: "Architectural concept sketch", type: "Sketch" },
];

export function mergeStylePrompts(dbPrompts: StylePrompt[] = []): StylePrompt[] {
  const all = [...dbPrompts];
  for (const dp of DEFAULT_STYLE_PROMPTS) {
    if (!all.find((p) => p.title === dp.title)) all.push(dp);
  }
  return all;
}

export function groupStylePrompts(prompts: StylePrompt[]): Record<string, StylePrompt[]> {
  return prompts.reduce((acc: Record<string, StylePrompt[]>, p) => {
    const t = p.type || "Other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(p);
    return acc;
  }, {});
}
