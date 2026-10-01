import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

export const FluidEnergyCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Pointer coordinates
    const pointer = { x: -1000, y: -1000 };
    const handlePointerMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    window.addEventListener('mousemove', handlePointerMove);

    // Particle pool
    const particleCount = Math.min(100, Math.floor((width * height) / 14000));
    const particles: Particle[] = [];
    const colors = ['#22c55e', '#06b6d4', '#eab308', '#38bdf8'];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 1.6 + 0.8,
        alpha: Math.random() * 0.5 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    // Grid nodes representing distribution grid feeder network
    const gridSpacing = 140;
    let tick = 0;

    const render = () => {
      tick += 0.012;
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, width, height);

      // 1. Subtle Isoline / Grid Contour Map
      ctx.lineWidth = 1;
      const cols = Math.ceil(width / gridSpacing);
      const rows = Math.ceil(height / gridSpacing);

      ctx.strokeStyle = 'rgba(39, 39, 42, 0.4)'; // zinc-800 subtle
      for (let x = 0; x <= cols; x++) {
        for (let y = 0; y <= rows; y++) {
          const px = x * gridSpacing;
          const py = y * gridSpacing;

          // Tiny crosshair at node intersections
          ctx.beginPath();
          ctx.moveTo(px - 3, py);
          ctx.lineTo(px + 3, py);
          ctx.moveTo(px, py - 3);
          ctx.lineTo(px, py + 3);
          ctx.stroke();

          // Subtle electrical field wave
          const distToPointer = Math.hypot(pointer.x - px, pointer.y - py);
          if (distToPointer < 220) {
            const glow = (1 - distToPointer / 220) * 0.35;
            ctx.fillStyle = `rgba(34, 197, 94, ${glow})`;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 2. Connecting feeder circuits
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Wrap around boundaries
        if (p1.x < 0) p1.x = width;
        if (p1.x > width) p1.x = 0;
        if (p1.y < 0) p1.y = height;
        if (p1.y > height) p1.y = 0;

        // Pointer magnetic attraction/repulsion
        const dx = pointer.x - p1.x;
        const dy = pointer.y - p1.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 160 && dist > 1) {
          const force = (160 - dist) / 160;
          p1.vx -= (dx / dist) * force * 0.06;
          p1.vy -= (dy / dist) * force * 0.06;
        }

        // Apply slight drag
        p1.vx *= 0.99;
        p1.vy *= 0.99;

        // Connect near neighbors
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (distance < 110) {
            const lineAlpha = (1 - distance / 110) * 0.18;
            ctx.strokeStyle = `rgba(113, 113, 122, ${lineAlpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        // Draw particle dot
        ctx.fillStyle = p1.color;
        ctx.globalAlpha = p1.alpha * (0.8 + 0.2 * Math.sin(tick * 2 + i));
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, p1.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
      aria-hidden="true"
    />
  );
};
