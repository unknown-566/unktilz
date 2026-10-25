import { useEffect, useRef, type PointerEvent } from 'react';
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { faceDir } from '../../../lib/mc/pack/panorama';
import { toImageData, type Img } from '../../../lib/mc/pack/pixels';
import { t } from '../../../lib/i18n-core';

/**
 * The title screen background as the game shows it: you in the middle of the six pictures, turning
 * slowly. Drag to look around. (three.js loads with this.)
 */
export default function PanoramaView({ faces, height = 260 }: { faces: Img[]; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef({ yaw: 0, pitch: -0.15, drag: null as { x: number; y: number } | null, last: 0 });

  useEffect(() => {
    const el = host.current!;
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    const scene = new Scene();
    // The game's title screen looks through an 85° lens.
    const camera = new PerspectiveCamera(85, 1, 0.05, 10);
    const cube = new Group();
    scene.add(cube);

    faces.forEach((img, face) => {
      const c = document.createElement('canvas');
      c.width = img.w;
      c.height = img.h;
      c.getContext('2d')!.putImageData(toImageData(img), 0, 0);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter;
      tex.generateMipmaps = false;
      const corners = [faceDir(face, 0, 0), faceDir(face, 1, 0), faceDir(face, 1, 1), faceDir(face, 0, 1)];
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(corners.flat()), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
      g.setIndex([0, 3, 2, 0, 2, 1]);
      cube.add(new Mesh(g, new MeshBasicMaterial({ map: tex, side: DoubleSide })));
    });

    let raf = 0;
    const draw = (now: number) => {
      const v = view.current;
      // Turns by itself (slowly, like the game) unless you're dragging.
      if (!v.drag && v.last) v.yaw += (now - v.last) * 0.00004;
      v.last = now;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        camera.rotation.set(v.pitch, -v.yaw, 0, 'YXZ');
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      cube.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mat = m.material as MeshBasicMaterial | undefined;
        mat?.map?.dispose();
        mat?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [faces]);

  const down = (e: PointerEvent) => {
    view.current.drag = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const v = view.current;
    if (!v.drag) return;
    v.yaw -= (e.clientX - v.drag.x) * 0.005;
    v.pitch = Math.max(-1.5, Math.min(1.5, v.pitch - (e.clientY - v.drag.y) * 0.005));
    v.drag = { x: e.clientX, y: e.clientY };
  };
  const up = () => {
    view.current.drag = null;
  };

  return (
    <div className="shape3d rp-pano" style={{ height }}>
      <div ref={host} className="shape3d-view" role="img" aria-label={t('The title screen background. Drag to look around.')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    </div>
  );
}
