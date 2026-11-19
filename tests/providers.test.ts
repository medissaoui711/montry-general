import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe,expect,it,vi} from "vitest";
import {EarshotAdapter} from "../src/providers/earshot";
import {OpenverseHttpError,OpenverseProvider} from "../src/providers/openverse";
import {createEarshotSfxSkills,createOpenverseSearchSkill} from "../src/providers/skills";
import {executeWorkflow,SkillRegistry} from "../src/orchestration";

const openversePayload={
  count:2,page:1,page_count:1,
  results:[
    {id:"cc0-id",title:"Soft whoosh",url:"https://cdn.example.test/whoosh.wav",creator:"Sound Maker",
      license:"cc0",license_url:"https://creativecommons.org/publicdomain/zero/1.0/",
      foreign_landing_url:"https://source.example.test/cc0",duration:850,tags:[{name:"whoosh"}]},
    {id:"by-id",title:"Air sweep",url:"https://cdn.example.test/sweep.wav",creator:"Creator",
      license:"by",license_url:"https://creativecommons.org/licenses/by/4.0/",
      foreign_landing_url:"https://source.example.test/by",duration:1200,tags:[{name:"sweep"}]},
    {id:"nc-id",title:"Restricted music",url:"https://cdn.example.test/music.mp3",creator:"Artist",
      license:"by-nc",license_url:"https://creativecommons.org/licenses/by-nc/4.0/",duration:4000,tags:[]},
  ],
};

describe("Openverse provider",()=>{
  it("searches sound effects, filters licenses and preserves attribution metadata",async()=>{
    let requestUrl:URL|undefined;
    const fetchImpl=vi.fn(async(input:RequestInfo|URL)=>{
      requestUrl=new URL(String(input));
      return new Response(JSON.stringify(openversePayload),{status:200});
    }) as unknown as typeof fetch;
    const provider=new OpenverseProvider({fetchImpl});
    const result=await provider.searchAudio("soft whoosh",{page:2,pageSize:10});
    expect(requestUrl?.searchParams.get("category")).toBe("sound_effect");
    expect(requestUrl?.searchParams.get("license")).toBe("cc0,pdm,by");
    expect(requestUrl?.searchParams.get("page")).toBe("2");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({license:"cc0",attributionRequired:false,durationMs:850,durationSeconds:0.85});
    expect(result.results[1]).toMatchObject({license:"by",attributionRequired:true,creator:"Creator",creatorUrl:null,openversePageUrl:"https://openverse.org/audio/by-id"});
    expect(result.results[1]?.attributionText).toContain("Creator");
    expect(result.results.some((item)=>item.license==="by-nc")).toBe(false);
  });

  it("allows explicit license policy while exposing commercial/adaptation restrictions",async()=>{
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(openversePayload),{status:200})) as unknown as typeof fetch;
    const provider=new OpenverseProvider({fetchImpl});
    const result=await provider.searchAudio("music",{licenses:["by-nc"]});
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({commercialUseAllowed:false,adaptationsAllowed:true,attributionRequired:true});
  });

  it("surfaces rate-limit retry metadata and rejects malformed queries",async()=>{
    const fetchImpl=vi.fn(async()=>new Response("{}",{status:429,headers:{"retry-after":"2"}})) as unknown as typeof fetch;
    const provider=new OpenverseProvider({fetchImpl});
    await expect(provider.searchAudio("whoosh")).rejects.toMatchObject({status:429,retryAfter:"2"});
    await expect(provider.searchAudio("   ")).rejects.toThrow();
  });
});

