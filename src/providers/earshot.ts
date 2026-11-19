import {spawn} from "node:child_process";
import {mkdir,stat} from "node:fs/promises";
import path from "node:path";

export type EarshotProcessResult={stdout:string;stderr:string;exitCode:number};
export type EarshotRunnerOptions={cwd?:string;timeoutMs:number;maxOutputBytes:number;env?:Record<string,string>};
export type EarshotProcessRunner=(executable:string,args:string[],options:EarshotRunnerOptions)=>Promise<EarshotProcessResult>;
export type EarshotAdapterOptions={
  executable?:string;cwd?:string;timeoutMs?:number;maxOutputBytes?:number;
  env?:Record<string,string>;runner?:EarshotProcessRunner;
};
export type EarshotCommandResult={stdout:string;stderr:string;exitCode:0;data?:unknown};

function safeEnvironment(extra:Record<string,string>={}):NodeJS.ProcessEnv {
  const inherited=["PATH","HOME","USERPROFILE","TMPDIR","TEMP","SYSTEMROOT","WINDIR","VIRTUAL_ENV","PYTHONPATH","LANG"];
  const env:NodeJS.ProcessEnv={};
  for(const key of inherited) if(process.env[key]) env[key]=process.env[key];
  env.EARSHOT_THREADS=extra.EARSHOT_THREADS ?? process.env.EARSHOT_THREADS ?? "2";
  env.PYTHONIOENCODING="utf-8";
  for(const [key,value] of Object.entries(extra)) {
    if(!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error("Invalid Earshot environment key "+JSON.stringify(key)+".");
    env[key]=value;
  }
  return env;
}

const defaultRunner:EarshotProcessRunner=(executable,args,options)=>new Promise((resolve,reject)=>{
  let stdout="",stderr="",outputBytes=0,settled=false,timedOut=false;
  const child=spawn(executable,args,{
    cwd:options.cwd,env:safeEnvironment(options.env),shell:false,windowsHide:true,
    stdio:["ignore","pipe","pipe"],
  });
  const finishError=(error:Error)=>{
    if(settled)return;
    settled=true;clearTimeout(timer);child.kill("SIGKILL");reject(error);
  };
  const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},options.timeoutMs);
  child.stdout.on("data",(chunk:Buffer)=>{
    outputBytes+=chunk.length;
    if(outputBytes>options.maxOutputBytes)return finishError(new Error("Earshot output exceeded the configured size limit."));
    stdout+=chunk.toString("utf8");
  });
  child.stderr.on("data",(chunk:Buffer)=>{
    outputBytes+=chunk.length;
    if(outputBytes>options.maxOutputBytes)return finishError(new Error("Earshot output exceeded the configured size limit."));
    stderr+=chunk.toString("utf8");
  });
  child.once("error",(error)=>finishError(new Error("Unable to start Earshot executable: "+error.message)));
  child.once("close",(code,signal)=>{
    if(settled)return;
    settled=true;clearTimeout(timer);
    if(timedOut)return reject(new Error("Earshot command timed out after "+options.timeoutMs+"ms."));
    if(code!==0)return reject(new Error("Earshot command failed (exit "+(code??signal??"unknown")+"): "+stderr.slice(-2000)));
    resolve({stdout,stderr,exitCode:code??0});
  });
});

const safeToken=(value:string,label:string)=>{
  if(!/^[a-z0-9][a-z0-9._-]*$/i.test(value))throw new Error("Invalid Earshot "+label+".");
  return value;
};
const safeSoundId=(value:string)=>{
  if(!/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/i.test(value))throw new Error("Invalid Earshot sound ID.");
  return value;
};
const absoluteFile=(value:string,label:string)=>{
  if(!path.isAbsolute(value))throw new Error(label+" must be an absolute path.");
  return path.resolve(value);
};
const optionalNumber=(value:number|undefined,label:string,min:number,max:number)=>{
  if(value===undefined)return undefined;
  if(!Number.isFinite(value)||value<min||value>max)throw new Error("Earshot "+label+" must be between "+min+" and "+max+".");
  return String(value);
};
function toCommandResult(result:EarshotProcessResult):EarshotCommandResult {
  let data:unknown;
  try{data=JSON.parse(result.stdout);}catch{data=undefined;}
  return {stdout:result.stdout,stderr:result.stderr,exitCode:0,...(data===undefined?{}:{data})};
}

