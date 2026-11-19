import {z} from "zod";

const TagSchema = z.union([z.string(), z.object({name:z.string()}).passthrough()]);
const AudioItemSchema = z.object({
  id:z.string().min(1), title:z.string().min(1), url:z.string().url(),
  creator:z.string().nullable().optional(), creator_url:z.string().url().nullable().optional(),
  license:z.string().min(1), license_version:z.string().nullable().optional(),
  license_url:z.string().url().nullable().optional(), foreign_landing_url:z.string().url().nullable().optional(),
  attribution:z.string().nullable().optional(), duration:z.number().nonnegative().nullable().optional(),
  tags:z.array(TagSchema).optional(), provider:z.string().nullable().optional(), source:z.string().nullable().optional(),
}).passthrough();
const SearchResponseSchema = z.object({
  count:z.number().int().nonnegative(), page:z.number().int().positive().optional(),
  page_count:z.number().int().nonnegative().optional(), page_size:z.number().int().positive().optional(),
  results:z.array(AudioItemSchema),
}).passthrough();

export const OpenverseSearchInputSchema = z.object({
  query:z.string().trim().min(1).max(200),
  page:z.number().int().min(1).default(1),
  pageSize:z.number().int().min(1).max(50).default(20),
  licenses:z.array(z.string().regex(/^[a-z0-9-]+$/i)).min(1).max(20).default(["cc0","pdm","by"]),
}).strict();

export const OpenverseAssetSchema = z.object({
  id:z.string(), title:z.string(), audioUrl:z.string().url(), openversePageUrl:z.string().url(), sourcePageUrl:z.string().url(),
  creator:z.string().nullable(), creatorUrl:z.string().url().nullable(), license:z.string(), licenseVersion:z.string().nullable(),
  licenseUrl:z.string().url().nullable(), attributionText:z.string().nullable(),
  attributionRequired:z.boolean(), commercialUseAllowed:z.boolean(), adaptationsAllowed:z.boolean(),
  shareAlike:z.boolean(), durationMs:z.number().nonnegative().nullable(),
  durationSeconds:z.number().nonnegative().nullable(), tags:z.array(z.string()),
  provider:z.string().nullable(), source:z.string().nullable(),
}).strict();
export const OpenverseSearchOutputSchema = z.object({
  count:z.number().int().nonnegative(), page:z.number().int().positive(),
  pageCount:z.number().int().nonnegative().nullable(), results:z.array(OpenverseAssetSchema),
}).strict();

export type OpenverseSearchInput=z.infer<typeof OpenverseSearchInputSchema>;
export type OpenverseSearchOutput=z.infer<typeof OpenverseSearchOutputSchema>;

export class OpenverseHttpError extends Error {
  constructor(message:string,readonly status:number,readonly retryAfter:string|null=null) {
    super(message); this.name="OpenverseHttpError";
  }
}
export type OpenverseProviderOptions={fetchImpl?:typeof fetch;timeoutMs?:number};

/** Search-only adapter. It never downloads or approves an asset. */
export class OpenverseProvider {
  private readonly fetchImpl:typeof fetch;
  private readonly timeoutMs:number;
  constructor(options:OpenverseProviderOptions={}) {
    this.fetchImpl=options.fetchImpl ?? fetch;
    this.timeoutMs=options.timeoutMs ?? 12_000;
  }

  async searchAudio(query:string,options:Partial<Omit<OpenverseSearchInput,"query">>={}):Promise<OpenverseSearchOutput> {
    const input=OpenverseSearchInputSchema.parse({query,...options});
    const url=new URL("https://api.openverse.org/v1/audio/");
    url.searchParams.set("q",input.query);
    url.searchParams.set("category","sound_effect");
    url.searchParams.set("license",input.licenses.join(","));
    url.searchParams.set("page",String(input.page));
    url.searchParams.set("page_size",String(input.pageSize));

    let response:Response;
    try {
      response=await this.fetchImpl(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(this.timeoutMs)});
    } catch(error) {
      throw new Error("Openverse request failed: "+(error instanceof Error?error.message:String(error)));
    }
    if(!response.ok) {
      throw new OpenverseHttpError(
        response.status===429?"Openverse rate limit reached. Retry after the indicated delay.":"Openverse returned HTTP "+response.status+".",
        response.status,response.headers.get("retry-after"),
      );
    }
    let body:unknown;
    try { body=await response.json(); } catch { throw new Error("Openverse returned invalid JSON."); }
    const parsed=SearchResponseSchema.safeParse(body);
    if(!parsed.success) throw new Error("Openverse response contract mismatch: "+parsed.error.message);

    const allowed=new Set(input.licenses.map((license)=>license.toLowerCase()));
    const results=parsed.data.results.filter((item)=>allowed.has(item.license.toLowerCase())).map((item)=>{
      const license=item.license.toLowerCase();
      const durationMs=item.duration ?? null;
      const openversePageUrl="https://openverse.org/audio/"+encodeURIComponent(item.id);
      const sourcePageUrl=item.foreign_landing_url ?? openversePageUrl;
      const creator=item.creator ?? null;
      const attributionText=item.attribution ?? (creator
        ? item.title+" by "+creator+" — "+license+(item.license_url?" ("+item.license_url+")":"")
        : null);
      return {
        id:item.id,title:item.title,audioUrl:item.url,openversePageUrl,sourcePageUrl,creator,creatorUrl:item.creator_url ?? null,license,
        licenseVersion:item.license_version ?? null,licenseUrl:item.license_url ?? null,
        attributionText,attributionRequired:license!=="cc0"&&license!=="pdm",
        commercialUseAllowed:!license.includes("nc"),adaptationsAllowed:!license.includes("nd"),
        shareAlike:license.includes("sa"),durationMs,
        durationSeconds:durationMs===null?null:durationMs/1000,
        tags:(item.tags ?? []).map((tag)=>typeof tag==="string"?tag:tag.name),
        provider:item.provider ?? null,source:item.source ?? null,
      };
    });
    return OpenverseSearchOutputSchema.parse({
      count:parsed.data.count,page:parsed.data.page ?? input.page,
      pageCount:parsed.data.page_count ?? null,results,
    });
  }
}
