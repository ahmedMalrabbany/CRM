/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ETA_OFFICIAL_LOGO_SRC, EtaOfficialSeal } from './EtaLogo';
import { useThemeLanguage } from '../context/ThemeLanguageContext';

interface InteractiveBackgroundProps {
  variant?: 'workspace' | 'login';
}

interface NodeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  colorType: 'navy' | 'emerald' | 'indigo';
}

interface RippleWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: 'emerald' | 'sky';
}

interface WatermarkConfig {
  id: string;
  positionClass: string;
  sizeClass: string;
  loginOpacityClass: string;
  workspaceOpacityClass: string;
  ampX: number;
  ampY: number;
  freqX: number;
  freqY: number;
  phase: number;
  rotAmp: number;
  rotFreq: number;
  breathAmp: number;
  parallax: number;
}

const WATERMARK_INSTANCES: WatermarkConfig[] = [
  {
    id: 'side-left',
    positionClass: 'top-1/2 -translate-y-1/2 left-[2%] sm:left-[4%] lg:left-[7%] xl:left-[10%]',
    sizeClass: 'w-[140px] h-[140px] sm:w-[200px] sm:h-[200px] lg:w-[260px] lg:h-[260px] xl:w-[290px] xl:h-[290px]',
    loginOpacityClass: 'opacity-[0.18]',
    workspaceOpacityClass: 'opacity-[0.075] dark:opacity-[0.095]',
    ampX: 20,
    ampY: 46,
    freqX: 0.00042,
    freqY: 0.00058,
    phase: 0,
    rotAmp: 4.5,
    rotFreq: 0.00036,
    breathAmp: 0.045,
    parallax: 14,
  },
  {
    id: 'side-right',
    positionClass: 'top-1/2 -translate-y-1/2 right-[2%] sm:right-[4%] lg:right-[7%] xl:right-[10%]',
    sizeClass: 'w-[140px] h-[140px] sm:w-[200px] sm:h-[200px] lg:w-[260px] lg:h-[260px] xl:w-[290px] xl:h-[290px]',
    loginOpacityClass: 'opacity-[0.18]',
    workspaceOpacityClass: 'opacity-[0.075] dark:opacity-[0.095]',
    ampX: 20,
    ampY: 46,
    freqX: 0.00042,
    freqY: 0.00058,
    phase: Math.PI,
    rotAmp: 4.5,
    rotFreq: -0.00036,
    breathAmp: 0.045,
    parallax: -14,
  },
];

/**
 * GPU-accelerated Autonomous & Interactive Animated Background
 * featuring 2 balanced Egyptian Tax Authority Logo watermarks moving independently
 * on the left and right flanks beside the login screen and workspace content.
 */
