import {describe,expect,it} from "vitest";
import {buildTimeline,visibleWordCount,TOTAL_FRAMES} from "../src/timeline";
import {BrandSchema,ProductionBrandSchema,ReelInputSchema} from "../src/schema";
import brandJson from "../skills/template-reels/brand.json";
import demoBrandJson from "../examples/brand.example.json";
import {readFileSync} from "node:fs";
import {validateLogoSvg} from "../src/logo";
import {parseRenderArguments} from "../src/cli";

const valid = ReelInputSchema.parse({
  title:"Example reel",
  scenes:[{id:"scene-1",title:"First step",body:"One two three",durationSec:42.2}]
});

describe("render CLI arguments",()=>{
  it("uses the default brand when no brand flag is provided",()=>{
    expect(parseRenderArguments(["input.json"])).toEqual({inputPath:"input.json",outputPath:"out/montry-reel.mp4",brandConfigPath:"skills/template-reels/brand.json"});
  });
  it("supports a separate brand file with or without an explicit output path",()=>{
    expect(parseRenderArguments(["input.json","out.mp4","--brand","brands/a/brand.json"])).toEqual({inputPath:"input.json",outputPath:"out.mp4",brandConfigPath:"brands/a/brand.json"});
    expect(parseRenderArguments(["input.json","--brand","brands/a/brand.json"])).toEqual({inputPath:"input.json",outputPath:"out/montry-reel.mp4",brandConfigPath:"brands/a/brand.json"});
  });
  it("rejects a missing brand path and duplicate brand flags",()=>{
    expect(()=>parseRenderArguments(["input.json","--brand"])).toThrow(/requires a JSON file path/i);
    expect(()=>parseRenderArguments(["input.json","--brand","a.json","--brand","b.json"])).toThrow(/only be supplied once/i);
  });
});

describe("brand contract",()=>{
  it("allows the generic sample brand in preview mode",()=>{
    expect(BrandSchema.safeParse(brandJson).success).toBe(true);
  });
  it("rejects untouched sample identity values for production rendering",()=>{
    expect(ProductionBrandSchema.safeParse(brandJson).success).toBe(false);
  });
  it("ships a production-valid generic demo brand and local SVG",()=>{
    expect(ProductionBrandSchema.safeParse(demoBrandJson).success).toBe(true);
    const logo = readFileSync(new URL("../examples/logo.example.svg", import.meta.url), "utf8");
    expect(()=>validateLogoSvg(logo)).not.toThrow();
  });
  it("accepts configured brand values without changing the locked ending",()=>{
    const configured = {...brandJson,brand_name:"Montry Studio",brand_name_local:"مونتري",slogan:"Create with precision"};
    expect(ProductionBrandSchema.safeParse(configured).success).toBe(true);
  });
});

describe("timeline contract",()=>{
  it("locks the output to 46.2 seconds at 60fps",()=>expect(TOTAL_FRAMES).toBe(2772));
  it("places scenes consecutively on the frame timeline",()=>{
    const timeline=buildTimeline(valid);
    expect(timeline[0]?.startFrame).toBe(0);
    expect(timeline[0]?.endFrame).toBe(2532);
  });
  it("reveals one additional word every 0.4 seconds",()=>{
    expect(visibleWordCount(0,4)).toBe(1);
    expect(visibleWordCount(23,4)).toBe(1);
    expect(visibleWordCount(24,4)).toBe(2);
    expect(visibleWordCount(48,4)).toBe(3);
  });
  it("rejects body timelines that do not fill the 42.2-second body",()=>{
    const result=ReelInputSchema.safeParse({
      title:"Too long",
      scenes:[{id:"a",title:"A",body:"A",durationSec:41.8}]
    });
    expect(result.success).toBe(false);
  });
  it("rejects a scene duration too short for its word count even when total duration is valid",()=>{
    const result=ReelInputSchema.safeParse({
      title:"Too short",
      scenes:[
        {id:"a",title:"A",body:"one two three",durationSec:0.8},
        {id:"b",title:"B",body:"one",durationSec:41.4}
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path.join(".") === "scenes.0.durationSec")).toBe(true);
  });
  it("rejects duplicate scene IDs",()=>{
    const result=ReelInputSchema.safeParse({
      title:"Duplicate IDs",
      scenes:[
        {id:"same",title:"A",body:"one",durationSec:21.1},
        {id:"same",title:"B",body:"two",durationSec:21.1}
      ]
    });
    expect(result.success).toBe(false);
  });
});

describe("logo safety gate",()=>{
  it("rejects the repository placeholder",()=>{
    expect(()=>validateLogoSvg('<svg width="360" height="360"><text>LOGO</text><text>Replace with your logo</text></svg>')).toThrow(/placeholder/i);
  });
  it("rejects remote SVG references",()=>{
    expect(()=>validateLogoSvg('<svg width="360" height="360"><image href="https://example.com/logo.png"/></svg>')).toThrow(/external network/i);
  });
  it("accepts a self-contained 360x360 SVG",()=>{
    expect(()=>validateLogoSvg('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><path d="M0 0"/></svg>')).not.toThrow();
  });
});
