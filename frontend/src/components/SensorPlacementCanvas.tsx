import { useEffect, useRef } from "react";
import * as THREE from "three";

interface PlacementProps {
  parentBody: string;
  shape: string;
  colorHex: string;
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

export function SensorPlacementCanvas({
  parentBody,
  shape,
  colorHex,
  posX,
  posY,
  posZ,
  rotX,
  rotY,
  rotZ,
  scale,
}: PlacementProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sensorMeshRef = useRef<THREE.Mesh | null>(null);
  const sensorLightRef = useRef<THREE.PointLight | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 360;
    const height = 280;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
    camera.position.set(0, 1.25, 2.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Dynamic Lighting
    const ambientLight = new THREE.AmbientLight(0xdde8f5, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 1.6);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x4dc9f0, 0.8);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    // Spacesuit Materials
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0xe2e5ea,
      roughness: 0.75,
      metalness: 0.1,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xdfa032,
      roughness: 0.15,
      metalness: 0.95,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x242830,
      roughness: 0.65,
      metalness: 0.5,
    });
    const orangeTrim = new THREE.MeshStandardMaterial({
      color: 0xd95a2b,
      roughness: 0.6,
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xb87333,
      metalness: 0.8,
      roughness: 0.3,
    });

    const bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    // Torso (Spacesuit Body)
    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.64, 0.36),
      suitMat
    );
    torsoMesh.position.set(0, 1.0, 0);
    bodyGroup.add(torsoMesh);

    // Chest Telemetry & Life Support Unit (DCM / Display and Control Module)
    const chestMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.22, 0.08),
      darkMat
    );
    chestMesh.position.set(0, 1.08, 0.21);

    // Telemetry OLED indicator screen on DCM
    const oledMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x4dc9f0 })
    );
    oledMesh.position.set(0, 1.10, 0.252);
    bodyGroup.add(chestMesh, oledMesh);

    // Backpack (PLSS - Portable Life Support System)
    const packMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.70, 0.26),
      suitMat
    );
    packMesh.position.set(0, 1.05, -0.29);

    // Oxygen cylinders on top of PLSS
    const o2Cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12),
      orangeTrim
    );
    o2Cylinder.rotation.z = Math.PI / 2;
    o2Cylinder.position.set(0, 1.38, -0.28);
    bodyGroup.add(packMesh, o2Cylinder);

    // PLSS Umbilical Life-Support Conduits (Flexible Ribbed Hoses)
    const curveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 0.85, -0.26),
      new THREE.Vector3(0.28, 0.92, -0.05),
      new THREE.Vector3(0.20, 1.02, 0.21),
    ]);
    const tubeGeoL = new THREE.TubeGeometry(curveL, 16, 0.022, 8, false);
    const tubeMeshL = new THREE.Mesh(tubeGeoL, darkMat);

    const curveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0.85, -0.26),
      new THREE.Vector3(-0.28, 0.92, -0.05),
      new THREE.Vector3(-0.20, 1.02, 0.21),
    ]);
    const tubeGeoR = new THREE.TubeGeometry(curveR, 16, 0.022, 8, false);
    const tubeMeshR = new THREE.Mesh(tubeGeoR, darkMat);
    bodyGroup.add(tubeMeshL, tubeMeshR);

    // Helmet & Visor
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.52, 0.02);
    const helmetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 28, 22),
      suitMat
    );
    const visorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.65),
      visorMat
    );
    visorMesh.rotation.x = Math.PI / 2;
    visorMesh.position.set(0, 0, 0.07);

    // Helmet VHF/UHF Communications Antenna
    const antPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.32, 6),
      copperMat
    );
    antPole.position.set(0.19, 0.22, -0.08);
    antPole.rotation.z = -0.2;

    const antTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      orangeTrim
    );
    antTip.position.set(0.22, 0.38, -0.08);

    headGroup.add(helmetMesh, visorMesh, antPole, antTip);
    bodyGroup.add(headGroup);

    // Articulated Arms with Glove Rings
    const armL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.075, 0.52, 12),
      suitMat
    );
    armL.position.set(0.36, 0.98, 0);
    armL.rotation.z = -0.22;

    const cuffL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.088, 0.04, 12),
      orangeTrim
    );
    cuffL.position.set(0.42, 0.74, 0);
    cuffL.rotation.z = -0.22;

    const armR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.075, 0.52, 12),
      suitMat
    );
    armR.position.set(-0.36, 0.98, 0);
    armR.rotation.z = 0.22;

    const cuffR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.088, 0.04, 12),
      orangeTrim
    );
    cuffR.position.set(-0.42, 0.74, 0);
    cuffR.rotation.z = 0.22;

    bodyGroup.add(armL, cuffL, armR, cuffR);

    // Ground Platform Grid (Precision Engineering Plate)
    const grid = new THREE.GridHelper(3.2, 16, 0x38bdf8, 0x1f2b3c);
    grid.position.y = 0.35;
    scene.add(grid);

    // Circular Holographic Telemetry Pedestal Ring
    const ringGeo = new THREE.RingGeometry(0.6, 0.62, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4dc9f0, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.355;
    scene.add(ringMesh);

    // Sensor Primitive Mesh
    const getGeometry = (sh: string) => {
      switch (sh) {
        case "box":
          return new THREE.BoxGeometry(0.08, 0.08, 0.08);
        case "sphere":
          return new THREE.SphereGeometry(0.05, 18, 18);
        case "capsule":
          return new THREE.CapsuleGeometry(0.03, 0.08, 8, 14);
        case "disc":
          return new THREE.CylinderGeometry(0.065, 0.065, 0.02, 18);
        case "cylinder":
        default:
          return new THREE.CylinderGeometry(0.045, 0.045, 0.09, 18);
      }
    };

    const sensorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex || "#38bdf8"),
      roughness: 0.25,
      metalness: 0.8,
      emissive: new THREE.Color(colorHex || "#38bdf8"),
      emissiveIntensity: 0.35,
    });

    const sensorMesh = new THREE.Mesh(getGeometry(shape), sensorMat);
    bodyGroup.add(sensorMesh);
    sensorMeshRef.current = sensorMesh;

    // Active Sensor Telemetry PointLight Glow
    const sensorLight = new THREE.PointLight(colorHex || "#38bdf8", 1.8, 0.8);
    sensorMesh.add(sensorLight);
    sensorLightRef.current = sensorLight;

    // Interactive Drag / Rotation
    let reqId = 0;
    let isDragging = false;
    let prevMouseX = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouseX;
      prevMouseX = e.clientX;
      bodyGroup.rotation.y += dx * 0.01;
    };
    const onMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    let clock = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      clock += 0.03;

      if (!isDragging) {
        bodyGroup.rotation.y += 0.0035;
      }

      // Breathing animation on torso
      torsoMesh.scale.x = 1.0 + Math.sin(clock * 0.8) * 0.008;

      // Telemetry pulse on sensor light
      if (sensorLightRef.current) {
        sensorLightRef.current.intensity = 1.2 + Math.sin(clock * 4.0) * 0.8;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [shape]);

  // Update sensor transform and color reactively
  useEffect(() => {
    const mesh = sensorMeshRef.current;
    if (!mesh) return;

    let basePosY = 1.08;
    let basePosZ = 0.22;
    let basePosX = 0.0;

    if (parentBody === "astronaut_head") {
      basePosY = 1.55;
      basePosZ = 0.22;
    } else if (parentBody === "astronaut_backpack") {
      basePosY = 1.1;
      basePosZ = -0.42;
    } else if (parentBody === "astronaut_arm_left") {
      basePosX = 0.38;
      basePosY = 0.95;
      basePosZ = 0.05;
    } else if (parentBody === "astronaut_arm_right") {
      basePosX = -0.38;
      basePosY = 0.95;
      basePosZ = 0.05;
    }

    mesh.position.set(basePosX + posX, basePosY + posY, basePosZ + posZ);
    mesh.rotation.set(rotX, rotY, rotZ);
    mesh.scale.set(scale, scale, scale);

    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color.set(colorHex || "#38bdf8");
      mesh.material.emissive.set(colorHex || "#38bdf8");
    }
    if (sensorLightRef.current) {
      sensorLightRef.current.color.set(colorHex || "#38bdf8");
    }
  }, [parentBody, posX, posY, posZ, rotX, rotY, rotZ, scale, colorHex]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: 280,
          borderRadius: 8,
          overflow: "hidden",
          cursor: "grab",
          background: "radial-gradient(circle at 50% 40%, rgba(30, 48, 72, 0.4), #080b10 80%)",
          border: "1px solid var(--line-soft)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 10,
          fontSize: "0.72rem",
          color: "var(--muted)",
          pointerEvents: "none",
          background: "rgba(0,0,0,0.6)",
          padding: "2px 8px",
          borderRadius: 4,
          backdropFilter: "blur(4px)",
        }}
      >
        🔄 Drag to rotate 3D spacesuit & sensor mount
      </div>
    </div>
  );
}