export const InteractiveBackground: React.FC<InteractiveBackgroundProps> = ({
  variant = 'workspace',
}) => {
  const { isDark } = useThemeLanguage();
  const [imgError, setImgError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const watermarkRefs = useRef<Array<HTMLDivElement | null>>([]);
  const orbOneRef = useRef<HTMLDivElement | null>(null);
  const orbTwoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const pointer = {
      x: width * 0.5,
      y: height * 0.5,
      targetX: width * 0.5,
      targetY: height * 0.5,
      active: false,
    };

    const ripples: RippleWave[] = [];
    let nodes: NodeParticle[] = [];
    let animationFrameId = 0;
    let lastAutoRippleTime = -1800;
    let rippleEmitterIdx = 0;

    const getOptimalNodeCount = (w: number) => {
      if (w < 640) return 18; // Mobile
      if (w < 1024) return 28; // Tablet
      return 44; // Desktop
    };

    const getConnectionDistance = (w: number) => {
      if (w < 640) return 115;
      if (w < 1024) return 140;
      return 165;
    };

    const initNodes = () => {
      const count = getOptimalNodeCount(width);
      const types: Array<'navy' | 'emerald' | 'indigo'> = ['navy', 'emerald', 'indigo'];
      nodes = Array.from({ length: count }, (_, idx) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: 1.6 + Math.random() * 1.9,
        colorType: types[idx % types.length],
      }));
    };

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!pointer.active) {
        pointer.x = width * 0.5;
        pointer.y = height * 0.5;
        pointer.targetX = width * 0.5;
        pointer.targetY = height * 0.5;
      }

      const targetCount = getOptimalNodeCount(width);
      if (Math.abs(nodes.length - targetCount) > 4 || nodes.length === 0) {
        initNodes();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    const onPointerMove = (e: PointerEvent) => {
      pointer.targetX = e.clientX;
      pointer.targetY = e.clientY;
      pointer.active = true;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointer.targetX = e.clientX;
      pointer.targetY = e.clientY;
      pointer.active = true;
      if (!prefersReducedMotion) {
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          radius: 8,
          maxRadius: width < 640 ? 120 : 180,
          alpha: variant === 'login' ? 0.32 : 0.22,
          color: 'emerald',
        });
        if (ripples.length > 8) ripples.shift();
      }
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const darkCanvas = variant === 'login' || isDark;

    const getNodeColor = (type: NodeParticle['colorType'], alpha: number) => {
      if (darkCanvas) {
        if (type === 'emerald') return `rgba(0, 166, 81, ${alpha})`;
        if (type === 'indigo') return `rgba(255, 255, 255, ${alpha * 0.75})`;
        return `rgba(56, 189, 248, ${alpha})`;
      } else {
        if (type === 'emerald') return `rgba(0, 166, 81, ${alpha})`;
        if (type === 'indigo') return `rgba(0, 75, 135, ${alpha * 0.85})`;
        return `rgba(0, 75, 135, ${alpha})`;
      }
    };

    const renderFrame = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      if (!pointer.active) {
        pointer.targetX = width * 0.5;
        pointer.targetY = height * 0.5;
      }
      pointer.x += (pointer.targetX - pointer.x) * 0.06;
      pointer.y += (pointer.targetY - pointer.y) * 0.06;

      const normX = (pointer.x / Math.max(width, 1) - 0.5) * 2;
      const normY = (pointer.y / Math.max(height, 1) - 0.5) * 2;
      const motionScale = width < 640 ? 0.5 : width < 1024 ? 0.78 : 1;

      // Animate the 2 side ETA watermarks independently (Lissajous drift + breathing + rotation)
      if (!prefersReducedMotion) {
        WATERMARK_INSTANCES.forEach((cfg, idx) => {
          const el = watermarkRefs.current[idx];
          if (!el) return;

          const ax = cfg.ampX * motionScale;
          const ay = cfg.ampY * motionScale;

          const autoX =
            Math.sin(time * cfg.freqX + cfg.phase) * ax +
            Math.cos(time * (cfg.freqX * 0.52) + cfg.phase) * (ax * 0.25);
          const autoY =
            Math.sin(time * cfg.freqY + cfg.phase * 1.2) * ay +
            Math.cos(time * (cfg.freqY * 0.48) + cfg.phase) * (ay * 0.3);

          const scale = 1 + Math.sin(time * 0.00072 + cfg.phase) * cfg.breathAmp;
          const rot =
            Math.sin(time * cfg.rotFreq + cfg.phase) * cfg.rotAmp +
            (pointer.active ? normX * 2 : 0);

          const tx = autoX + (pointer.active ? normX * cfg.parallax : 0);
          const ty = autoY + (pointer.active ? normY * cfg.parallax : 0);

          el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(
            1
          )}px, 0) scale(${scale.toFixed(4)}) rotate(${rot.toFixed(2)}deg)`;
        });
      }

      // Autonomous drifting ambient gradient orbs
      if (orbOneRef.current && !prefersReducedMotion) {
        const orb1X = Math.sin(time * 0.00031) * 34 + (pointer.active ? normX * 20 : 0);
        const orb1Y = Math.cos(time * 0.00026) * 28 + (pointer.active ? normY * 20 : 0);
        orbOneRef.current.style.transform = `translate3d(${orb1X.toFixed(
          1
        )}px, ${orb1Y.toFixed(1)}px, 0)`;
      }
      if (orbTwoRef.current && !prefersReducedMotion) {
        const orb2X = Math.cos(time * 0.00028) * -36 + (pointer.active ? normX * -22 : 0);
        const orb2Y = Math.sin(time * 0.00034) * 30 + (pointer.active ? normY * -22 : 0);
        orbTwoRef.current.style.transform = `translate3d(${orb2X.toFixed(
          1
        )}px, ${orb2Y.toFixed(1)}px, 0)`;
      }

      // Autonomous periodic radar waves emitted alternately from the 2 side watermark emblems
      if (!prefersReducedMotion && time - lastAutoRippleTime >= 2200) {
        lastAutoRippleTime = time;
        const targetEl = watermarkRefs.current[rippleEmitterIdx % WATERMARK_INSTANCES.length];
        rippleEmitterIdx += 1;

        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          const cx = rect.left + rect.width * 0.5;
          const cy = rect.top + rect.height * 0.5;
          ripples.push({
            x: cx,
            y: cy,
            radius: rect.width * 0.42,
            maxRadius: rect.width * 0.92,
            alpha: variant === 'login' ? 0.24 : darkCanvas ? 0.18 : 0.14,
            color: rippleEmitterIdx % 2 === 0 ? 'emerald' : 'sky',
          });
          if (ripples.length > 8) ripples.shift();
        }
      }

      // Autonomous roaming beacon point
      const beaconX = pointer.active
        ? pointer.x
        : width * 0.5 + Math.sin(time * 0.00055) * (width * 0.32);
      const beaconY = pointer.active
        ? pointer.y
        : height * 0.5 + Math.cos(time * 0.00043) * (height * 0.3);

      const maxDist = getConnectionDistance(width);
      const influenceDist = width < 640 ? 125 : 175;

      // Update and draw constellation nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        if (!prefersReducedMotion) {
          n.x += n.vx;
          n.y += n.vy;

          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
          n.x = Math.max(0, Math.min(width, n.x));
          n.y = Math.max(0, Math.min(height, n.y));

          if (pointer.active) {
            const dx = pointer.x - n.x;
            const dy = pointer.y - n.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < influenceDist * influenceDist && distSq > 400) {
              const dist = Math.sqrt(distSq);
              const pull = (1 - dist / influenceDist) * 0.015;
              n.x += dx * pull;
              n.y += dy * pull;
            }
          }
        }

        const nodeAlpha = darkCanvas ? 0.38 : 0.28;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = getNodeColor(n.colorType, nodeAlpha);
        ctx.fill();

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < maxDist * maxDist) {
            const dist = Math.sqrt(distSq);
            const lineAlpha = (1 - dist / maxDist) * (darkCanvas ? 0.16 : 0.11);
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = darkCanvas
              ? `rgba(56, 189, 248, ${lineAlpha})`
              : `rgba(0, 75, 135, ${lineAlpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        const dxb = beaconX - n.x;
        const dyb = beaconY - n.y;
        const distSqB = dxb * dxb + dyb * dyb;
        if (distSqB < influenceDist * influenceDist) {
          const distB = Math.sqrt(distSqB);
          const bAlpha =
            (1 - distB / influenceDist) *
            (pointer.active ? (darkCanvas ? 0.26 : 0.2) : darkCanvas ? 0.14 : 0.1);
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(beaconX, beaconY);
          ctx.strokeStyle = darkCanvas
            ? `rgba(16, 185, 129, ${bAlpha})`
            : `rgba(0, 166, 81, ${bAlpha})`;
          ctx.lineWidth = 1.05;
          ctx.stroke();
        }
      }

      // Draw autonomous & interactive signal ripples
      for (let r = ripples.length - 1; r >= 0; r--) {
        const rip = ripples[r];
        rip.radius += 1.55;
        rip.alpha *= 0.985;

        if (rip.radius >= rip.maxRadius || rip.alpha < 0.008) {
          ripples.splice(r, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
        if (rip.color === 'sky') {
          ctx.strokeStyle = darkCanvas
            ? `rgba(56, 189, 248, ${rip.alpha})`
            : `rgba(0, 75, 135, ${rip.alpha})`;
        } else {
          ctx.strokeStyle = darkCanvas
            ? `rgba(0, 230, 118, ${rip.alpha})`
            : `rgba(0, 166, 81, ${rip.alpha})`;
        }
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(renderFrame);
      }
    };

    animationFrameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [isDark, variant]);

  const isLogin = variant === 'login';
  const darkSurface = isLogin || isDark;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 print:hidden select-none"
      aria-hidden="true"
    >
      {/* 1. Crisp Solid Base Surface (ETA Brand Matched - No Gradients) */}
      {isLogin ? (
        <div className="absolute inset-0 bg-[#001D3D]" />
      ) : (
        <div className="absolute inset-0 bg-[#F4F7FA] dark:bg-[#071629] transition-colors duration-300" />
      )}

      {/* 2. Crisp Geometric Architectural Rings (Solid Thin Strokes - No Blur/Gradients) */}
      <div
        ref={orbOneRef}
        className={`absolute -top-32 -right-28 w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] rounded-full border-2 will-change-transform ${
          isLogin
            ? 'border-[#00A651]/20'
            : 'border-[#00A651]/15 dark:border-[#00A651]/20'
        }`}
      />
      <div
        ref={orbTwoRef}
        className={`absolute -bottom-36 -left-28 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] rounded-full border-2 will-change-transform ${
          isLogin
            ? 'border-[#0062B0]/25'
            : 'border-[#004B87]/12 dark:border-[#0062B0]/20'
        }`}
      />

      {/* 3. Subtle Fine Architectural Dot Grid */}
      <div
        className={`absolute inset-0 ${
          isLogin
            ? 'opacity-[0.06] bg-[radial-gradient(#38bdf8_1px,transparent_1px)]'
            : 'opacity-[0.045] dark:opacity-[0.05] bg-[radial-gradient(#004b87_1px,transparent_1px)] dark:bg-[radial-gradient(#38bdf8_1px,transparent_1px)]'
        } [background-size:28px_28px]`}
      />

      {/* 4. Autonomous & Interactive Constellation + Signal Waves Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 5. Two Symmetrical Moving ETA Watermarks (One on Each Side Beside the Login Screen) */}
      <div className="absolute inset-0 overflow-hidden">
        {WATERMARK_INSTANCES.map((cfg, idx) => (
          <div
            key={cfg.id}
            className={`absolute ${cfg.positionClass} flex items-center justify-center`}
          >
            <div
              ref={(el) => {
                watermarkRefs.current[idx] = el;
              }}
              className="relative flex items-center justify-center will-change-transform"
            >
              {/* Subtle Dashed Orbital Frame Around Each Flank Watermark */}
              <div
                className={`absolute -inset-3 sm:-inset-4 rounded-full border border-dashed ${
                  darkSurface ? 'border-sky-400/20' : 'border-[#004B87]/15'
                }`}
              />

              {!imgError ? (
                <div
                  className={`relative ${cfg.sizeClass} rounded-full overflow-hidden transition-opacity duration-500 ${
                    isLogin
                      ? `${cfg.loginOpacityClass} shadow-[0_0_80px_rgba(56,189,248,0.16)]`
                      : isDark
                      ? `${cfg.workspaceOpacityClass} shadow-[0_0_60px_rgba(56,189,248,0.1)]`
                      : `${cfg.workspaceOpacityClass} mix-blend-multiply`
                  }`}
                >
                  <img
                    src={ETA_OFFICIAL_LOGO_SRC}
                    alt={idx === 0 ? 'شعار مصلحة الضرائب المصرية - وزارة المالية' : ''}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onError={() => setImgError(true)}
                    className={`w-full h-full object-cover object-center scale-[1.02] select-none ${
                      darkSurface
                        ? 'brightness-110 contrast-110 [mask-image:radial-gradient(circle,black_62%,rgba(0,0,0,0.72)_86%,transparent_100%)]'
                        : '[mask-image:radial-gradient(circle,black_64%,rgba(0,0,0,0.78)_88%,transparent_100%)]'
                    }`}
                  />
                </div>
              ) : (
                <div
                  className={`transition-opacity duration-500 ${
                    isLogin ? cfg.loginOpacityClass : cfg.workspaceOpacityClass
                  }`}
                >
                  <EtaOfficialSeal className={cfg.sizeClass} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
