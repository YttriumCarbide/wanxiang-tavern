import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { enemies, type EnemyId } from './model-data.ts'

type V = [number, number, number]
type Material = T.MeshStandardMaterial
type Joint = { node: T.Group; role: string; side: number; phase: number; p: T.Vector3; r: T.Euler }
const TAU = Math.PI * 2, V3 = (p: V) => new T.Vector3(...p)
const sphereGeo = new T.SphereGeometry(1, 20, 14)
const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, .065)
function material(name: string, color: string, metallic = .4, roughness = .4, glow?: string) {
  const m = new T.MeshStandardMaterial({ color, metalness: metallic, roughness, emissive: glow || '#000000', emissiveIntensity: glow ? 1.6 : 0, side: T.DoubleSide }); m.name = name; return m
}
const gold = material('Sunforged_gold', '#d4aa57', .82, .28), ivory = material('Platinum_armor', '#e1daca', .73, .31), pale = material('Pale_gold', '#e2cc8e', .77, .27), darkGold = material('Recessed_bronze', '#7b5a2f', .72, .44)
const iron = material('Weathered_titanium', '#525e61', .82, .37), graphite = material('Graphite_armor', '#2c3336', .78, .32), steel = material('Machined_silver', '#9aaba9', .88, .24), black = material('Obsidian', '#111318', .46, .32)
const amber = material('Solar_core', '#ffcc59', .1, .27, '#ff9f25'), cyan = material('Lunar_phloem', '#6be4f0', .2, .24, '#32a7bd'), violet = material('Curse_vessels', '#c09bff', .14, .25, '#8c4bb7')
const wood = material('Ancient_heartwood', '#423c2e', .14, .85), bark = material('Ironwood_bark', '#585440', .21, .72), moss = material('Verdigris_foliage', '#496b51', .29, .55)
const tar = material('Living_pitch', '#16151d', .5, .16), fur = material('Blackened_fleece', '#25242b', .23, .6), hornM = material('Striated_horn', '#655e5a', .48, .43)
const membrane = material('Gilded_wing_membrane', '#bb8b40', .38, .48), bone = material('Ancient_ivory', '#d4c9a9', .22, .43)
const scaleGeometry = (() => {
  const g = new T.BufferGeometry(), pts = [0,.23,0, 0,0,-1, .49,.035,-.25, .58,0,.4, .21,0,.79, -.21,0,.79, -.58,0,.4, -.49,.035,-.25]
  const indices: number[] = []; for(let j=1;j<8;j++) indices.push(0,j===7?1:j+1,j)
  g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(indices);g.computeVertexNormals();return g
})()
function add(p: T.Object3D, geo: T.BufferGeometry, m: Material, pos: V = [0,0,0], scale: V = [1,1,1]) { const mesh = new T.Mesh(geo,m);mesh.position.set(...pos);mesh.scale.set(...scale);p.add(mesh);return mesh }
function ball(p:T.Object3D,at:V,s:V,m:Material){return add(p,sphereGeo,m,at,s)}
function box(p:T.Object3D,at:V,s:V,m:Material,rotation:V=[0,0,0]){const mesh=add(p,boxGeo,m,at,s);mesh.rotation.set(...rotation);return mesh}
function group(p:T.Object3D,name:string,at:V=[0,0,0],part?:number){const g=new T.Group();g.name=name;g.position.set(...at);if(part!==undefined)g.userData.anatomyIndex=part;p.add(g);return g}
function tube(p:T.Object3D,points:V[],radii:number[],m:Material,segments=20,sides=10,ellipticity=1){
  const crv=new T.CatmullRomCurve3(points.map(V3)),frames=crv.computeFrenetFrames(segments,false);const pts:number[]=[],indices:number[]=[]
  for(let i=0;i<=segments;i++){const u=i/segments,center=crv.getPointAt(u),f=u*(radii.length-1), k=Math.min(Math.floor(f),radii.length-2);const radius=Math.max(.0008,T.MathUtils.lerp(radii[k],radii[k+1],f-k))
    for(let j=0;j<sides;j++){const a=TAU*j/sides,pt=center.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius*ellipticity).addScaledVector(frames.binormals[i],Math.sin(a)*radius);pts.push(pt.x,pt.y,pt.z)}
  }
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c)}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(indices);g.computeVertexNormals();return add(p,g,m)
}
function taper(p:T.Object3D,a:V,b:V,c:V,r:number,m:Material){return tube(p,[a,b,c],[r,r*.5,.001],m,12,9)}
function link(p:T.Object3D,a:V,b:V,r:number,r2:number,m:Material,sides=14){const va=V3(a),vb=V3(b),d=vb.clone().sub(va),g=new T.CylinderGeometry(r2,r,d.length(),sides);const mesh=add(p,g,m);mesh.position.copy(va.add(vb).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return mesh}
function ring(p:T.Object3D,at:V,r:number,thick:number,m:Material,axis:V=[0,0,1],segments=30){const mesh=add(p,new T.TorusGeometry(r,thick,6,segments),m,at);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),V3(axis).normalize());return mesh}
function plate(p:T.Object3D,at:V,s:V,normal:V,m:Material){const mesh=add(p,scaleGeometry,m,at,s);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),V3(normal).normalize());return mesh}
function armorSkin(p:T.Object3D,at:V,size:V,rows:number,cols:number,materials:Material[]){for(let i=0;i<rows;i++){const z=-.94+1.88*(i+.5)/rows,rr=Math.sqrt(1-z*z);for(let j=0;j<cols;j++){const a=(j+(i%2)*.5)*TAU/cols,x=Math.cos(a)*rr,y=Math.sin(a)*rr;plate(p,[at[0]+x*size[0],at[1]+y*size[1],at[2]+z*size[2]],[size[0]*6.3*rr/cols,.13,size[2]*2.35/rows],[x/size[0],y/size[1],z/size[2]],materials[(i*7+j*3)%materials.length])}}}
function glowRibbon(p:T.Object3D,points:V[],width:number,m:Material){const c=new T.CatmullRomCurve3(points.map(V3)),v:number[]=[],idx:number[]=[];for(let i=0;i<=35;i++){const t=i/35,a=c.getPoint(t),w=Math.sin(t*Math.PI)*width;v.push(a.x,a.y+w,a.z,a.x,a.y-w,a.z+.02);if(i){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k)}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();add(p,g,m)}
function optimize(g:T.Group){g.children.filter(x=>x instanceof T.Group).forEach(x=>optimize(x as T.Group));const byMat=new Map<Material,T.BufferGeometry[]>();[...g.children].forEach(obj=>{if(!(obj instanceof T.Mesh))return;obj.updateMatrix();const geo=obj.geometry.clone().applyMatrix4(obj.matrix);for(const name of Object.keys(geo.attributes))if(name!=='position'&&name!=='normal')geo.deleteAttribute(name);if(!geo.index)geo.setIndex(Array.from({length:geo.attributes.position.count},(_,i)=>i));let list=byMat.get(obj.material);if(!list){list=[];byMat.set(obj.material,list)}list.push(geo);g.remove(obj)});byMat.forEach((geos,m)=>{const geo=mergeGeometries(geos,false);if(geo){const mesh=new T.Mesh(geo,m);mesh.name=g.name+'_'+m.name;g.add(mesh)}geos.forEach(geo=>geo.dispose())})}

