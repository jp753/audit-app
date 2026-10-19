import { useEffect, useRef } from 'preact/hooks';

/** Finger signature box. Calls onChange with a PNG data URL ('' when cleared). */
export function SignaturePad(props: { value: string; onChange: (dataUrl: string) => void; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Size the canvas to its box and show any saved signature.
  useEffect(() => {
    const c = canvas.current!;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * ratio;
    c.height = h * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0B2545';
    if (props.value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = props.value;
    }
  }, []);

  const pos = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e: PointerEvent) {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0B2545';
    ctx.fill();
    dirty.current = true;
  }
  function move(e: PointerEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) props.onChange(exportPng());
  }
  function exportPng(): string {
    // Copy onto white so the signature shows on any background.
    const c = canvas.current!;
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0);
    return out.toDataURL('image/png');
  }
  function clear() {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    props.onChange('');
  }

  return (
    <div>
      <canvas
        ref={canvas}
        class="sigpad"
        aria-label={props.label}
        onPointerDown={down as any}
        onPointerMove={move as any}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span class="small muted">{props.value ? 'Signed' : 'Sign above with your finger'}</span>
        <button type="button" class="btn ghost" style={{ minHeight: 44, padding: '6px 14px' }} onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
