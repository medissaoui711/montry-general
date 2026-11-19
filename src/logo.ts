export function validateLogoSvg(content: string): void {
  const rootTag = content.match(/<svg\b[^>]*>/i)?.[0];
  if (!rootTag) {
    throw new Error("The configured brand logo is not a valid SVG document.");
  }
  if (/Replace with your logo|>\s*LOGO\s*</i.test(content)) {
    throw new Error("The configured logo is still the repository placeholder. Replace it before rendering.");
  }
  const hasWidth = /\bwidth=["']360(?:px)?["']/i.test(rootTag);
  const hasHeight = /\bheight=["']360(?:px)?["']/i.test(rootTag);
  if (!hasWidth || !hasHeight) {
    throw new Error("The brand SVG root must declare width=360 and height=360.");
  }
  if (/<script\b|<foreignObject\b|\bon[a-z]+\s*=|@import|\b(?:href|xlink:href)\s*=\s*["']https?:|url\(\s*["']?https?:/i.test(content)) {
    throw new Error("Scripts, event handlers, and external network references are not allowed inside the brand SVG.");
  }
}