export function buildModel(id:EnemyId){
  const info=enemies.find(e=>e.id===id)!,root=new T.Group();root.name=id.replaceAll('-','_');root.userData={archive:info.number,name:info.name,parts:info.parts.map(p=>p.name),modelType:'Articulated procedural creature',author:'Plane Threat Archive'}
  const joints:Joint[]=[];const joint=(node:T.Group,role:string,side=1,phase=0)=>{joints.push({node,role,side,phase,p:node.position.clone(),r:node.rotation.clone()});return node}
  const rig=joint(group(root,'Entity_Root'),'root');
  if(id==='radiant-wyvern'){
    const torso=group(rig,'Platinum_Scale_Armor',[0,0,0],1);ball(torso,[0,1.72,-.08],[.63,.76,1.3],ivory);ball(torso,[0,1.98,.62],[.59,.75,.72],pale);armorSkin(torso,[0,1.72,-.08],[.645,.775,1.32],18,18,[ivory,pale,ivory,gold,ivory]);
    for(let k=0;k<11;k++){const z=-1.19+k*.19,y=1.72+.74*Math.sqrt(Math.max(0,1-((z+.08)/1.3)**2));taper(torso,[0,y,z],[0,y+.14,z-.06],[0,y+.27+.12*Math.sin(k/10*Math.PI),z-.19],.105,gold)}
    const neck=joint(group(rig,'Armored_Neck',[0,2.06,.65],1),'neck');tube(neck,[[0,0,0],[0,.44,.22],[.015,.96,.42],[0,1.4,.67],[0,1.64,.87]],[.43,.39,.32,.24,.22],ivory,35,24)
    for(let k=0;k<16;k++){const t=k/15,y=t*1.61,z=.82*t+.04*Math.sin(t*Math.PI),r=.43-t*.205;for(let j=0;j<12;j++){const a=TAU*(j+(k%2)*.5)/12;plate(neck,[Math.cos(a)*r,y+Math.sin(a)*.035,z+Math.sin(a)*r],[.23-t*.08,.13,.16],[Math.cos(a),.17,Math.sin(a)],(j+k)%4===0?gold:ivory)}if(k%2===0)taper(neck,[0,y,z-r*.7],[0,y+.17,z-r-.1],[0,y+.26,z-r-.27],.09,gold)}
    const head=joint(group(neck,'Crowned_Skull',[0,1.58,.86]),'head');
    const sections=[[-.37,.06,.11,.14],[-.21,.06,.271,.227],[.02,.07,.337,.241],[.22,.05,.322,.198],[.42,-.015,.221,.139],[.63,-.057,.198,.097],[.79,-.071,.207,.104],[.91,-.123,.128,.099],[.991,-.207,.026,.065],[1.002,-.266,.003,.009]];const pos:number[]=[],idx:number[]=[],n=24;
    sections.forEach(([z,y,rx,ry],k)=>{for(let j=0;j<n;j++){const a=j*TAU/n,co=Math.cos(a),si=Math.sin(a);pos.push(Math.sign(co)*Math.pow(Math.abs(co),.79)*rx,y+Math.sign(si)*Math.pow(Math.abs(si),.83)*ry,z);if(k){const v=k*n+j,w=k*n+(j+1)%n;idx.push(v-n,w-n,v,w-n,w,v)}}});const skull=new T.BufferGeometry();skull.setAttribute('position',new T.Float32BufferAttribute(pos,3));skull.setIndex(idx);skull.computeVertexNormals();add(head,skull,ivory);
    for(let k=0;k<6;k++){const z=.05+k*.127;plate(head,[0,.27-k*.043,z],[.25-k*.022,.12,.136],[0,1,.13],k%2?pale:gold)}
    armorSkin(torso,[0,1.98,.62],[.603,.763,.737],14,17,[ivory,pale,ivory,gold]);
    for(const side of [-1,1])for(let k=0;k<6;k++){const t=k/6;plate(torso,[side*(.26+.12*Math.sin(t*Math.PI)),1.63+t*.72,1.15-t*.17],[.31,.19,.34],[side*.55,.13,.85],k%3?ivory:pale)}
    const jaw=joint(group(head,'Articulated_Jaw',[0,-.14,.2]),'jaw');ball(jaw,[0,-.07,.28],[.223,.085,.365],darkGold);ball(jaw,[0,-.015,.3],[.19,.025,.325],black)
    for(const s of [-1,1]){ball(head,[s*.291,.102,.29],[.042,.069,.096],amber);ball(head,[s*.327,.106,.31],[.012,.046,.014],black);tube(head,[[s*.25,.18,.41],[s*.32,.2,.25],[s*.35,.19,.015]],[.045,.065,.008],gold,12,8)
      ball(head,[s*.168,-.008,.754],[.044,.033,.026],black);taper(head,[s*.18,.22,.03],[s*.31,.48,-.19],[s*.49,.85,-.64],.123,gold);taper(head,[s*.22,.15,-.11],[s*.4,.26,-.36],[s*.61,.45,-.8],.115,pale)
      for(let k=0;k<5;k++){taper(head,[s*(.235+k*.012),.09-k*.046,.18-k*.11],[s*(.33+k*.027),.14-k*.03,-.04-k*.13],[s*(.42+k*.044),.22-k*.015,-.16-k*.16],.075, k%2?ivory:gold)}
      for(let k=0;k<8;k++){const z=.27+k*.066,len=k===5?.135:.064+.022*(k%3);link(head,[s*(.215-k*.003),-.136,z],[s*(.214-k*.003),-.136-len,z+.018],.019,.001,bone,7);if(k%2===0)link(jaw,[s*.18,-.004,z-.2],[s*.18,.06,z-.19],.016,.001,bone,7)}
    }
    for(let k=0;k<4;k++)taper(head,[0,.23,.3-k*.1],[0,.34+k*.06,.18-k*.14],[0,.41+k*.09,.08-k*.18],.075,pale)
    const beam=joint(group(head,'Solaran_Holy_Fire',[0,-.13,.71]),'specialfx');link(beam,[0,0,.01],[0,0,3.7],.11,.025,amber,22);link(beam,[0,0,.01],[0,0,3.1],.056,.019,material('White_hot_sun','#fff6cb',0,.2,'#fff1a8'),16)
    for(const s of [-1,1]){
      const wing=joint(group(rig,`Solar_Wing_${s<0?'L':'R'}`,[s*.43,2.24,.38],0),'wing',s);const wrist:V=[s*1.45,1.47,.59],elbow:V=[s*.68,.46,-.36];tube(wing,[[0,0,0],elbow,wrist],[.235,.14,.106],pale,24,14)
      const ends:V[]=[[s*3.51,2.37,.06],[s*3.33,1.04,-.35],[s*2.76,.22,-.91],[s*1.87,-.22,-1.16],[s*.88,-.34,-1.02],[0,-.34,-.68]]
      for(let f=0;f<ends.length-1;f++){
        const pts:number[]=[],idx:number[]=[],n=10;for(let i=0;i<=n;i++)for(let j=0;j<=n;j++){const u=i/n,t=j/n,b=V3(ends[f]).lerp(V3(ends[f+1]),t);b.y+=.23*Math.sin(t*Math.PI);const v=V3(wrist).lerp(b,u);v.z-=Math.sin(u*Math.PI)*Math.sin(t*Math.PI)*.18;pts.push(v.x,v.y,v.z);if(i&&j){const k=i*(n+1)+j;idx.push(k-n-2,k-1,k-n-1,k-1,k,k-n-1)}}const mesh=new T.BufferGeometry();mesh.setAttribute('position',new T.Float32BufferAttribute(pts,3));mesh.setIndex(idx);mesh.computeVertexNormals();add(wing,mesh,membrane)
        const ep=ends[f],mid:V=[(ep[0]+wrist[0])*.5,(ep[1]+wrist[1])*.5+.08,(ep[2]+wrist[2])*.5];tube(wing,[wrist,mid,ep],[f===0?.093:.05,.028,.008],f===0?pale:gold,16,8)
        for(let v=1;v<=3;v++){const b=V3(ends[f]).lerp(V3(ends[f+1]),v/4);b.y+=.23*Math.sin(v/4*Math.PI);const a=V3(wrist).lerp(b,.35);a.z-=.09;const mid=a.clone().lerp(b,.5);mid.z-=.06;tube(wing,[a.toArray() as V,mid.toArray() as V,b.toArray() as V],[.009,.006,.002],darkGold,7,5)}
      }
      ball(wing,wrist,[.15,.13,.13],ivory);taper(wing,wrist,[s*1.54,1.68,.7],[s*1.46,1.85,.83],.083,gold)
      for(let k=0;k<7;k++)plate(wing,[s*(.2+k*.1),.14+k*.077,.02-k*.048],[.18,.13,.21],[s*.2,1,0],k%2?ivory:pale)
      for(let front=0;front<2;front++){
        const z=front?.72:-.65;const leg=joint(group(rig,`${front?'Foreclaw':'Hindleg'}_${s<0?'L':'R'}`,[s*(front?.4:.45),front?1.75:1.56,z],2),'leg',s,front);const a:V=[s*.2,-.55,front?-.11:.38],b:V=[s*.28,-1.14,front?.13:-.13],foot:V=[s*.32,front?-1.56:-1.39,.28]
        tube(leg,[[0,0,0],a,b,foot],[front?.18:.31,front?.13:.23,.096,.09],ivory,24,15);ball(leg,a,[.18,.215,.19],pale);ball(leg,foot,[.155,.095,.205],darkGold)
        for(let k=0;k<7;k++){const t=k/7;plate(leg,[s*(.12+.19*t),-.2-t*1.1,.22],[.18-t*.04,.11,.17],[s,.2,.3],k%2?pale:gold)}
        for(let k=0;k<3;k++){const dx=(k-1)*.12;tube(leg,[[foot[0]+dx*.35,foot[1],foot[2]],[foot[0]+dx,foot[1]-.04,foot[2]+.17],[foot[0]+dx*1.6,foot[1]-.065,foot[2]+.37-(k%2)*.04]],[.07,.05,.006],gold,12,9)}
      }
    }
    const tail=joint(group(rig,'Gilded_Tail',[0,1.57,-1.13],1),'tail');tube(tail,[[0,0,0],[-.14,-.29,-.65],[.03,-.76,-1.29],[.69,-1.05,-1.7],[1.35,-.94,-1.38],[1.71,-.62,-1.05]],[.34,.24,.16,.09,.042,.004],pale,43,18)
    for(let k=0;k<10;k++){const t=k/10;taper(tail,[-.11*Math.sin(t*Math.PI),-.05-t*.7,-t*1.27],[0,.11-t*.72,-t*1.28-.03],[0,.18-t*.77,-t*1.32-.13],.075*(1-t*.5),gold)}
    const slash=joint(group(rig,'Wingblade_Afterglow'),'normalfx');for(let k=0;k<3;k++)glowRibbon(slash,[[-2.7,.6+k*.14,.2],[-1.4,1.1+k*.14,1.45],[.2,1.85+k*.14,1.82],[1.8,2.52+k*.14,.78]],.042-k*.006,amber)
  }
  if(id==='apep-lamb'){
    const torso=group(rig,'Cursed_Body');ball(torso,[0,1.67,-.12],[.86,.91,1.17],tar);ball(torso,[0,2.01,.46],[.94,.72,.76],fur);armorSkin(torso,[0,1.7,-.1],[.875,.94,1.20],16,17,[fur,black,tar]);
    for(let k=0;k<48;k++){const a=k*2.39996,z=-.9+(k%11)*.17,rr=Math.sqrt(1-((z+.1)/1.3)**2),x=Math.cos(a)*.82*rr,y=1.7+Math.sin(a)*.83*rr;taper(torso,[x,y,z],[x*1.17,y-.12,z-.13],[x*1.26,y-.43-(k%4)*.05,z-.29],.12+(k%3)*.021,k%4===0?tar:fur)}
    const head=joint(group(rig,'Ram_Skull',[0,2.13,.98],0),'head');ball(head,[0,.03,.05],[.425,.46,.43],fur);tube(head,[[0,.12,.12],[0,.04,.39],[0,-.18,.59],[0,-.26,.67]],[.32,.28,.198,.13],fur,24,18,.88);ball(head,[0,-.21,.67],[.17,.108,.105],tar)
    for(const s of [-1,1]){ball(head,[s*.327,.132,.32],[.035,.051,.097],violet);tube(head,[[s*.26,.21,.42],[s*.37,.2,.32],[s*.41,.15,.15]],[.046,.053,.024],black,12,9);taper(head,[s*.29,.17,-.04],[s*.47,.15,-.06],[s*.72,.04,-.16],.144,fur)
      const pts:V[]=[],rs:number[]=[];for(let k=0;k<=34;k++){const t=k/34,a=t*Math.PI*1.91+.15,R=.57-.295*t;pts.push([s*(.31+.53*Math.sin(t*Math.PI*.72)),.16+Math.cos(a)*R,-.02-Math.sin(a)*R]);rs.push(.174*(1-t)**.65+.007)}tube(head,pts,rs,hornM,68,14);for(let k=1;k<30;k++){const a=V3(pts[k+1]).sub(V3(pts[k-1])).normalize();ring(head,pts[k],rs[k]*1.015,.014*(1-k/35),k%3?darkGold:hornM,a.toArray() as V,18)}
      taper(head,[s*.15,-.13,.49],[s*.19,-.26,.56],[s*.17,-.38,.61],.038,bone);for(let k=0;k<6;k++)taper(head,[s*(.06+k*.042),-.18,.27-k*.05],[s*(.1+k*.035),-.4,.3-k*.075],[s*(.09+k*.043),-.68+(k%2)*.08,.32-k*.07],.08,fur)
    }
    for(const s of [-1,1])for(let j=0;j<2;j++){const limb=joint(group(rig,`Aberrant_Limb_${s<0?'L':'R'}_${j}`,[s*.59,1.75,j?.65:-.72]),'leg',s,j);const foot:V=[s*(j?.45:.19),-1.59,j?.49:-.15];tube(limb,[[0,0,0],[s*.2,-.53,j?.29:.12],[s*.41,-.94,j?-.09:-.18],foot],[.35,.30,.20,.145],tar,26,16);armorSkin(limb,[s*.13,-.29,.03],[.34,.43,.32],7,11,[fur,tar,black]);ball(limb,foot,[.23,.135,.26],tar);for(let k=0;k<4;k++){const x=foot[0]+(k-1.5)*.1;taper(limb,[x,foot[1],foot[2]+.09],[x+(k-1.5)*.035,foot[1]-.015,foot[2]+.31],[x+(k-1.5)*.066,foot[1]-.105,foot[2]+.47],.064,black)}}
    for(let k=0;k<13;k++){const a=k*TAU/13,s=Math.cos(a)>0?1:-1;const t=joint(group(rig,`Pitch_Tendril_${k}`,[Math.cos(a)*.67,1.2+(k%3)*.32,Math.sin(a)*.8],1),'tendril',s,k*.65);const rr=1.18+(k%4)*.23;const pts:V[]=[[0,0,0],[Math.cos(a)*.41,-.22,Math.sin(a)*.44],[Math.cos(a)*.86,-.78,Math.sin(a)*.79],[Math.cos(a+.26)*rr,-1.05+(k%3)*.17,Math.sin(a+.26)*rr],[Math.cos(a+.65)*(rr+.22),-.66+(k%4)*.25,Math.sin(a+.65)*(rr+.19)]];tube(t,pts,[.196,.169,.111,.063,.001],tar,34,12);if(k%2===0){const cp:V[]=pts.map(p=>[p[0],p[1]+.06,p[2]]);tube(t,cp,[.018,.013,.009,.006,.001],violet,24,6)}for(let j=1;j<4;j++)taper(t,pts[j],[pts[j][0]+s*.02,pts[j][1]-.12,pts[j][2]],[pts[j][0]+s*.045,pts[j][1]-.23,pts[j][2]-.045],.043,tar)}
    const larvae=joint(group(rig,'Tar_Offspring',[0,0,0],2),'larvae');for(let k=0;k<8;k++){const a=k*2.399,r=1.08+(k%3)*.32;for(let j=0;j<6;j++)ball(larvae,[Math.cos(a)*r+Math.sin(j*.5)*.23,.09+Math.sin(j/5*Math.PI)*.035,Math.sin(a)*r+j*.054],[.075+Math.sin(j/5*Math.PI)*.045,.064,.074],tar);ball(larvae,[Math.cos(a)*r,.13,Math.sin(a)*r],[.023,.015,.022],violet)}
    const wave=joint(group(rig,'Planar_Venom_Flood'),'specialfx');for(let k=0;k<4;k++)ring(wave,[0,.08+k*.025,0],.7+k*.47,.055-k*.009,k%2?tar:violet,[0,1,0],50)
    const lash=joint(group(rig,'Hex_Whiplash'),'normalfx');glowRibbon(lash,[[-2,.3,.9],[-1.2,.45,1.7],[.5,.9,2.0],[1.7,1.5,.9]],.055,violet)
  }
  if(id==='moon-eye'){
    const core=group(rig,'Living_Tree_Trunk',[0,0,0],0);for(let k=0;k<17;k++){const a=TAU*k/17;const pts:V[]=[];for(let j=0;j<8;j++){const t=j/7,ang=a+t*.72,r=.38+.09*Math.sin(t*Math.PI*2)+Math.max(0,.48-t)*.5;pts.push([Math.cos(ang)*r,t*2.87+.18,Math.sin(ang)*r])}tube(core,pts,[.19,.21,.17,.145,.13,.15,.11,.055],k%3?wood:bark,26,11)}
    for(let k=0;k<8;k++){const a=k*TAU/8;const pts:V[]=Array.from({length:8},(_,j)=>[Math.cos(a+j*.1)*(.46+Math.sin(j)*.06),.4+j*.3,Math.sin(a+j*.1)*(.46+Math.sin(j)*.06)] as V);tube(core,pts,[.029,.02,.027,.016,.023,.017,.012,.005],cyan,23,7)}
    const eye=joint(group(core,'Silver_Iris',[0,2.14,.41]),'head');ball(eye,[0,0,0],[.625,.646,.28],graphite);ring(eye,[0,0,.214],.51,.091,steel,[0,0,1],64);ring(eye,[0,0,.295],.43,.033,iron,[0,0,1],60);ring(eye,[0,0,.307],.379,.025,cyan);ball(eye,[0,0,.255],[.37,.389,.151],cyan);ball(eye,[0,0,.394],[.056,.275,.028],black)
    for(let k=0;k<18;k++){const a=k*TAU/18;const o=box(eye,[Math.cos(a)*.527,Math.sin(a)*.527,.276],[.073,.082,.047],k%3?iron:steel);o.rotation.z=a;ball(eye,[Math.cos(a)*.513,Math.sin(a)*.513,.309],[.016,.016,.008],darkGold)}
    const ray=joint(group(eye,'Lunar_Eclipse_Ray',[0,0,.41]),'specialfx');link(ray,[0,0,0],[0,0,3.25],.09,.04,cyan,20)
    for(const s of [-1,1]){const pod=group(core,`Shoulder_Missile_Pod_${s<0?'L':'R'}`,[s*.75,1.98,.07]);box(pod,[s*.1,0,-.04],[.71,.65,.81],graphite,[0,s*.06,s*-.09]);box(pod,[s*.12,0,.37],[.647,.591,.065],iron);for(let i=0;i<2;i++)for(let j=0;j<3;j++){const p:V=[s*(.12+(j-1)*.18),(i-.5)*.21,.419];link(pod,[p[0],p[1],.39],p,.074,.076,black,16);ring(pod,p,.075,.011,steel)}for(let k=0;k<3;k++)tube(core,[[s*.34,1.46+k*.093,-.09],[s*.71,1.45+k*.103,-.21],[s*1.02,1.8+k*.075,-.1]],[.067,.073,.054],k===1?cyan:wood,17,9)
      tube(core,[[s*.39,1.67,.20],[s*.63,2.3,.06],[s*.67,2.86,-.1],[s*.99,3.45,-.26]],[.25,.2,.13,.008],wood,28,13);for(let k=0;k<3;k++)taper(core,[s*.6,2.49+k*.15,-.07],[s*(.85+k*.06),2.79+k*.18,-.14],[s*(.93+k*.11),3.01+k*.19,-.21],.09,bark)
    }
    const crown=joint(group(rig,'Lunar_Canopy',[0,2.99,0],1),'crown');for(let k=0;k<10;k++){const a=TAU*k/10,rr=1.1+(k%3)*.17,tip:V=[Math.cos(a)*rr,.25+(k%3)*.17,Math.sin(a)*rr];tube(crown,[[0,0,0],[Math.cos(a)*.46,.2,Math.sin(a)*.46],tip],[.13,.081,.016],wood,20,9);for(let j=0;j<5;j++){const t=.38+j*.135,phi=a+Math.sin(j)*.12,x=Math.cos(phi)*rr*t,z=Math.sin(phi)*rr*t,y=tip[1]*t+.08;const leaf=plate(crown,[x,y,z],[.37,.19,.44],[Math.cos(a)*.21,1,Math.sin(a)*.21],j%3?moss:bark);leaf.rotateY(-a+Math.PI*.5);leaf.rotateX(-.14);tube(crown,[[x,y+.026,z],[x+Math.cos(a)*.16,y+.06,z+Math.sin(a)*.16],[x+Math.cos(a)*.32,y+.014,z+Math.sin(a)*.32]],[.016,.009,.002],j%3?bark:cyan,8,5)}if(k%2===0){const x=tip[0]*.73,z=tip[2]*.73,y=tip[1]-.07;tube(crown,[[x,y,z],[x,y-.19,z],[x+.04,y-.35,z]],[.034,.021,.033],wood,8,7);ball(crown,[x+.04,y-.52,z],[.134,.236,.141],material(`Cultivation_pod_${k}`,'#73a99f',.26,.23,'#123b36'));ring(crown,[x+.04,y-.36,z],.091,.017,steel,[0,1,0]);for(let q=0;q<3;q++){const b=q*TAU/3;tube(crown,[[x+.04,y-.3,z],[x+.04+Math.cos(b)*.139,y-.52,z+Math.sin(b)*.139],[x+.04,y-.75,z]],[.015,.013,.005],bark,11,6)}}}
    for(let k=0;k<9;k++){const a=TAU*k/9,s=Math.cos(a)>0?1:-1,rr=1.19+(k%3)*.24;const r=joint(group(rig,`Moon_Root_${k}`,[Math.cos(a)*.26,1.03,Math.sin(a)*.26],2),'tendril',s,k*.65);const pts:V[]=[[0,0,0],[Math.cos(a)*.43,-.19,Math.sin(a)*.43],[Math.cos(a+.08)*.85,-.57,Math.sin(a+.08)*.85],[Math.cos(a+.15)*rr,-.91,Math.sin(a+.15)*rr],[Math.cos(a+.35)*(rr+.39),-.99,Math.sin(a+.35)*(rr+.39)]];tube(r,pts,[.291,.234,.18,.101,.009],k%2?wood:bark,25,14);for(let w=0;w<3;w++){const path:V[]=pts.map((pt,j)=>[pt[0]+Math.cos(j*1.5+w*2)*(.12-j*.022),pt[1]+.055,pt[2]+Math.sin(j*1.5+w*2)*(.12-j*.022)]);tube(r,path,[.072,.061,.047,.025,.001],w===2&&k%3===0?cyan:wood,23,8)}for(const d of [-1,1])taper(r,pts[3],[pts[3][0]+Math.cos(a+d*.48)*.29,-1.01,pts[3][2]+Math.sin(a+d*.48)*.29],[pts[3][0]+Math.cos(a+d*.73)*.55,-1.025,pts[3][2]+Math.sin(a+d*.73)*.55],.091,bark);if(k%2===0)ring(r,pts[1],.24,.043,steel,V3(pts[2]).sub(V3(pts[0])).normalize().toArray() as V)}
  }
  if(id==='ares'){
    const chassis=group(rig,'Ares_Chassis',[0,0,0],0);box(chassis,[0,1.66,0],[.94,.53,.65],graphite);link(chassis,[0,1.66,0],[0,2.18,0],.27,.34,steel);for(let k=0;k<4;k++)ring(chassis,[0,1.77+k*.083,0],.3+k*.013,.035,graphite,[0,1,0]);
    const chest=joint(group(chassis,'Torso_Turret',[0,2.41,0]),'neck');box(chest,[0,-.04,0],[1.45,1.0,.88],graphite);box(chest,[0,.19,.4],[1.22,.44,.24],iron,[.13,0,0]);box(chest,[0,-.22,.42],[.77,.31,.22],iron,[-.1,0,0]);for(let k=0;k<9;k++)box(chest,[(k-4)*.1,.06,.542],[.052,.17,.037],black,[-.2,0,0]);
    const head=joint(group(chest,'Optical_Head',[0,.64,.07]),'head');box(head,[0,0,0],[.58,.47,.56],iron);box(head,[0,.19,.05],[.67,.13,.62],graphite,[-.08,0,0]);box(head,[0,.025,.28],[.46,.16,.044],black);box(head,[0,.04,.308],[.37,.053,.019],amber);box(head,[0,-.02,.315],[.075,.116,.02],amber);for(const s of [-1,1]){box(head,[s*.28,-.05,.04],[.12,.32,.39],graphite);for(let j=0;j<3;j++)box(head,[s*.342,-.115+j*.067,.03],[.018,.029,.24],steel);link(head,[s*.22,.21,-.13],[s*.26,.45+s*.051,-.16],.025,.012,iron)}
    for(const s of [-1,1]){
      box(chest,[s*.38,.21,.53],[.24,.117,.032],darkGold,[0,0,s*.24]);box(chest,[s*.56,-.18,.34],[.253,.443,.25],iron,[0,0,-s*.1]);for(let k=0;k<4;k++)ball(chest,[s*(.35+(k%2)*.22),-.32+Math.floor(k/2)*.51,.52],[.026,.027,.018],steel)
      const arm=joint(group(chest,`Heavy_Arm_${s<0?'L':'R'}`,[s*.87,.25,0]),'arm',s);ball(arm,[0,0,0],[.26,.25,.26],steel);box(arm,[s*.03,.09,0],[.67,.53,.75],graphite,[0,0,-s*.14]);box(arm,[s*.09,.36,-.02],[.69,.09,.74],iron,[0,0,-s*.14]);box(arm,[s*.34,.03,0],[.09,.45,.67],iron);for(let k=0;k<3;k++)box(arm,[s*.385,.12-k*.096,.08],[.021,.036,.26],darkGold,[-.35,0,0]);link(arm,[0,-.17,0],[s*.09,-.71,.07],.157,.175,graphite);box(arm,[s*.055,-.48,.015],[.41,.47,.47],iron,[.07,0,s*.09]);ball(arm,[s*.084,-.78,.09],[.211,.215,.22],steel)
      if(s===1){box(arm,[s*.12,-1.02,.16],[.45,.55,.5],graphite,[-.12,0,.06]);box(arm,[s*.11,-1.31,.195],[.39,.226,.39],iron);for(let k=0;k<4;k++)box(arm,[s*.12+(k-1.5)*.085,-1.49,.25],[.069,.226,.17],graphite,[.24,0,0]);box(arm,[-.1,-1.31,.25],[.127,.245,.167],iron,[0,0,-.24])}
      else{const gun=joint(group(arm,'Rotary_Cannon',[-.07,-.91,.115]),'barrel');box(gun,[0,.04,.04],[.59,.55,.77],graphite);link(gun,[0,0,.23],[0,0,.65],.244,.254,iron,20);for(let k=0;k<6;k++){const a=k*TAU/6,x=Math.cos(a)*.144,y=Math.sin(a)*.144;link(gun,[x,y,.48],[x,y,1.34],.066,.066,steel,12);link(gun,[x,y,1.34],[x,y,1.35],.046,.046,black,12);ring(gun,[x,y,1.35],.053,.009,iron)}ring(gun,[0,0,1.03],.22,.043,graphite);ring(gun,[0,0,.66],.226,.033,iron);const flash=joint(group(gun,'Rotary_Muzzle_Flash',[0,0,1.35]),'normalfx');link(flash,[0,0,0],[0,0,.72],.133,.003,amber,10)}
      const leg=joint(group(chassis,`Hydraulic_Leg_${s<0?'L':'R'}`,[s*.42,1.57,0]),'leg',s);ball(leg,[0,0,0],[.219,.205,.22],steel);box(leg,[s*.072,-.35,-.04],[.503,.668,.551],graphite,[.15,0,-s*.12]);box(leg,[s*.07,-.322,.214],[.419,.55,.168],iron,[.14,0,-s*.13]);const knee:V=[s*.12,-.738,.06];ball(leg,knee,[.266,.224,.24],steel);box(leg,[s*.12,-.73,.245],[.451,.277,.21],graphite);box(leg,[s*.16,-1.095,-.02],[.431,.574,.451],iron,[-.12,0,-s*.06]);box(leg,[s*.16,-1.076,.19],[.327,.537,.139],graphite,[-.14,0,0]);link(leg,[s*.361,-.72,-.01],[s*.36,-1.34,-.02],.051,.036,steel);box(leg,[s*.19,-1.436,.146],[.55,.24,.811],graphite);box(leg,[s*.19,-1.473,.14],[.581,.104,.835],iron);for(let k=0;k<3;k++)box(leg,[s*.192+(k-1)*.144,-1.36,.41],[.111,.068,.204],iron);for(let k=0;k<3;k++)box(leg,[s*.17,-.92-k*.1,.269],[.174,.027,.019],darkGold)
      const drone=joint(group(rig,`${s<0?'Left':'Right'}_Floating_Cannon`,[s*1.76,2.37,-.26],s<0?1:2),'drone',s);box(drone,[0,0,0],[.666,.387,.68],graphite);box(drone,[0,.221,-.035],[.57,.096,.622],iron);box(drone,[0,.007,.351],[.51,.216,.066],iron);box(drone,[0,.038,.393],[.155,.057,.022],amber);for(const w of [-1,1]){box(drone,[w*.364,0,-.06],[.155,.461,.429],iron,[0,0,w*.13]);box(drone,[w*.23,-.21,.09],[.153,.174,.402],graphite);link(drone,[w*.213,-.179,.1],[w*.213,-.179,.73],.065,.053,steel);ring(drone,[w*.213,-.179,.736],.053,.012,graphite);const shot=joint(group(drone,`Drone_ray_${s<0?'L':'R'}_${w<0?'l':'r'}`,[w*.213,-.179,.74]),'specialfx');link(shot,[0,0,.01],[0,0,2.8],.031,.012,amber,10)}link(drone,[0,-.15,-.099],[0,-.301,-.099],.161,.123,graphite);ring(drone,[0,-.305,-.099],.097,.019,cyan,[0,1,0]);for(let k=0;k<4;k++)box(drone,[(k-1.5)*.088,.276,0],[.048,.017,.27],black)
    }
    box(chest,[0,.04,-.539],[1.007,.87,.41],graphite);for(const s of [-1,1]){link(chest,[s*.38,.17,-.59],[s*.38,.58,-.59],.109,.107,iron);ring(chest,[s*.38,.59,-.59],.093,.025,graphite,[0,1,0]);for(let k=0;k<5;k++)box(chest,[s*.24,-.19+k*.099,-.766],[.362,.038,.048],iron)}
  }
  // The collectible plinth stays outside the animated skeleton.
  const stand=group(root,'Archive_Battle_Card');const plinth=material('Engraved_obsidian_plinth','#242a2b',.64,.4),trim=material('Faction_inlay',info.color,.75,.32)
  const r=id==='radiant-wyvern'?1.68:id==='apep-lamb'?1.72:1.62
  add(stand,new T.CylinderGeometry(r,r*.94,.15,8),plinth,[0,-.095,0]);add(stand,new T.CylinderGeometry(r*1.015,r*1.015,.032,8),trim,[0,-.045,0]);add(stand,new T.CylinderGeometry(r*.973,r*1.015,.055,8),graphite,[0,-.003,0]);ring(stand,[0,.029,0],r*.823,.013,trim,[0,1,0],64);ring(stand,[0,.029,0],r*.793,.006,trim,[0,1,0],64)
  for(let k=0;k<32;k++){const a=TAU*k/32;const b=box(stand,[Math.sin(a)*r*.77,.028,Math.cos(a)*r*.77],[.014,.008,k%4===0?.102:.038],trim);b.rotation.y=a}
  const aura=joint(group(rig,'Resonance_Halo',[0,.065,0]),'actionfx');ring(aura,[0,0,0],r*.89,.017,id==='moon-eye'?cyan:id==='apep-lamb'?violet:amber,[0,1,0],64);for(let k=0;k<14;k++){const a=k*2.399;link(aura,[Math.cos(a)*r,.03,Math.sin(a)*r],[Math.cos(a)*r,.19+(k%5)*.087,Math.sin(a)*r],.009,.001,id==='moon-eye'?cyan:id==='apep-lamb'?violet:amber,5)}
  const clips:T.AnimationClip[]=[];const names=['Idle','Normal_Attack','Special_Attack','Special_Action',...(info.alternate?['Talon_Rend']:[])],durations=[5,...info.moves.map(m=>m.duration),...(info.alternate?[info.alternate.duration]:[])]
  for(let c=0;c<names.length;c++){
    const tracks:T.KeyframeTrack[]=[],duration=durations[c],samples=48
    for(const j of joints){const times:number[]=[],ps:number[]=[],qs:number[]=[],ss:number[]=[];let hasP=false,hasR=false,hasS=false
      for(let f=0;f<=samples;f++){
        const t=f/samples,a=t*TAU,s=Math.sin(a),bell=Math.sin(t*Math.PI)**2,hit=Math.exp(-(((t-.53)/.13)**2)),prep=Math.exp(-(((t-.26)/.14)**2)),pulse=Math.max(0,Math.sin(Math.PI*(t-.31)/.56))*(t>.31&&t<.87?1:0),p=j.p.clone(),rot=j.r.clone(),scl=new T.Vector3(1,1,1)
        const normal=c===1||c===4,special=c===2,action=c===3,winged=id==='radiant-wyvern',mech=id==='ares',plant=id==='moon-eye'
        if(j.role==='root'){p.y+=.019*(1-Math.cos(a));if(normal){p.z+=.28*hit-.12*prep;rot.y+=(winged?1.02:.22)*(hit-.36*prep);rot.x+=.11*hit-.08*prep}if(special){p.y+=.09*prep;rot.x+=.1*prep-.065*pulse}if(action){p.y+=winged?bell*1.03:mech?-.07*bell:.09*bell;rot.y+=winged?.30*s:.04*s}}
        else if(j.role==='wing'){rot.z=j.side*(.036*s+(normal?-.59*prep+.91*hit:0)+(action?.41*Math.sin(a*2)*bell+.22*bell:0)+(special?.35*bell:0));rot.y=j.side*((normal?.69*hit-.32*prep:0)+.035*s)}
        else if(j.role==='neck'){rot.x+=.04*s+(special?-.31*prep+.22*pulse:0)+(normal?.12*hit-.09*prep:0);rot.y+=mech?(normal?.37*s:special?.14*s:action?.41*s:.03*s):.05*s;rot.z+=normal?.06*hit:0}
        else if(j.role==='head'){rot.y+=.046*s+(normal?.24*hit:0)+(action?.17*s:0);rot.x+=.037*s+(special?-.25*prep+.13*pulse:0)+(action&&!winged?.21*bell:0)}
        else if(j.role==='jaw'){rot.x+=.08+.045*s+(special?.46*pulse:0)+(normal?.19*hit:0)}
        else if(j.role==='tail'){rot.y+=.15*s+(normal?.62*hit:0)+(action?.19*Math.sin(2*a)*bell:0);rot.x+=action?-.12*bell:0}
        else if(j.role==='leg'){rot.x+=(normal?(c===4?-.84*prep+.77*hit:(j.phase?.26:-.11)*hit):0)+(action&&winged?.41*bell:0);rot.z+=j.side*(action?.045*bell:0)}
        else if(j.role==='tendril'){rot.z+=.057*(Math.sin(a+j.phase)-Math.sin(j.phase))+(normal?.48*j.side*hit-.14*j.side*prep:0)+(special?.28*Math.sin(a*3+j.phase)*bell:0);rot.x+=.075*s+(action?.22*Math.sin(a+j.phase)*bell:0);if(normal&&plant)p.z+=hit*.38}
        else if(j.role==='larvae'){const factor=action?.75+.51*bell:1;scl.set(factor,1,factor);rot.y+=action?.43*s:.04*s}
        else if(j.role==='crown'){rot.z+=.025*s+(action?.16*s:0);rot.y+=action?.24*s:.03*s;if(action)scl.set(1+.13*bell,1+.05*bell,1+.13*bell)}
        else if(j.role==='arm'){rot.x+=normal?.13*prep-.31*hit+Math.sin(a*9)*hit*.08:special?-.2*bell:action?.12*s:.017*s;rot.z+=j.side*(special?.19*bell:0)}
        else if(j.role==='barrel'){rot.z+=normal?a*3:0}
        else if(j.role==='drone'){p.y+=.07*(Math.sin(a+j.side)-Math.sin(j.side))+(special?.48*bell:0);p.x+=j.side*(special?.68*bell:0);if(action){p.x=j.p.x*Math.cos(a);p.z=j.p.z+j.p.x*Math.sin(a);p.y+=.35*bell}rot.z+=j.side*.054*s;rot.y+=special?-j.side*.24*bell:0}
        else if(j.role.endsWith('fx')){let v=.00001;if(j.role==='normalfx'&&normal)v=Math.max(.00001,hit*(mech?.65+.35*Math.cos(a*12):1));if(j.role==='specialfx'&&special)v=Math.max(.00001,pulse);if(j.role==='actionfx'&&action)v=Math.max(.00001,bell);scl.setScalar(v);if(j.role==='specialfx'&&id==='apep-lamb')scl.set(v*(.8+t),v,v*(.8+t))}
        times.push(t*duration);ps.push(...p.toArray());qs.push(...new T.Quaternion().setFromEuler(rot).toArray());ss.push(...scl.toArray());hasP ||= p.distanceToSquared(j.p)>.0000001;hasR ||= Math.abs(rot.x-j.r.x)+Math.abs(rot.y-j.r.y)+Math.abs(rot.z-j.r.z)>.000001;hasS ||= scl.distanceToSquared(new T.Vector3(1,1,1))>.000001
      }
      if(hasP)tracks.push(new T.VectorKeyframeTrack(j.node.name+'.position',times,ps));if(hasR)tracks.push(new T.QuaternionKeyframeTrack(j.node.name+'.quaternion',times,qs));if(hasS)tracks.push(new T.VectorKeyframeTrack(j.node.name+'.scale',times,ss));if(j.role.endsWith('fx'))j.node.scale.setScalar(.00001)
    }
    clips.push(new T.AnimationClip(names[c],duration,tracks).optimize())
  }
  optimize(root);root.animations=clips;root.updateMatrixWorld(true);return {root,clips}
}
