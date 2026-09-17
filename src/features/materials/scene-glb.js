import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadCachedModel} from './asset-cache.js';

async function correctMaterials(buffer,metadata){
  const entry=metadata.material_patch;if(!entry)return buffer;
  if(entry.base_sha256!==metadata.sha256)throw Error('视觉材质修正与模型版本不一致');
  const response=await fetch(new URL(entry.url,location.href),{signal:AbortSignal.timeout(15000),cache:'default'});
  if(!response.ok)throw Error('原始材质读取失败（HTTP '+response.status+'）');
  const bytes=await response.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('原始材质校验失败');
  const patch=JSON.parse(new TextDecoder().decode(bytes)),original=new Uint8Array(buffer),view=new DataView(buffer),jsonSize=view.getUint32(12,true);
  const gltf=JSON.parse(new TextDecoder().decode(original.subarray(20,20+jsonSize)));
  if(patch.schema!=='alab-visual-material-patch/1'||patch.base_sha256!==metadata.sha256||gltf.accessors.length!==patch.base_accessors||gltf.materials.length!==patch.base_materials)throw Error('视觉材质索引不匹配');
  gltf.accessors.push(...patch.accessors);gltf.materials.push(...patch.materials);
  for(const item of patch.nodes){gltf.nodes[item.index].mesh=gltf.meshes.length;gltf.meshes.push(item.mesh);}
  // Only the small JSON descriptors change. All cached geometry/texture bytes
  // are reused, including the original binary chunk, without another download.
  const json=new TextEncoder().encode(JSON.stringify(gltf)),padded=Math.ceil(json.length/4)*4;
  const tail=original.subarray(20+jsonSize),output=new Uint8Array(20+padded+tail.length),header=new DataView(output.buffer);
  output.set(original.subarray(0,20));header.setUint32(8,output.length,true);header.setUint32(12,padded,true);
  output.fill(32,20,20+padded);output.set(json,20);output.set(tail,20+padded);
  window.labVisualPatch={sha256:hash,bytes:entry.bytes,nodes:patch.nodes.length,source_subsets:patch.audit.length,geometry_bytes_reused:metadata.bytes,hidden_room_prims:patch.hidden_room_prims||[]};
  return output.buffer;
}

export async function loadScene({scene,renderer,metadata,pose,objects,parts,pickables}){
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=new RoomEnvironment();
  scene.environment=pmrem.fromScene(environment,.04).texture;environment.dispose();pmrem.dispose();
  renderer.toneMappingExposure=1.15;
  const loader=new GLTFLoader();
  const buffer=await correctMaterials(await loadCachedModel(metadata),metadata);
  const model=await loader.parseAsync(buffer,new URL('.',new URL(metadata.url,location.href)).href);
  if(model.parser.json.extras?.source_layout_sha256!==metadata.source_layout_sha256)throw Error('GLB 与当前实验室布局不一致');
  const replacements=new Set((metadata.object_overrides||[]).map(o=>o.id));
  const sources=[...model.scene.children].filter(n=>!replacements.has(n.userData.object_id));
  window.labAuxAssetCaches=[];
  for(const entry of metadata.object_overrides||[]){
    const status={object_id:entry.id,source:'loading',networkBytes:0,cachedBytes:0,totalBytes:0,complete:false,persistent:false};window.labAuxAssetCaches.push(status);
    const replacement=await loader.parseAsync(await loadCachedModel(entry,status),new URL('.',new URL(entry.url,location.href)).href);
    if(replacement.parser.json.extras?.source_layout_sha256!==metadata.source_layout_sha256||replacement.scene.children.length!==1||replacement.scene.children[0].userData.object_id!==entry.id)throw Error('替换模型与当前布局不一致');
    sources.push(...replacement.scene.children);
  }
  for(const source of sources){
    const id=source.userData.object_id;if(!id)continue;
    const root=new THREE.Group();root.name=id;pose(root,source.userData.world_pose_wxyz);scene.add(root);
    objects.set(id,root);const bodies=new Map();parts.set(id,bodies);
    for(const imported of [...source.children]){
      const {body_id,bind_pose_wxyz}=imported.userData;if(!body_id)continue;
      const body=new THREE.Group();body.name=body_id;pose(body,bind_pose_wxyz);root.add(body);bodies.set(body_id,body);
      // Loaded glTF geometry is Y-up. Restore the visual basis below each body;
      // live body transforms remain in the same Z-up metres as PhysX.
      imported.position.set(0,0,0);imported.quaternion.identity();imported.scale.set(1,1,1);imported.updateMatrix();
      const visual=new THREE.Group();visual.rotation.x=Math.PI/2;visual.add(imported);body.add(visual);
      imported.traverse(mesh=>{if(mesh.isMesh){mesh.userData.objectId=id;mesh.castShadow=true;mesh.receiveShadow=true;
        if(id!=='room')pickables.push(mesh);
      }});
    }
  }
  return {source:'private_v4_usd_visuals',bytes:metadata.bytes,materials:metadata.materials,textures:metadata.texture_images,material_patch:window.labVisualPatch||null,object_overrides:[...replacements]};
}
