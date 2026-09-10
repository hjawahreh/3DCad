/**
 * Minimal ambient types for three@0.178 (package ships JS without bundled .d.ts in this install).
 * Studio mesh viewport only — not a full three typings surface.
 */

declare module 'three' {
  export class Color {
    constructor(hex?: number);
    setHex(hex: number): this;
  }

  export class Vector3 {
    set(x: number, y: number, z: number): this;
  }

  export class Matrix4 {
    fromArray(array: ArrayLike<number>, offset?: number): this;
  }

  export class BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
  }

  export class BufferGeometry {
    setAttribute(name: string, attribute: BufferAttribute): this;
    setIndex(index: BufferAttribute): this;
    computeVertexNormals(): void;
    dispose(): void;
  }

  export class Material {
    dispose(): void;
    needsUpdate: boolean;
  }

  export class MeshStandardMaterial extends Material {
    constructor(params?: {
      color?: number;
      roughness?: number;
      metalness?: number;
      flatShading?: boolean;
      wireframe?: boolean;
      transparent?: boolean;
      opacity?: number;
      side?: number;
    });
    color: Color;
    emissive: Color;
    emissiveIntensity: number;
    roughness: number;
    wireframe: boolean;
    flatShading: boolean;
    transparent: boolean;
    opacity: number;
  }

  export class Object3D {
    matrix: Matrix4;
    matrixAutoUpdate: boolean;
    matrixWorldNeedsUpdate: boolean;
    visible: boolean;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    position: Vector3;
    up: Vector3;
    lookAt(x: number, y: number, z: number): void;
  }

  export class Mesh extends Object3D {
    constructor(geometry: BufferGeometry, material: Material);
    geometry: BufferGeometry;
    material: Material;
  }

  export class Group extends Object3D {}

  export class Scene extends Object3D {
    background: Color | null;
  }

  export class Light extends Object3D {
    intensity: number;
  }

  export class AmbientLight extends Light {
    constructor(color?: number, intensity?: number);
  }

  export class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
  }

  export class Camera extends Object3D {
    near: number;
    far: number;
    updateProjectionMatrix(): void;
  }

  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
  }

  export class WebGLRenderer {
    constructor(params?: {
      canvas?: HTMLCanvasElement;
      antialias?: boolean;
      alpha?: boolean;
      powerPreference?: string;
    });
    autoClear: boolean;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setClearColor(color: number, alpha?: number): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
  }

  export const FrontSide: number;
  export const DoubleSide: number;
}
