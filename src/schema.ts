import {z} from "zod";

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected a six-digit hex color");

export const BrandSchema = z.object({
  brand_name: z.string().trim().min(1),
  brand_name_local: z.string().trim().min(1),
  slogan: z.string().trim().min(1),
  colors: z.object({
    bg: HexColor,
    text: HexColor,
    accent1: HexColor,
    accent2: HexColor,
  }).strict(),
  font: z.literal("Cairo"),
  logo_file: z.string().trim().regex(/^[A-Za-z0-9._-]+\.svg$/i, "Logo must be an SVG filename inside the brand configuration folder."),
  ending: z.object({
    logo: z.object({width:z.literal(360),height:z.literal(360),left:z.literal(360),top:z.literal(520)}).strict(),
    line1: z.object({top:z.literal(1000),from:z.literal(42.2),to:z.literal(46.2)}).strict(),
    line2: z.object({top:z.literal(1180),from:z.literal(43.8),to:z.literal(46.2)}).strict(),
    line3: z.object({top:z.literal(1360),from:z.literal(44.8),to:z.literal(46.2),dir:z.literal("ltr")}).strict(),
  }).strict(),
}).passthrough();

// Structural validation is used by Remotion Studio so the sample configuration
// remains previewable. Production validation additionally rejects untouched samples.
export const ProductionBrandSchema = BrandSchema.superRefine((brand, ctx) => {
  if (brand.brand_name.toUpperCase() === "YOUR_BRAND") ctx.addIssue({code:"custom",path:["brand_name"],message:"Replace the Latin brand placeholder before rendering."});
  if (brand.brand_name_local === "اسم علامتك") ctx.addIssue({code:"custom",path:["brand_name_local"],message:"Replace the local brand placeholder before rendering."});
  if (brand.slogan === "Your Slogan Here") ctx.addIssue({code:"custom",path:["slogan"],message:"Replace the slogan placeholder before rendering."});
});

export const SceneSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  durationSec: z.number().min(0.4).max(42.2),
}).strict();

export const ReelInputSchema = z.object({
  title: z.string().trim().min(1),
  scenes: z.array(SceneSchema).min(1).max(12),
}).strict().superRefine((value, ctx) => {
  const total = value.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
  if (Math.abs(total - 42.2) > 1e-6) {
    ctx.addIssue({code:"custom",path:["scenes"],message:`Scene duration total (${total.toFixed(2)}s) must equal the locked 42.2s body.`});
  }
  for (const [index, scene] of value.scenes.entries()) {
    const words = scene.body.trim().split(/\s+/u).filter(Boolean).length;
    if (words * 0.4 > scene.durationSec + 1e-9) {
      ctx.addIssue({code:"custom",path:["scenes",index,"durationSec"],message:`Scene requires at least ${(words * 0.4).toFixed(2)}s for ${words} words at 0.4s per word.`});
    }
  }
  const ids = value.scenes.map(scene => scene.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({code:"custom",path:["scenes"],message:"Scene IDs must be unique."});
  }
});

export type Brand = z.infer<typeof BrandSchema>;
export type ReelInput = z.infer<typeof ReelInputSchema>;
