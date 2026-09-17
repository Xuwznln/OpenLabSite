import { describe, expect, it } from 'vitest';
import { loadRecordedActions, replayTimeline, replayPosition, selectReplayActions, type RecordedAction } from './replay';

const action=(id:string,node:string,duration:number,objects:any):RecordedAction=>({id,run_id:'run-1',node_id:node,
  trajectory:{duration_s:duration,end_state:{objects},frames:[{at:0},{at:1}]}});

describe('recorded trajectory replay',()=>{
  it('selects only recorded robot transfer, tray and rail motions, including partial runs',()=>{
    const nodes=[
      {id:'pick',device_id:'mwb_robot_a',operation:'transfer'},
      {id:'uncap',device_id:'mwb_dosing',operation:'uncap'},
      {id:'weigh',device_id:'mwb_dosing',operation:'weigh'},
      {id:'rail',device_id:'mwb_robot_b',operation:'rail'},
      {id:'tray',device_id:'mwb_robot_b',operation:'tray'},
      {id:'heat',device_id:'mwb_furnace',operation:'heat'},
      {id:'virtual',device_id:'mwb_transport',operation:'virtual_transport'},
      {id:'store',device_id:'mwb_robot_c',operation:'transfer'},
    ];
    const actions=nodes.map(n=>action(n.id,n.id,20,{}));
    expect(selectReplayActions(actions,nodes,'motion').map(a=>a.node_id)).toEqual(['pick','rail','tray','store']);
    expect(selectReplayActions(actions.slice(0,3),nodes,'motion').map(a=>a.node_id)).toEqual(['pick']);
    expect(selectReplayActions(actions,nodes,'full')).toBe(actions);
    expect(selectReplayActions([],nodes,'motion')).toEqual([]);
  });
  it('skips process time while retaining furnace, sample and gripper state across jumps',()=>{
    const initial={objects:{robot:{x:0,grip:'open'},sample:{x:0},door:{open:false}},temperature_C:25};
    const actions=[
      action('c1','open',5,{door:{open:true}}),
      action('c2','load',20,{robot:{x:1,grip:'closed'},sample:{x:1}}),
      action('c3','heat',7200,{}),
      action('c4','release',5,{robot:{x:1,grip:'open'}}),
      action('c5','unload',30,{robot:{x:2,grip:'open'},sample:{x:2}}),
      action('c6','close',5,{door:{open:false}}),
    ];
    actions[2]!.trajectory.end_state.temperature_C=80;
    const evidence=JSON.stringify(actions);
    const timeline=replayTimeline(initial,actions,new Set(['load','unload']));
    expect(timeline.map(e=>[e.node_id,e.start,e.end])).toEqual([['load',0,20],['unload',20,50]]);
    expect(replayPosition(timeline,20)).toMatchObject({index:1,fraction:0,completed:false});
    expect(timeline[1]!.before).toMatchObject({objects:{robot:{x:1,grip:'open'},sample:{x:1},door:{open:true}},temperature_C:80});
    expect(replayPosition(timeline,0).entry?.before).toMatchObject({objects:{robot:{x:0,grip:'open'},sample:{x:0},door:{open:true}},temperature_C:25});
    expect(replayPosition(timeline,50)).toMatchObject({index:2,elapsed:50,fraction:1,completed:true});
    expect(timeline[1]!.after.objects.door.open).toBe(true); // no trailing hidden animation
    expect(JSON.stringify(actions)).toBe(evidence);
    expect(initial.objects.door.open).toBe(false);
    expect(replayPosition(replayTimeline(initial,actions,new Set()),5)).toMatchObject({total:0,index:0,completed:true});
  });
  it('restores unchanged objects when seeking forwards and backwards without mutating evidence',()=>{
    const initial={objects:{robot:{x:0},sample:{x:0}}};
    const actions=[action('c1','n1',5,{robot:{x:1}}),action('c2','n2',10,{sample:{x:2}})];
    const timeline=replayTimeline(initial,actions);
    expect(timeline[1]!.before.objects).toEqual({robot:{x:1},sample:{x:0}});
    expect(timeline[1]!.after.objects).toEqual({robot:{x:1},sample:{x:2}});
    expect(replayPosition(timeline,10)).toMatchObject({index:1,fraction:.5,completed:false});
    expect(replayPosition(timeline,2).entry?.before).toEqual(initial);
    expect(replayPosition(timeline,200)).toMatchObject({index:2,fraction:1,elapsed:15,completed:true});
    expect(replayPosition(timeline,-1)).toMatchObject({index:0,fraction:0});
    expect(initial.objects.robot.x).toBe(0);
  });
  it('pages through journal events and loads only committed actions using GET',async()=>{
    const calls:string[]=[];
    const first=Array.from({length:200},(_,i)=>({seq:i+1,type:'mcp_tool_call',payload:{}}));
    first[3]={seq:4,type:'driver_command',payload:{command_id:'unfinished'}} as any;
    first[199]={seq:200,type:'driver_return_ready',payload:{command_id:'c1'}} as any;
    const read:any=async(path:string,body?:unknown)=>{
      expect(body).toBeUndefined();calls.push(path);
      if(path.endsWith('after=0'))return {events:first};
      if(path.endsWith('after=200'))return {events:[{seq:201,type:'driver_return_ready',payload:{command_id:'c2'}}]};
      return path.endsWith('/c1')?action('c1','n1',5,{}):action('c2','n2',10,{});
    };
    const run={id:'run-1',next_index:2,compiled:{nodes:[{id:'n1'},{id:'n2'}]}};
    const result=await loadRecordedActions(run,()=>{},read);
    expect(result.map(a=>a.id)).toEqual(['c1','c2']);
    expect(calls).toHaveLength(4);expect(calls.some(path=>path.includes('unfinished'))).toBe(false);
  });
  it('rejects incomplete or mismatched trajectories instead of inventing a replay',async()=>{
    const run={id:'run-1',next_index:2,compiled:{nodes:[{id:'n1'}]}};
    const read:any=async()=>({events:[{seq:1,type:'driver_return_ready',payload:{command_id:'c1'}}]});
    await expect(loadRecordedActions(run,()=>{},read)).rejects.toThrow('历史轨迹不完整');
    await expect(loadRecordedActions({...run,next_index:1},()=>{},async(path:string)=>path.includes('events?')?await read():action('c1','other-node',5,{}) as any)).rejects.toThrow('顺序不一致');
  });
});
