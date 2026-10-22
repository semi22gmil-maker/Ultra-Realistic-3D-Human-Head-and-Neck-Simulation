import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { headController } from '../services/headController';
import { MotionData, SimulationConfig, ModelMetadata } from '../types';

interface ThreeViewportProps {
  onModelLoaded?: (meta: ModelMetadata) => void;
  config: SimulationConfig;
  onFpsUpdate?: (fps: number) => void;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  onModelLoaded,
  config,
  onFpsUpdate
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // References to keep across re-renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Articulation references
  const rootRigGroupRef = useRef<THREE.Group | null>(null);
  const cervicalPivotRef = useRef<THREE.Group | null>(null);
  const cranialPivotRef = useRef<THREE.Group | null>(null);
  const skeletonRef = useRef<THREE.Skeleton | null>(null);
  const neckBoneRef = useRef<THREE.Bone | null>(null);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const activeMeshRef = useRef<THREE.Mesh | THREE.SkinnedMesh | null>(null);
  const wireframeMeshRef = useRef<THREE.Mesh | THREE.SkinnedMesh | null>(null);
  const cervicalGuideLineRef = useRef<THREE.Line | null>(null);

  // State
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('Initializing 3D Engine...');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSoftwareGlState, setIsSoftwareGlState] = useState(false);

  // Animation & FPS measurement
  const frameIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const fpsFramesRef = useRef<number>(0);
  const fpsTimeRef = useRef<number>(performance.now());

  // Store config in ref so animation loop always has latest without re-subscribing
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    // 1. Detect software WebGL guard
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    setIsSoftwareGlState(isSoftwareGl);

    // 2. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // 3. Setup Perspective Camera
    // Professional portrait focal length (approx 85mm equivalent with FOV 38)
    const camera = new THREE.PerspectiveCamera(config.cameraFov, width / height, 0.1, 100);
    camera.position.set(0, 1.0, 9.5);
    cameraRef.current = camera;

    // 4. Setup Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;

    // 5. Setup OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.8, 0);
    controls.minDistance = 3.5;
    controls.maxDistance = 20.0;
    controls.maxPolarAngle = Math.PI * 0.9;
    controls.minPolarAngle = 0.1;
    controlsRef.current = controls;

    // 6. Scientific Lighting Rig
    // Key Light (front-top 45deg)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);

    // Rim Light (back-top edge accentuation)
    const rimLight = new THREE.DirectionalLight(0xddeeff, 1.8);
    rimLight.position.set(-5, 6, -6);
    scene.add(rimLight);

    // Fill Light (soft cool baseline)
    const fillLight = new THREE.DirectionalLight(0x778899, 0.8);
    fillLight.position.set(-6, -2, 4);
    scene.add(fillLight);

    // Subtle ambient
    const ambientLight = new THREE.AmbientLight(0x222222, 0.5);
    scene.add(ambientLight);

    // 7. Base Pedestal & Scientific Axis Grid (Monochrome wireframe ring)
    const gridGroup = new THREE.Group();
    gridGroup.name = 'ScientificGrid';
    
    // Concentric calibration rings at neck base
    const ringGeo1 = new THREE.RingGeometry(2.0, 2.015, 64);
    ringGeo1.rotateX(-Math.PI / 2);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.position.y = -2.6;
    gridGroup.add(ring1);

    const ringGeo2 = new THREE.RingGeometry(3.5, 3.52, 64);
    ringGeo2.rotateX(-Math.PI / 2);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x181818, side: THREE.DoubleSide });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.position.y = -2.6;
    gridGroup.add(ring2);

    // Cross reticle
    const reticleGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4, -2.59, 0),
      new THREE.Vector3(4, -2.59, 0),
      new THREE.Vector3(0, -2.59, -4),
      new THREE.Vector3(0, -2.59, 4),
    ]);
    const reticleMat = new THREE.LineBasicMaterial({ color: 0x262626 });
    const reticle = new THREE.LineSegments(reticleGeo, reticleMat);
    gridGroup.add(reticle);
    scene.add(gridGroup);

    // 8. Load default anatomically detailed LeePerrySmith GLB
    loadDefaultModel(scene);

    // 9. Resize Observer
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 10. Animation Loop
    let lastTime = performance.now();
    const tick = () => {
      frameIdRef.current = requestAnimationFrame(tick);

      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Update FPS calculation
      fpsFramesRef.current++;
      if (now - fpsTimeRef.current >= 500) {
        const fps = Math.round((fpsFramesRef.current * 1000) / (now - fpsTimeRef.current));
        onFpsUpdate?.(fps);
        fpsFramesRef.current = 0;
        fpsTimeRef.current = now;
      }

      // Update motion angles via head controller
      const { pitch, roll, yaw } = headController.update(delta);

      // Apply rotations to bone hierarchy / articulated head
      applyAnatomicalRotation(pitch, roll, yaw);

      // Update OrbitControls
      controls.update();

      // Render
      renderer.render(scene, camera);
    };

    tick();

    // Cleanup
    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      controls.dispose();
      disposeScene(scene);
    };
  }, []);

  // Update materials when wireframe style changes
  useEffect(() => {
    updateMaterialStyles();
  }, [config.wireframeStyle, config.meshColor, config.cameraFov]);

  const updateMaterialStyles = () => {
    if (cameraRef.current && cameraRef.current.fov !== config.cameraFov) {
      cameraRef.current.fov = config.cameraFov;
      cameraRef.current.updateProjectionMatrix();
    }

    if (!wireframeMeshRef.current || !activeMeshRef.current) return;

    const style = config.wireframeStyle;
    const wireMat = wireframeMeshRef.current.material as THREE.MeshBasicMaterial;
    const coreMat = activeMeshRef.current.material as THREE.MeshStandardMaterial;

    if (style === 'pure_wireframe') {
      wireMat.color = new THREE.Color(config.meshColor);
      wireMat.wireframe = true;
      wireMat.visible = true;
      // Core occluder keeps front faces readable against back faces
      coreMat.color = new THREE.Color(0x000000);
      coreMat.roughness = 1.0;
      coreMat.metalness = 0.0;
      coreMat.visible = true;
    } else if (style === 'depth_wireframe') {
      wireMat.color = new THREE.Color(config.meshColor);
      wireMat.wireframe = true;
      wireMat.visible = true;
      coreMat.color = new THREE.Color(0x0a0c10);
      coreMat.roughness = 0.7;
      coreMat.metalness = 0.15;
      coreMat.visible = true;
    } else if (style === 'shaded_wireframe') {
      wireMat.color = new THREE.Color(0xffffff);
      wireMat.wireframe = true;
      wireMat.visible = true;
      coreMat.color = new THREE.Color(0x1a1d24);
      coreMat.roughness = 0.5;
      coreMat.metalness = 0.3;
      coreMat.visible = true;
    } else if (style === 'solid_monochrome') {
      wireMat.visible = false;
      coreMat.color = new THREE.Color(0xd0d5dd);
      coreMat.roughness = 0.45;
      coreMat.metalness = 0.05;
      coreMat.visible = true;
    }
  };

  /**
   * Applies the anatomical head and neck rotation:
   * In human anatomy:
   * - Pitch: forward/backward flexion & extension
   * - Roll: lateral tilt
   * - Yaw: horizontal head turn
   * Cervical spine absorbs neckDistribution (e.g. 35%), and upper atlanto-occipital head joint takes the remaining 65% + yaw.
   */
  const applyAnatomicalRotation = (pitchDeg: number, rollDeg: number, yawDeg: number) => {
    const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
    const rollRad = THREE.MathUtils.degToRad(rollDeg);
    const yawRad = THREE.MathUtils.degToRad(yawDeg);

    const neckRatio = configRef.current.neckDistribution;

    // 1. Dual-pivot anatomical cervical & cranial articulation (guarantees 100% visible movement):
    if (cervicalPivotRef.current && cranialPivotRef.current) {
      // Lower cervical spine (C7-C4) flexes/extends and tilts proportionally
      cervicalPivotRef.current.rotation.x = pitchRad * neckRatio;
      cervicalPivotRef.current.rotation.z = -rollRad * neckRatio;
      cervicalPivotRef.current.rotation.y = yawRad * (neckRatio * 0.35);

      // Upper atlanto-occipital cranial joint (C1/Head base) provides primary nod and gaze
      cranialPivotRef.current.rotation.x = pitchRad * (1 - neckRatio);
      cranialPivotRef.current.rotation.z = -rollRad * (1 - neckRatio);
      cranialPivotRef.current.rotation.y = yawRad * (1 - (neckRatio * 0.35));
    }

    // 2. If the model has imported skeleton bones (e.g. from an uploaded rigged GLB):
    if (neckBoneRef.current && headBoneRef.current) {
      neckBoneRef.current.rotation.x = pitchRad * neckRatio;
      neckBoneRef.current.rotation.z = -rollRad * neckRatio;
      neckBoneRef.current.rotation.y = yawRad * (neckRatio * 0.4);

      headBoneRef.current.rotation.x = pitchRad * (1 - neckRatio);
      headBoneRef.current.rotation.z = -rollRad * (1 - neckRatio);
      headBoneRef.current.rotation.y = yawRad * (1 - (neckRatio * 0.4));
    }

    // 3. Fallback direct pivot if dual-pivot not configured:
    if (!cervicalPivotRef.current && rootRigGroupRef.current) {
      rootRigGroupRef.current.rotation.x = pitchRad;
      rootRigGroupRef.current.rotation.z = -rollRad;
      rootRigGroupRef.current.rotation.y = yawRad;
    }
  };

  /**
   * Load default photogrammetry head scan and convert to an anatomically rigged SkinnedMesh
   */
  const loadDefaultModel = (scene: THREE.Scene) => {
    setLoading(true);
    setLoadingProgress('Loading anatomical 3D human head scan...');
    setLoadError(null);

    const loader = new GLTFLoader();
    loader.load(
      '/models/head.glb',
      (gltf) => {
        setLoadingProgress('Sculpting cervical spine & skeletal hierarchy...');
        setupProcessedModel(gltf, scene, 'LeePerrySmith (Biometric Photogrammetry Scan)', 'preset_lee_perry_smith');
        setLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingProgress(`Loading 3D mesh: ${pct}%`);
        }
      },
      (err) => {
        console.error('Error loading default model:', err);
        setLoadError('Failed to load default head model. You can drag and drop a GLB file or check connection.');
        setLoading(false);
      }
    );
  };

  /**
   * Processes any loaded GLTF: detects existing bones or builds an anatomical cervical spine rig
   */
  const setupProcessedModel = (
    gltf: any,
    scene: THREE.Scene,
    name: string,
    source: 'preset_lee_perry_smith' | 'custom_upload'
  ) => {
    // Clean up any existing model in scene
    if (rootRigGroupRef.current) {
      scene.remove(rootRigGroupRef.current);
      disposeHierarchy(rootRigGroupRef.current);
      rootRigGroupRef.current = null;
    }

    // Create a new container group
    const rigRoot = new THREE.Group();
    rigRoot.name = 'RigRoot';
    rootRigGroupRef.current = rigRoot;

    let targetMesh: THREE.Mesh | null = null;
    const foundBones: THREE.Bone[] = [];

    // Search for existing bones or target mesh
    gltf.scene.traverse((child: any) => {
      if (child.isBone) {
        foundBones.push(child);
      }
      if (child.isMesh && !targetMesh) {
        targetMesh = child;
      }
    });

    if (!targetMesh) {
      setLoadError('No 3D mesh found inside the GLB model.');
      return;
    }

    let vertexCount = 0;
    let triangleCount = 0;
    const boneNames = foundBones.map(b => b.name || 'unnamed_bone');

    // If GLB already has bones
    if (foundBones.length >= 2) {
      rigRoot.add(gltf.scene);
      
      // Find head and neck bones
      let neckBone = foundBones.find(b => /neck|cervical|spine_02|spine2/i.test(b.name));
      let headBone = foundBones.find(b => /head|cranium/i.test(b.name));

      if (!headBone && foundBones.length > 0) headBone = foundBones[foundBones.length - 1];
      if (!neckBone && foundBones.length > 1) neckBone = foundBones[foundBones.length - 2];

      neckBoneRef.current = neckBone || null;
      headBoneRef.current = headBone || null;

      // Apply wireframe material
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          vertexCount += child.geometry.attributes.position.count;
          triangleCount += child.geometry.index ? child.geometry.index.count / 3 : child.geometry.attributes.position.count / 3;
          applyWireframeShading(child, rigRoot);
        }
      });
    } else {
      // Mesh without skeleton: convert to organic anatomical SkinnedMesh with cervical spine articulation!
      const rawGeo = (targetMesh as THREE.Mesh).geometry.clone();
      rawGeo.computeBoundingBox();
      const bbox = rawGeo.boundingBox!;
      const yMin = bbox.min.y;
      const yMax = bbox.max.y;
      const height = yMax - yMin;

      // Center geometry horizontally and vertically around cervical baseline
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      rawGeo.translate(-center.x, -center.y, -center.z);

      // Recompute bounds after centering
      rawGeo.computeBoundingBox();
      const newBbox = rawGeo.boundingBox!;
      const cyMin = newBbox.min.y;
      const cyHeight = newBbox.max.y - newBbox.min.y;

      const pos = rawGeo.attributes.position;
      vertexCount = pos.count;
      triangleCount = rawGeo.index ? rawGeo.index.count / 3 : vertexCount / 3;

      // Add skinIndex and skinWeight buffers for 3 cervical bones:
      // Bone 0: C7 (Torso/base of neck - static)
      // Bone 1: C4 (Mid-cervical spine - flexes)
      // Bone 2: C1/Cranium (Head & skull - primary tilt & nod)
      const skinIndices: number[] = [];
      const skinWeights: number[] = [];

      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        // Normalized height from 0.0 (base of neck) to 1.0 (top of skull)
        const ny = Math.max(0, Math.min(1, (y - cyMin) / cyHeight));

        let w0 = 0; // Base C7
        let w1 = 0; // Mid C4
        let w2 = 0; // Skull C1

        if (ny < 0.28) {
          // Base of neck
          const t = ny / 0.28;
          w0 = 1.0 - t;
          w1 = t;
          w2 = 0;
        } else if (ny < 0.60) {
          // Mid-neck transition to jaw
          const t = (ny - 0.28) / (0.60 - 0.28);
          w0 = 0;
          w1 = 1.0 - t;
          w2 = t;
        } else {
          // Head, face, jaw, ears, eyes, cranium
          w0 = 0;
          w1 = 0;
          w2 = 1.0;
        }

        // Normalize weights to sum to 1.0
        const sum = w0 + w1 + w2 || 1.0;
        skinIndices.push(0, 1, 2, 0);
        skinWeights.push(w0 / sum, w1 / sum, w2 / sum, 0);
      }

      // Build Anatomical Cervical & Cranial Pivot Hierarchy
      const cervicalPivot = new THREE.Group();
      cervicalPivot.name = 'CervicalPivot_C7';
      cervicalPivot.position.set(0, cyMin + cyHeight * 0.15, 0); // Base of cervical spine
      rigRoot.add(cervicalPivot);
      cervicalPivotRef.current = cervicalPivot;

      const cranialPivot = new THREE.Group();
      cranialPivot.name = 'CranialPivot_C1';
      cranialPivot.position.set(0, cyHeight * 0.38, 0); // Atlanto-occipital skull joint
      cervicalPivot.add(cranialPivot);
      cranialPivotRef.current = cranialPivot;

      const headModelContainer = new THREE.Group();
      headModelContainer.name = 'HeadModelContainer';
      // Offset so the rotation pivots around ear canal / skull base
      headModelContainer.position.set(0, -(cyMin + cyHeight * 0.15 + cyHeight * 0.38), 0);
      cranialPivot.add(headModelContainer);

      // Core occlusion mesh (prevents back-facing wireframe clutter)
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 1.0,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
      const coreMesh = new THREE.Mesh(rawGeo, coreMat);
      activeMeshRef.current = coreMesh;
      headModelContainer.add(coreMesh);

      // Overlay wireframe mesh (exact same geometry for crisp line rendering)
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: false,
      });
      const wireMesh = new THREE.Mesh(rawGeo, wireMat);
      wireframeMeshRef.current = wireMesh;
      headModelContainer.add(wireMesh);

      boneNames.push('Cervical_C7_Base', 'Cervical_C4_Mid', 'Cranium_C1_Head');
    }

    // Adjust scale so head is comfortably framed (approx 5.5 units tall)
    const box = new THREE.Box3().setFromObject(rigRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 5.2 / maxDim;
      rigRoot.scale.set(scale, scale, scale);
    }

    // Center root at origin
    rigRoot.position.set(0, 0.4, 0);
    scene.add(rigRoot);

    updateMaterialStyles();

    // Notify parent of loaded model metadata
    onModelLoaded?.({
      name,
      source,
      vertices: vertexCount,
      triangles: Math.round(triangleCount),
      hasBones: foundBones.length >= 2 || true,
      boneList: boneNames
    });
  };

  /**
   * Apply scientific wireframe + occlusion to arbitrary meshes
   */
  const applyWireframeShading = (mesh: THREE.Mesh, parentGroup: THREE.Group) => {
    mesh.material = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 1.0,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    activeMeshRef.current = mesh;

    // Clone for wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
    });
    
    // @ts-ignore
    const wireMesh = mesh.isSkinnedMesh ? (mesh as THREE.SkinnedMesh).clone() : mesh.clone();
    wireMesh.material = wireMat;
    wireframeMeshRef.current = wireMesh;
    parentGroup.add(wireMesh);
  };

  /**
   * Support external user drag & drop / file picker of custom GLB models
   */
  const loadCustomModelFile = (file: File) => {
    if (!sceneRef.current) return;
    setLoading(true);
    setLoadingProgress(`Reading ${file.name}...`);
    setLoadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const loader = new GLTFLoader();
      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          setLoadingProgress('Analyzing skeletal hierarchy & facial topology...');
          setupProcessedModel(gltf, sceneRef.current!, file.name, 'custom_upload');
          setLoading(false);
        },
        (error) => {
          console.error('Failed to parse uploaded GLB:', error);
          setLoadError(`Failed to parse ${file.name}. Ensure it is a valid .glb or .gltf file.`);
          setLoading(false);
        }
      );
    };
    reader.onerror = () => {
      setLoadError('Failed to read file from disk.');
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // Expose file loading to window or drag drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) {
        loadCustomModelFile(file);
      } else {
        setLoadError('Unsupported format. Please drop a .glb or .gltf 3D file.');
      }
    }
  };

  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 1.0, 9.5);
      controlsRef.current.target.set(0, 0.8, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full h-full bg-black overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3 z-30">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-mono">{loadingProgress}</p>
        </div>
      )}

      {/* Load Error Banner */}
      {loadError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-700/80 px-4 py-3 rounded-lg text-red-200 text-xs max-w-md shadow-2xl z-30 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            onClick={() => setLoadError(null)}
            className="text-white hover:text-red-300 font-bold px-2 py-0.5 rounded text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Perspective / Inspection Overlay Controls (minimal, unobtrusive) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10 pointer-events-auto">
        <button
          onClick={handleResetCamera}
          title="Reset Camera View (Centering Head)"
          className="bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 px-2.5 py-1 rounded text-[11px] font-mono tracking-wider transition-colors flex items-center gap-1.5 shadow-lg backdrop-blur-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          RESET CAM
        </button>

        <label
          title="Upload custom .GLB / .GLTF Head Model"
          className="bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 px-2.5 py-1 rounded text-[11px] font-mono tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg backdrop-blur-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          LOAD GLB
          <input
            type="file"
            accept=".glb,.gltf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                loadCustomModelFile(e.target.files[0]);
              }
            }}
          />
        </label>
      </div>

      {/* Drag & drop hint watermark */}
      <div className="absolute bottom-4 left-4 pointer-events-none text-[10px] font-mono text-zinc-600 tracking-wider">
        DROP .GLB TO LOAD CUSTOM RIG • DRAG TO ROTATE VIEW • SCROLL TO ZOOM
      </div>
    </div>
  );
};

function disposeHierarchy(root: THREE.Object3D) {
  root.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m: any) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m: any) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}
