import {z} from "zod";
import type {SkillDefinition} from "../orchestration/contracts";
import {OpenverseProvider,OpenverseSearchInputSchema,OpenverseSearchOutputSchema} from "./openverse";
import {EarshotAdapter} from "./earshot";

const EarshotResultSchema=z.object({stdout:z.string(),stderr:z.string(),exitCode:z.literal(0),data:z.unknown().optional()}).strict();
const EarshotListInput=z.object({kind:z.string().optional(),category:z.string().optional()}).strict();
const EarshotRenderInput=z.object({
  id:z.string().min(1),outputPath:z.string().min(1),duration:z.number().optional(),
  apex:z.number().optional(),pitch:z.string().optional(),seed:z.number().int().optional(),overwrite:z.boolean().optional(),
}).strict();
const EarshotCheckInput=z.object({filePath:z.string().min(1),category:z.string().optional(),role:z.string().optional()}).strict();

export function createOpenverseSearchSkill(provider:OpenverseProvider):SkillDefinition<typeof OpenverseSearchInputSchema,typeof OpenverseSearchOutputSchema> {
  return {
    id:"openverse.audio.search",version:"1.0.0",capabilities:["audio.sfx.search"],
    inputSchema:OpenverseSearchInputSchema,outputSchema:OpenverseSearchOutputSchema,
    execute:(input)=>provider.searchAudio(input.query,{page:input.page,pageSize:input.pageSize,licenses:input.licenses}),
  };
}
export function createEarshotSfxSkills(adapter:EarshotAdapter) {
  const listSkill:SkillDefinition<typeof EarshotListInput,typeof EarshotResultSchema>={
    id:"earshot.sfx.list",version:"1.0.0",capabilities:["audio.sfx.catalog"],
    inputSchema:EarshotListInput,outputSchema:EarshotResultSchema,execute:(input)=>adapter.listSfx(input),
  };
  const renderSkill:SkillDefinition<typeof EarshotRenderInput,typeof EarshotResultSchema>={
    id:"earshot.sfx.render",version:"1.0.0",capabilities:["audio.sfx.generate"],
    inputSchema:EarshotRenderInput,outputSchema:EarshotResultSchema,execute:(input)=>adapter.renderSfx(input),
  };
  const checkSkill:SkillDefinition<typeof EarshotCheckInput,typeof EarshotResultSchema>={
    id:"earshot.sfx.check",version:"1.0.0",capabilities:["audio.sfx.audit"],
    inputSchema:EarshotCheckInput,outputSchema:EarshotResultSchema,execute:(input)=>adapter.checkSfx(input),
  };
  return [listSkill,renderSkill,checkSkill] as const;
}