/** Shell-free bridge exposing only the supported SFX command allowlist. */
export class EarshotAdapter {
  private readonly executable:string;
  private readonly cwd?:string;
  private readonly timeoutMs:number;
  private readonly maxOutputBytes:number;
  private readonly env:Record<string,string>;
  private readonly runner:EarshotProcessRunner;
  constructor(options:EarshotAdapterOptions={}) {
    this.executable=options.executable??"earshot";
    this.cwd=options.cwd;
    this.timeoutMs=options.timeoutMs??120_000;
    this.maxOutputBytes=options.maxOutputBytes??1_000_000;
    this.env=options.env??{};
    this.runner=options.runner??defaultRunner;
    if(this.timeoutMs<100||this.timeoutMs>600_000)throw new Error("Earshot timeout must be between 100 and 600000ms.");
    if(this.maxOutputBytes<1024||this.maxOutputBytes>10_000_000)throw new Error("Earshot output limit must be between 1KB and 10MB.");
  }
  private async run(args:string[]):Promise<EarshotCommandResult> {
    const result=await this.runner(this.executable,args,{
      cwd:this.cwd,timeoutMs:this.timeoutMs,maxOutputBytes:this.maxOutputBytes,env:this.env,
    });
    if(result.exitCode!==0)throw new Error("Earshot command failed (exit "+result.exitCode+"): "+result.stderr.slice(-2000));
    return toCommandResult(result);
  }
  async listSfx(options:{kind?:string;category?:string}={}):Promise<EarshotCommandResult> {
    const args=["sfx","list"];
    if(options.kind)args.push("--kind",safeToken(options.kind,"kind"));
    if(options.category)args.push("--category",safeToken(options.category,"category"));
    args.push("--json");
    return this.run(args);
  }
  async renderSfx(options:{id:string;outputPath:string;duration?:number;apex?:number;pitch?:string;seed?:number;overwrite?:boolean}):Promise<EarshotCommandResult> {
    const id=safeSoundId(options.id);
    const outputPath=absoluteFile(options.outputPath,"Output path");
    if(path.extname(outputPath).toLowerCase()!==".wav")throw new Error("Earshot output path must use the .wav extension.");
    const duration=optionalNumber(options.duration,"duration",0.01,60);
    const apex=optionalNumber(options.apex,"apex",0,60);
    if(duration!==undefined&&apex!==undefined&&Number(options.apex)>Number(duration))throw new Error("Earshot apex cannot exceed the requested duration.");
    if(options.seed!==undefined&&(!Number.isInteger(options.seed)||options.seed<0||options.seed>2_147_483_647))throw new Error("Earshot seed must be a non-negative 32-bit integer.");
    if(options.pitch!==undefined) {
      const note=/^[A-Ga-g](?:#|b)?[0-8]$/.test(options.pitch);
      const frequency=/^\d{1,5}(?:\.\d+)?$/.test(options.pitch)?Number(options.pitch):0;
      if(!note&&(!Number.isFinite(frequency)||frequency<=0||frequency>20000))throw new Error("Earshot pitch must be a note name or a frequency between 1 and 20000 Hz.");
    }
    try {
      const existing=await stat(outputPath);
      if(!existing.isFile())throw new Error("Earshot output path already exists and is not a file.");
      if(!options.overwrite)throw new Error("Earshot output file already exists; set overwrite=true to replace it.");
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
    }
    await mkdir(path.dirname(outputPath),{recursive:true});
    const args=["sfx","render",id,"-o",outputPath];
    if(duration!==undefined)args.push("--dur",duration);
    if(apex!==undefined)args.push("--apex",apex);
    if(options.pitch!==undefined)args.push("--pitch",options.pitch);
    if(options.seed!==undefined)args.push("--seed",String(options.seed));
    args.push("--json");
    const result=await this.run(args);
    const rendered=await stat(outputPath);
    if(!rendered.isFile()||rendered.size===0)throw new Error("Earshot did not produce a non-empty WAV file.");
    return result;
  }
  async checkSfx(options:{filePath:string;category?:string;role?:string}):Promise<EarshotCommandResult> {
    const filePath=absoluteFile(options.filePath,"Audio file path");
    const fileStat=await stat(filePath);
    if(!fileStat.isFile())throw new Error("Earshot check input must be a regular file.");
    const args=["sfx","check",filePath];
    if(options.category)args.push("--category",safeToken(options.category,"category"));
    if(options.role)args.push("--role",safeToken(options.role,"role"));
    args.push("--json");
    return this.run(args);
  }
}
