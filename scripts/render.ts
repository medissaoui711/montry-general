import {existsSync, mkdirSync, readFileSync, copyFileSync} from "node:fs";
import {resolve, dirname, basename} from "node:path";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {selectComposition, renderMedia} from "@remotion/renderer";
import {ProductionBrandSchema, ReelInputSchema} from "../src/schema";
import {validateLogoSvg} from "../src/logo";
import {parseRenderArguments} from "../src/cli";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = process.argv.slice(2);
const parsedArgs = parseRenderArguments(args);
const inputPath = parsedArgs.inputPath;
const outputPath = resolve(parsedArgs.outputPath);
const brandConfigPath = resolve(parsedArgs.brandConfigPath);

const sourcePath = resolve(inputPath);
if (!existsSync(sourcePath)) throw new Error(`Input file not found: ${sourcePath}`);
if (!existsSync(brandConfigPath)) throw new Error(`Brand configuration not found: ${brandConfigPath}`);

const rawBrand: unknown = JSON.parse(readFileSync(brandConfigPath, "utf8"));
const parsedBrand = ProductionBrandSchema.safeParse(rawBrand);
if (!parsedBrand.success) {
  throw new Error(`Brand configuration is not production-ready:\n${parsedBrand.error.toString()}`);
}
const brand = parsedBrand.data;

const logoPath = resolve(dirname(brandConfigPath), basename(brand.logo_file));
if (!existsSync(logoPath)) throw new Error(`Required brand logo is missing: ${logoPath}`);
const logoSource = readFileSync(logoPath, "utf8");
validateLogoSvg(logoSource);

const rawInput: unknown = JSON.parse(readFileSync(sourcePath, "utf8"));
const parsedInput = ReelInputSchema.safeParse(rawInput);
if (!parsedInput.success) {
  throw new Error(`Invalid reel input:\n${parsedInput.error.toString()}`);
}

const publicDir = resolve(root, "public");
mkdirSync(publicDir, {recursive:true});
copyFileSync(logoPath, resolve(publicDir, "brand-logo.svg"));
mkdirSync(dirname(outputPath), {recursive:true});

const serveUrl = await bundle({entryPoint:resolve(root,"src/index.ts"),outDir:resolve(root,".remotion-bundle")});
const inputProps = {input:parsedInput.data,brand,logoSrc:""};
const composition = await selectComposition({serveUrl,id:"MontrySilentReel",inputProps});
await renderMedia({
  composition,
  serveUrl,
  codec:"h264",
  outputLocation:outputPath,
  inputProps,
  muted:true,
  imageFormat:"jpeg",
  concurrency:2,
});
console.log(`Rendered silent MP4: ${outputPath}`);
