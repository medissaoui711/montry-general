import {describe,expect,it} from "vitest";
import {InMemoryWorkflowRunStore,WorkflowCheckpointSchema,fingerprintWorkflow,reconcileWorkflowTask} from "../src/orchestration/checkpoint";
import {SkillRegistry} from "../src/orchestration/registry";
import {z} from "zod";

const checkpoint = {
  schemaVersion:1 as const,runId:"run-1",workflowId:"demo",workflowFingerprint:"a".repeat(64),
  revision:1,tasks:[{taskId:"task-a",skillId:"demo.skill",skillVersion:"1.0.0",status:"completed" as const,output:{ok:true},updatedAt:10}],updatedAt:10,
};

describe("workflow checkpoints",()=>{
  it("validates versioned checkpoint records",()=>expect(WorkflowCheckpointSchema.parse(checkpoint)).toEqual(checkpoint));
  it("rejects completed tasks without output and failed tasks without error",()=>{
    const {output: _output, ...taskWithoutOutput}=checkpoint.tasks[0]!;
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[taskWithoutOutput]})).toThrow();
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[{...taskWithoutOutput,status:"failed"}]})).toThrow();
  });
  it("requires a reconciliation reason for indeterminate checkpoint tasks",()=>{
    const {output: _output, ...taskWithoutOutput}=checkpoint.tasks[0]!;
    expect(()=>WorkflowCheckpointSchema.parse({
      ...checkpoint,tasks:[{...taskWithoutOutput,status:"indeterminate"}],
    })).toThrow(/indeterminate checkpoint tasks/i);
    expect(()=>WorkflowCheckpointSchema.parse({
      ...checkpoint,tasks:[{...taskWithoutOutput,status:"indeterminate",error:"Remote outcome unknown."}],
    })).not.toThrow();
  });
  it("reconciles indeterminate tasks with evidence, output validation and revision CAS",async()=>{
    const store=new InMemoryWorkflowRunStore();
    const registry=new SkillRegistry().register({
      id:"reconcile.skill",version:"1.0.0",inputSchema:z.object({}),
      outputSchema:z.object({confirmed:z.boolean()}),execute:()=>({confirmed:true}),
    });
    const definition={id:"reconcile-flow",tasks:[{id:"task-a",skill:"reconcile.skill",input:{},dependsOn:[]}]};
    const initial={
      schemaVersion:1 as const,runId:"reconcile-run",workflowId:"reconcile-flow",
      workflowFingerprint:fingerprintWorkflow(definition),revision:0,
      tasks:[{taskId:"task-a",skillId:"reconcile.skill",skillVersion:"1.0.0",status:"indeterminate" as const,error:"Provider outcome unknown.",updatedAt:10}],
      updatedAt:10,
    };
    await store.save(initial);
    const completed=await reconcileWorkflowTask(store,registry,{
      runId:"reconcile-run",taskId:"task-a",expectedRevision:0,resolution:"completed",
      actorId:"operator:qa",evidence:"Provider operation lookup confirms completion.",
      output:{confirmed:true},
    });
    expect(completed.revision).toBe(1);
    expect(completed.tasks[0]).toMatchObject({
      status:"completed",output:{confirmed:true},
      reconciliation:{resolution:"completed",actorId:"operator:qa",evidence:"Provider operation lookup confirms completion."},
    });
    await expect(reconcileWorkflowTask(store,registry,{
      runId:"reconcile-run",taskId:"task-a",expectedRevision:0,resolution:"retry-authorized",
      actorId:"operator:qa",evidence:"Stale evidence",reason:"No operation found.",
    })).rejects.toThrow(/revision conflict/i);
    await expect(reconcileWorkflowTask(store,registry,{
      runId:"reconcile-run",taskId:"task-a",expectedRevision:1,resolution:"completed",
      actorId:"operator:qa",evidence:"bad output",output:{confirmed:"yes"},
    })).rejects.toThrow();
  });
  it("requires an explicit output property for completed reconciliation",async()=>{
    const store=new InMemoryWorkflowRunStore();
    const registry=new SkillRegistry().register({
      id:"reconcile.no-output",version:"1.0.0",inputSchema:z.object({}),
      outputSchema:z.object({ok:z.boolean()}),execute:()=>({ok:true}),
    });
    const definition={id:"reconcile-no-output",tasks:[{id:"task",skill:"reconcile.no-output",input:{},dependsOn:[]}]};
    await store.save({
      schemaVersion:1,runId:"reconcile-no-output",workflowId:definition.id,
      workflowFingerprint:fingerprintWorkflow(definition),revision:0,
      tasks:[{taskId:"task",skillId:"reconcile.no-output",skillVersion:"1.0.0",status:"indeterminate",error:"Outcome unknown.",updatedAt:1}],
      updatedAt:1,
    });
    await expect(reconcileWorkflowTask(store,registry,{
      runId:"reconcile-no-output",taskId:"task",expectedRevision:0,resolution:"completed",
      actorId:"operator:qa",evidence:"Provider confirms completion.",
    } as never)).rejects.toThrow(/output is required/i);
  });
  it("stores defensive copies and requires increasing revisions",async()=>{
    const store=new InMemoryWorkflowRunStore();
    await store.save(checkpoint);
    const loaded=await store.load("run-1");
    loaded!.tasks[0]!.output={mutated:true};
    expect((await store.load("run-1"))!.tasks[0]!.output).toEqual({ok:true});
    await expect(store.save(checkpoint)).rejects.toThrow(/revision must increase/);
    await store.save({...checkpoint,revision:2});
    expect((await store.load("run-1"))!.revision).toBe(2);
  });
  it("fingerprints object keys independent of insertion order and changes with workflow inputs",()=>{
    const first: {id:string;tasks:{id:string;skill:string;input:Record<string,unknown>;dependsOn:string[]}[]}={id:"demo",tasks:[{id:"a",skill:"demo.skill",input:{b:2,a:1},dependsOn:[]}]};
    const reordered: typeof first={id:"demo",tasks:[{id:"a",skill:"demo.skill",input:{a:1,b:2},dependsOn:[]}]};
    expect(fingerprintWorkflow(first)).toBe(fingerprintWorkflow(reordered));
    expect(fingerprintWorkflow(first)).not.toBe(fingerprintWorkflow({...first,tasks:[{...first.tasks[0]!,input:{a:2,b:2}}]}));
  });
});
