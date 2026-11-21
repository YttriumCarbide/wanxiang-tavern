import { mkdir, writeFile } from 'node:fs/promises'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildModel } from './models.ts'
import { enemies } from './model-data.ts'
// A FileReader adapter lets the official Three.js exporter run in Node.
class BlobReader {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  onload: (() => void) | null = null
  async readAsArrayBuffer(blob: Blob) { this.result=await blob.arrayBuffer();this.onload?.();this.onloadend?.() }
  async readAsDataURL(blob: Blob) { this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload?.();this.onloadend?.() }
}
Object.assign(globalThis,{FileReader:BlobReader})
const outputDirectory = new URL('./.runtime/models/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })
for (const enemy of enemies) {
  const { root, clips } = buildModel(enemy.id)
  const file = await new GLTFExporter().parseAsync(root, {
    binary: true,
    animations: clips,
    onlyVisible: false,
    trs: true,
  }) as ArrayBuffer
  await writeFile(new URL(`${enemy.id}.glb`, outputDirectory), Buffer.from(file))
  let triangles=0,meshes=0;root.traverse((o:any)=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}})
  console.log(`${enemy.id}: ${Math.round(triangles).toLocaleString()} triangles, ${meshes} meshes, ${clips.length} animation clips, ${(file.byteLength/1048576).toFixed(2)} MB`)
}
