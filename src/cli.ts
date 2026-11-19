export type RenderArguments = {
  inputPath: string;
  outputPath: string;
  brandConfigPath: string;
};

export function parseRenderArguments(args: string[]): RenderArguments {
  const brandFlag = args.indexOf("--brand");
  if (brandFlag >= 0 && (args[brandFlag + 1] === undefined || args[brandFlag + 1].startsWith("--"))) {
    throw new Error("The --brand option requires a JSON file path.");
  }
  if (brandFlag >= 0 && args.lastIndexOf("--brand") !== brandFlag) {
    throw new Error("The --brand option may only be supplied once.");
  }

  const positionalArgs = brandFlag >= 0
    ? args.filter((_, index) => index !== brandFlag && index !== brandFlag + 1)
    : args;

  const inputPath = positionalArgs[0];
  if (!inputPath || inputPath.startsWith("--")) {
    throw new Error("Usage: npm run render -- <reel-input.json> [output.mp4] [--brand path/to/brand.json]");
  }

  return {
    inputPath,
    outputPath: positionalArgs[1] ?? "out/montry-reel.mp4",
    brandConfigPath: brandFlag >= 0 ? args[brandFlag + 1]! : "skills/template-reels/brand.json",
  };
}
