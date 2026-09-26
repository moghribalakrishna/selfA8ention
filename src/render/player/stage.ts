import * as THREE from "three";
import type { Scene } from "../../schema.js";
import { clamp01, easeInOut, lerp } from "./util.js";

interface MoodPreset {
  skyTop: string; skyBottom: string; ambient: string; ambientI: number;
  sun: string; sunI: number; board: string; rim: string;
}

export const MOODS: Record<Scene["mood"], MoodPreset> = {
  dawn: { skyTop: "#f6bd60", skyBottom: "#f7ede2", ambient: "#ffe8d6", ambientI: 1.1, sun: "#ffd6a5", sunI: 2.2, board: "#e9dcc9", rim: "#f28482" },
  neutral: { skyTop: "#a8dadc", skyBottom: "#f1faee", ambient: "#ffffff", ambientI: 1.2, sun: "#ffffff", sunI: 2.2, board: "#e4e0d8", rim: "#89c2d9" },
  tension: { skyTop: "#3d405b", skyBottom: "#e07a5f", ambient: "#f2cc8f", ambientI: 0.8, sun: "#ffb4a2", sunI: 2.4, board: "#d8c3a5", rim: "#e07a5f" },
  cold: { skyTop: "#1b263b", skyBottom: "#778da9", ambient: "#a9c1dc", ambientI: 0.9, sun: "#caf0f8", sunI: 1.6, board: "#b8c4d1", rim: "#90e0ef" },
  warm: { skyTop: "#9d4edd", skyBottom: "#ffb703", ambient: "#ffd8be", ambientI: 1.1, sun: "#ffe5b4", sunI: 2.6, board: "#f1dcc0", rim: "#ff9e00" },
};

/**
 * The diorama: renderer, a board-game tabletop floating in a gradient void,
 * mood lighting, and a camera rig driven by scene shots.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 200);
  readonly entitiesRoot = new THREE.Group();
  private ambient = new THREE.HemisphereLight("#ffffff", "#444444", 1);
  private sun = new THREE.DirectionalLight("#ffffff", 2);
  private rim = new THREE.DirectionalLight("#ffffff", 0.8);
  private boardMat = new THREE.MeshStandardMaterial({ color: "#e4e0d8", roughness: 0.9 });
  private skyCanvas = document.createElement("canvas");
  private skyTex: THREE.CanvasTexture;
  private lastSky = "";

  constructor(container: HTMLElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.skyCanvas.width = 4; this.skyCanvas.height = 256;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;

    this.sun.position.set(6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.radius = 4;
    this.rim.position.set(-8, 6, -10);
    this.scene.add(this.ambient, this.sun, this.rim, this.entitiesRoot);
    this.buildBoard();
  }

  private buildBoard() {
    const w = 12, d = 18;
    const shape = new THREE.Shape();
    const r = 0.8;
    shape.moveTo(-w / 2 + r, -d / 2);
    shape.lineTo(w / 2 - r, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    shape.lineTo(w / 2, d / 2 - r); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    shape.lineTo(-w / 2 + r, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    shape.lineTo(-w / 2, -d / 2 + r); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 3 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, -0.15, 0); // bevel pokes above y=0; keep the playing surface at y=0
    const board = new THREE.Mesh(geo, [this.boardMat, new THREE.MeshStandardMaterial({ color: "#6b4f3a", roughness: 0.7 })]);
    board.receiveShadow = true;
    this.scene.add(board);

    // Subtle board-game grid.
    const grid = new THREE.Group();
    const lineMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.06 });
    for (let x = -5; x <= 5; x++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, d - 1.2), lineMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, 0); grid.add(m);
    }
    for (let z = -8; z <= 8; z++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.2, 0.03), lineMat);
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.002, z); grid.add(m);
    }
    this.scene.add(grid);
  }

  /** Blend between two moods (used for smooth transitions) and apply time-skip sun sweep. */
  applyMood(from: MoodPreset, to: MoodPreset, k: number, timeSkip: number) {
    const mix = (a: string, b: string) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const top = mix(from.skyTop, to.skyTop), bottom = mix(from.skyBottom, to.skyBottom);
    const dim = timeSkip > 0 ? 1 - Math.sin(timeSkip * Math.PI) * 0.55 : 1;
    top.multiplyScalar(dim); bottom.multiplyScalar(dim);
    const key = top.getHexString() + bottom.getHexString();
    if (key !== this.lastSky) {
      this.lastSky = key;
      const ctx = this.skyCanvas.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, `#${top.getHexString()}`);
      g.addColorStop(1, `#${bottom.getHexString()}`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
      this.skyTex.needsUpdate = true;
    }
    this.ambient.color.copy(mix(from.ambient, to.ambient));
    this.ambient.groundColor.copy(mix(from.board, to.board)).multiplyScalar(0.4);
    this.ambient.intensity = lerp(from.ambientI, to.ambientI, k) * dim;
    this.sun.color.copy(mix(from.sun, to.sun));
    this.sun.intensity = lerp(from.sunI, to.sunI, k) * (0.6 + 0.4 * dim);
    this.rim.color.copy(mix(from.rim, to.rim));
    this.boardMat.color.copy(mix(from.board, to.board));
    const a = 0.6 + timeSkip * Math.PI * 2;
    this.sun.position.set(Math.cos(a) * 10, 14, Math.sin(a) * 10 + 2);
  }

  /** Positions the camera for a shot at scene progress p. */
  frame(shot: Scene["shot"], focus: THREE.Vector3, p: number, lt: number) {
    const e = easeInOut(clamp01(p));
    let dist = 27, polar = 0.95, azim = 0;
    const target = focus.clone();
    switch (shot) {
      case "wide": dist = 27; polar = 0.95; azim = lerp(-0.05, 0.05, e); break;
      case "top_down": dist = 25; polar = 0.68; azim = 0; break;
      case "push_in": dist = lerp(27, 13, e); polar = lerp(0.95, 1.05, e); break;
      case "pull_back": dist = lerp(16, 28, e); polar = lerp(1.05, 0.9, e); break;
      case "orbit": dist = 23; polar = 0.95; azim = lerp(-0.3, 0.3, e); break;
      case "follow": dist = 15; polar = 1.0; azim = 0.12; break;
      case "close": dist = lerp(15, 13, e); polar = 1.08; azim = lerp(0.1, -0.05, e); break;
    }
    // Keep wide-ish shots centred on the board so everything stays in the portrait frame.
    const boardWeight = shot === "wide" || shot === "top_down" ? 0.75 : shot === "orbit" ? 0.65 : shot === "pull_back" ? 0.4 : 0;
    target.lerp(new THREE.Vector3(0, 0, 0), boardWeight);
    // Aim above the action so it sits in the lower-middle of the frame, leaving the top for captions.
    target.y += shot === "close" || shot === "follow" ? 2.6 : 1.6;
    azim += Math.sin(lt * 0.35) * 0.015; // breathing drift
    this.camera.position.set(
      target.x + dist * Math.sin(polar) * Math.sin(azim),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(azim),
    );
    this.camera.lookAt(target);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
