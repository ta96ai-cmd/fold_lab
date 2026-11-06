// Binary glTF (.glb) export of the folded box at real size (metres), with artwork textures.
// Opens in Blender (File > Import > glTF 2.0), Windows 3D Viewer, and most 3D tools.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export async function exportGLB(viewer, mmPerUnit) {
  const scale = (mmPerUnit || 25.4 / 96) / 1000;
  const buffer = await viewer.withScaledBox(scale, group =>
    new GLTFExporter().parseAsync(group, { binary: true, onlyVisible: true, maxTextureSize: 4096 }));
  return new Blob([buffer], { type: 'model/gltf-binary' });
}
