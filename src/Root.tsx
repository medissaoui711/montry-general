import React from "react";
import {Composition} from "remotion";
import {Reel} from "./Reel";
import {TOTAL_FRAMES} from "./timeline";
import type {Brand, ReelInput} from "./schema";
import {BrandSchema, ReelInputSchema} from "./schema";
import demoBrandJson from "../examples/brand.example.json";
import demoReelJson from "../examples/reel-input.example.json";

const brand = BrandSchema.parse(demoBrandJson) as Brand;
const sampleInput = ReelInputSchema.parse(demoReelJson) as ReelInput;
const previewLogo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='360' viewBox='0 0 360 360'%3E%3Crect width='360' height='360' rx='48' fill='%231C1917'/%3E%3Cpath d='M80 270V90h38l124 125V90h38v180h-38L118 145v125z' fill='%230EA5A4'/%3E%3C/svg%3E";

export type CompositionProps = {
  input: ReelInput | null;
  brand: Brand;
  logoSrc: string;
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MontrySilentReel"
    component={Reel}
    durationInFrames={TOTAL_FRAMES}
    fps={60}
    width={1080}
    height={1920}
    defaultProps={{input:sampleInput,brand,logoSrc:previewLogo}}
  />
);
