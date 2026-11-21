"""Embed original artwork-derived surface detail into each self-contained GLB.
Requirements: Python 3, Pillow, NumPy. Run after export-models.ts.
"""
from pathlib import Path
from io import BytesIO
import json, struct
import numpy as np
from PIL import Image, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent

SOURCES = {
    'scale': ('wyvern-study.jpg', (.65,.66,.96,.91), .69, .19, 3.18),
    'membrane': ('radiant-wyvern.jpg', (.036,.133,.141,.281), .76, .12, 1.25),
    'bark': ('moon-eye.jpg', (.44,.405,.606,.625), .74, .22, 2.35),
    'pitch': ('apep-lamb.jpg', (.19,.486,.399,.664), .71, .18, 2.1),
    'steel': ('ares.jpg', (.569,.391,.712,.545), .79, .09, 2.42),
    'horn': ('apep-lamb.jpg', (.292,.106,.413,.206), .73, .145, 2.1),
}

def category(name):
    if name in ('Platinum_armor','Pale_gold','Sunforged_gold','Ancient_ivory','Recessed_bronze'): return 'scale'
    if name=='Gilded_wing_membrane': return 'membrane'
    if name in ('Ironwood_bark','Ancient_heartwood','Verdigris_foliage'): return 'bark'
    if name in ('Living_pitch','Blackened_fleece','Obsidian'): return 'pitch'
    if name in ('Graphite_armor','Weathered_titanium','Machined_silver','Engraved_obsidian_plinth'): return 'steel'
    if name=='Striated_horn': return 'horn'
    return None

def make_maps(kind):
    file,rect,avg,contrast,_=SOURCES[kind]
    with Image.open(HERE / 'textures' / file) as source:
        image = source.convert('L')
    w, h = image.size
    sample=image.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(rect))).resize((224,224),Image.Resampling.LANCZOS)
    tile=Image.new('L',(448,448));tile.paste(sample,(0,0));tile.paste(ImageOps.mirror(sample),(224,0));tile.paste(ImageOps.flip(sample),(0,224));tile.paste(ImageOps.flip(ImageOps.mirror(sample)),(224,224))
    values=np.asarray(tile).astype(np.float32)/255
    blur=np.asarray(tile.filter(ImageFilter.GaussianBlur(10))).astype(np.float32)/255
    relief=values-blur;detail=relief/(relief.std()+.025)
    albedo=np.clip(avg+detail*contrast+(values-.5)*.045,.26,.97)
    gy,gx=np.gradient(relief);ones=np.ones_like(gx);n=np.stack([-gx*5.6,gy*5.6,ones],axis=-1);n/=np.sqrt(np.sum(n*n,axis=-1))[:,:,None]
    normal=(np.clip(n*.5+.5,0,1)*255).astype('uint8')
    result=[]
    for im in (Image.fromarray((albedo*255).astype('uint8')).convert('RGB'),Image.fromarray(normal)):
        stream=BytesIO();im.save(stream,format='JPEG',quality=90,subsampling=0,optimize=True);result.append(stream.getvalue())
    return result

for path in sorted((HERE / '.runtime' / 'models').glob('*.glb')):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:]);original=bytes(binary)
    if g.get('images'): print('Already textured:',path.name);continue
    def append(data, target=None):
        binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(data)
        view={'buffer':0,'byteOffset':offset,'byteLength':len(data)}
        if target:view['target']=target
        g['bufferViews'].append(view);return len(g['bufferViews'])-1
    def readvec(index):
        acc=g['accessors'][index];view=g['bufferViews'][acc['bufferView']]
        return np.ndarray((acc['count'],3),dtype='<f4',buffer=original,offset=view.get('byteOffset',0)+acc.get('byteOffset',0),strides=(view.get('byteStride',12),4)).copy()
    g['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}];g['images']=[];g['textures']=[];cache={}
    for mat in g['materials']:
        kind=category(mat.get('name',''))
        if not kind:continue
        if kind not in cache:
            indices=[]
            for suffix,data in zip(['albedo','normal'],make_maps(kind)):
                g['images'].append({'name':kind+'_'+suffix,'bufferView':append(data),'mimeType':'image/jpeg'})
                g['textures'].append({'source':len(g['images'])-1,'sampler':0});indices.append(len(g['textures'])-1)
            cache[kind]=indices
        mat['pbrMetallicRoughness']['baseColorTexture']={'index':cache[kind][0]};mat['normalTexture']={'index':cache[kind][1],'scale':.95 if kind in ('bark','scale') else .61}
    for mesh in g['meshes']:
        for prim in mesh['primitives']:
            kind=category(g['materials'][prim['material']].get('name',''))
            if not kind:continue
            p=readvec(prim['attributes']['POSITION']);n=readvec(prim['attributes']['NORMAL']);axis=np.argmax(np.abs(n),axis=1)
            uv=np.stack((p[:,0],p[:,1]),axis=1);uv[axis==0,0]=p[axis==0,2];uv[axis==1,1]=p[axis==1,2]
            uv*=SOURCES[kind][4];uv=uv.astype('<f4');v=append(uv.tobytes(),34962)
            g['accessors'].append({'bufferView':v,'componentType':5126,'count':len(uv),'type':'VEC2','min':uv.min(axis=0).tolist(),'max':uv.max(axis=0).tolist()});prim['attributes']['TEXCOORD_0']=len(g['accessors'])-1
    binary.extend(b'\0'*((-len(binary))%4));g['buffers'][0]['byteLength']=len(binary);js=json.dumps(g,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    result=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\x00')+binary
    path.write_bytes(result);print(f'{path.name}: {len(g["images"])} embedded PBR maps, {len(result)/1048576:.2f} MB')
