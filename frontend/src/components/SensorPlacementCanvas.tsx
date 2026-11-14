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

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 360;
    const height = 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1c22);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
    camera.position.set(0, 1.2, 2.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    // Parent Body Representation (Astronaut Torso / Helmet / Limbs)
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x9fa8b3,
      roughness: 0.6,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xe0ad4a,
      roughness: 0.2,
      metalness: 0.9,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2a2d32,
      roughness: 0.8,
    });

    const bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    // Torso
    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.62, 0.34),
      suitMat
    );
    torsoMesh.position.set(0, 1.0, 0);
    bodyGroup.add(torsoMesh);

    // Chest unit
    const chestMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.06),
      darkMat
    );
    chestMesh.position.set(0, 1.08, 0.19);
    bodyGroup.add(chestMesh);

    // Backpack (PLSS)
    const packMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.66, 0.24),
      suitMat
    );
    packMesh.position.set(0, 1.04, -0.28);
    bodyGroup.add(packMesh);

    // Helmet & Visor
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.5, 0.02);
    const helmetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 24, 18),
      suitMat
    );
    const visorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62),
      visorMat
    );
    visorMesh.rotation.x = Math.PI / 2;
    visorMesh.position.set(0, 0, 0.07);
    headGroup.add(helmetMesh, visorMesh);
    bodyGroup.add(headGroup);

    // Arms
    const armL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12),
      suitMat
    );
    armL.position.set(0.35, 1.0, 0);
    armL.rotation.z = -0.2;
    const armR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12),
      suitMat
    );
    armR.position.set(-0.35, 1.0, 0);
    armR.rotation.z = 0.2;
    bodyGroup.add(armL, armR);

    // Ground platform grid
    const grid = new THREE.GridHelper(3, 12, 0x445566, 0x223344);
    grid.position.y = 0.4;
    scene.add(grid);

    // Sensor Primitive Mesh
    const getGeometry = (sh: string) => {
      switch (sh) {
        case "box":
          return new THREE.BoxGeometry(0.08, 0.08, 0.08);
        case "sphere":
          return new THREE.SphereGeometry(0.05, 16, 16);
        case "capsule":
          return new THREE.CapsuleGeometry(0.03, 0.08, 8, 12);
        case "disc":
          return new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16);
        case "cylinder":
        default:
          return new THREE.CylinderGeometry(0.04, 0.04, 0.09, 16);
      }
    };

    const sensorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex || "#3a86ff"),
      roughness: 0.3,
      metalness: 0.5,
    });

    const sensorMesh = new THREE.Mesh(getGeometry(shape), sensorMat);
    bodyGroup.add(sensorMesh);
    sensorMeshRef.current = sensorMesh;

    // Animation / Orbit loop
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

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (!isDragging) {
        // Slow gentle idle rotation
        bodyGroup.rotation.y += 0.003;
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

    // Anchor position based on parentBody + offset
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
      mesh.material.color.set(colorHex || "#3a86ff");
    }
  }, [parentBody, posX, posY, posZ, rotX, rotY, rotZ, scale, colorHex]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: 260,
          borderRadius: 6,
          overflow: "hidden",
          cursor: "grab",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 8,
          fontSize: "0.72rem",
          color: "#8899aa",
          pointerEvents: "none",
        }}
      >
        Click & drag to rotate view
      </div>
    </div>
  );
}