describe("Earshot optional CLI adapter",()=>{
  it("probes availability with a bounded help command and reports missing executables as unavailable", async () => {
    const availableRunner = vi.fn(async () => ({stdout: "Earshot help", stderr: "", exitCode: 0}));
    const availableAdapter = new EarshotAdapter({runner: availableRunner});
    await expect(availableAdapter.isAvailable()).resolves.toBe(true);
    expect(availableRunner).toHaveBeenCalledWith("earshot", ["--help"], expect.objectContaining({timeoutMs: 5_000, maxOutputBytes: 16_384}));

    const missingAdapter = new EarshotAdapter({runner: async () => { throw new Error("ENOENT"); }});
    await expect(missingAdapter.isAvailable()).resolves.toBe(false);

    const unsuccessfulAdapter = new EarshotAdapter({
      runner: async () => ({stdout: "", stderr: "unsupported", exitCode: 1}),
    });
    await expect(unsuccessfulAdapter.isAvailable()).resolves.toBe(false);
  });

  it("uses a shell-free allowlisted argument vector and returns structured output",async()=>{
    const runner=vi.fn(async(_exe:string,args:string[])=>({stdout:'{"sounds":["whoosh_fast/crisp"]}',stderr:"",exitCode:0}));
    const adapter=new EarshotAdapter({runner});
    const result=await adapter.listSfx({kind:"whoosh"});
    expect(runner).toHaveBeenCalledWith("earshot",["sfx","list","--kind","whoosh","--json"],expect.objectContaining({timeoutMs:120000}));
    expect(result.data).toEqual({sounds:["whoosh_fast/crisp"]});
    await expect(adapter.listSfx({kind:"whoosh; rm -rf /"})).rejects.toThrow(/invalid earshot kind/i);
  });

  it("validates output paths and render bounds before starting a process",async()=>{
    const runner=vi.fn(async()=>({stdout:"{}",stderr:"",exitCode:0}));
    const adapter=new EarshotAdapter({runner});
    await expect(adapter.renderSfx({id:"whoosh_fast/crisp",outputPath:"relative.wav"})).rejects.toThrow(/absolute path/i);
    await expect(adapter.renderSfx({id:"whoosh_fast/crisp",outputPath:path.resolve("out.mp3")})).rejects.toThrow(/\.wav/i);
    await expect(adapter.renderSfx({id:"whoosh_fast/crisp",outputPath:path.resolve("out.wav"),duration:1,apex:2})).rejects.toThrow(/apex cannot exceed/i);
    await expect(adapter.renderSfx({id:"../escape",outputPath:path.resolve("out.wav")})).rejects.toThrow(/sound ID/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("requires explicit overwrite and verifies that Earshot produced a non-empty WAV",async()=>{
    const root=await mkdtemp(path.join(tmpdir(),"earshot-adapter-"));
    try {
      const output=path.join(root,"rendered.wav");
      await writeFile(output,"old");
      const runner=vi.fn(async(_exe:string,args:string[])=>{
        await writeFile(args[4]!,"new wav bytes");
        return {stdout:'{"ok":true}',stderr:"",exitCode:0};
      });
      const adapter=new EarshotAdapter({runner});
      await expect(adapter.renderSfx({id:"whoosh_fast/crisp",outputPath:output})).rejects.toThrow(/already exists/i);
      const result=await adapter.renderSfx({id:"whoosh_fast/crisp",outputPath:output,overwrite:true,duration:0.8,apex:0.3});
      expect(result.data).toEqual({ok:true});
      expect(runner.mock.calls[0]?.[1]).toEqual(["sfx","render","whoosh_fast/crisp","-o",output,"--dur","0.8","--apex","0.3","--json"]);
    } finally { await rm(root,{recursive:true,force:true}); }
  });

  it("checks only existing regular files",async()=>{
    const root=await mkdtemp(path.join(tmpdir(),"earshot-adapter-"));
    try {
      const audioFile=path.join(root,"sample.wav");
      await writeFile(audioFile,"fake audio bytes");
      const runner=vi.fn(async(_exe:string,args:string[])=>({stdout:'{"ok":true}',stderr:"",exitCode:0}));
      const adapter=new EarshotAdapter({runner});
      const result=await adapter.checkSfx({filePath:audioFile,role:"whoosh.short"});
      expect(result.data).toEqual({ok:true});
      expect(runner.mock.calls[0]?.[1]).toEqual(["sfx","check",audioFile,"--role","whoosh.short","--json"]);
      await expect(adapter.checkSfx({filePath:path.join(root,"missing.wav")})).rejects.toThrow();
    } finally { await rm(root,{recursive:true,force:true}); }
  });

  it("registers provider skills for capability-based workflow execution",async()=>{
    const runner=vi.fn(async(_exe:string,args:string[])=>({stdout:JSON.stringify({command:args.slice(0,2)}),stderr:"",exitCode:0}));
    const earshot=new EarshotAdapter({runner});
    const registry=new SkillRegistry();
    const [listSkill,renderSkill,checkSkill]=createEarshotSfxSkills(earshot);
    registry.register(listSkill);
    registry.register(renderSkill);
    registry.register(checkSkill);
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(openversePayload),{status:200})) as unknown as typeof fetch;
    registry.register(createOpenverseSearchSkill(new OpenverseProvider({fetchImpl})));

    const earshotRun=await executeWorkflow({id:"earshot-workflow",tasks:[
      {id:"list",capability:"audio.sfx.catalog",input:{},dependsOn:[]},
    ]},registry);
    expect(earshotRun.status).toBe("completed");
    expect(earshotRun.tasks[0]).toMatchObject({skillId:"earshot.sfx.list",status:"completed"});
    const searchRun=await executeWorkflow({id:"openverse-workflow",tasks:[
      {id:"search",capability:"audio.sfx.search",input:{query:"soft whoosh"},dependsOn:[]},
    ]},registry);
    expect(searchRun.status).toBe("completed");
    expect(searchRun.outputs.search).toMatchObject({count:2});
    expect(registry.resolveCapability("audio.sfx.generate")).toBe("earshot.sfx.render");
  });
});
