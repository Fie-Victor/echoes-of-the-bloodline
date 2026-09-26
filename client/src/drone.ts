import * as THREE from "three";

export class Drone {
  readonly root = new THREE.Group();
  private eye: THREE.MeshStandardMaterial;
  private thrusters: THREE.Mesh[] = [];
  speaking = false;

  constructor() {
    const hull = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.85, roughness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.8, roughness: 0.4 });
    this.eye = new THREE.MeshStandardMaterial({ color: 0x66f0ff, emissive: 0x22d8ff, emissiveIntensity: 5 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), hull);
    body.scale.set(1, 0.7, 1.5);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.6), dark);
    visor.rotation.x = Math.PI / 2;
    visor.position.z = 0.17;
    visor.scale.set(1, 1, 0.6);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 8), this.eye);
    eye.position.set(0, 0, 0.29);
    this.root.add(body, visor, eye);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.08), dark);
      arm.position.set(side * 0.28, 0.02, -0.05);
      arm.rotation.z = side * 0.25;
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 20), hull);
      pod.position.set(side * 0.44, 0.07, -0.05);
      const thruster = new THREE.Mesh(new THREE.CircleGeometry(0.065, 20), this.eye);
      thruster.rotation.x = Math.PI / 2;
      thruster.position.set(side * 0.44, -0.015, -0.05);
      this.thrusters.push(thruster);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.2), hull);
      fin.position.set(side * 0.1, 0.14, -0.2);
      fin.rotation.z = -side * 0.4;
      this.root.add(arm, pod, thruster, fin);
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.root.scale.setScalar(0.7);
  }

  update(dt: number, t: number, player: THREE.Object3D, lookAt: THREE.Vector3): void {
    const offset = new THREE.Vector3(-1.1, 2.1 + Math.sin(t * 1.8) * 0.12, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
    const target = player.position.clone().add(offset);
    this.root.position.lerp(target, 1 - Math.exp(-dt * 3));
    const q = this.root.quaternion.clone();
    this.root.lookAt(lookAt);
    const look = this.root.quaternion.clone();
    this.root.quaternion.copy(q).slerp(look, 1 - Math.exp(-dt * 4));
    this.root.rotation.z = Math.sin(t * 1.3) * 0.08;
    this.eye.emissiveIntensity = this.speaking ? 5 + Math.sin(t * 25) * 3 : 4 + Math.sin(t * 2) * 0.8;
    for (const th of this.thrusters) th.scale.setScalar(0.9 + Math.random() * 0.2);
  }
}
