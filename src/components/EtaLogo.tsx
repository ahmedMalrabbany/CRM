/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';

export const ETA_OFFICIAL_LOGO_SRC = '/assets/aistudio/1000012016_copy_9807421d.png';

interface CrmLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  lightMode?: boolean;
  noShadow?: boolean;
  title?: string;
  subtitle?: string;
}

/**
 * Official Egyptian Tax Authority (مصلحة الضرائب المصرية) Application Icon
 * Renders the official Ministry of Finance / ETA emblem inside a crisp circular badge
 * with an inline vector fallback if the image fails to load.
 */
export const CrmLogo: React.FC<CrmLogoProps> = ({
  className = '',
  size = 44,
  showText = false,
  lightMode = false,
  noShadow = false,
  title,
  subtitle,
}) => {
  const [imgError, setImgError] = useState(false);
  const displayTitle = title || 'برنامج إدارة خدمة العملاء CRM';
  const displaySubtitle = subtitle || 'مصلحة الضرائب المصرية | وزارة المالية';

  return (
    <div className={`inline-flex items-center gap-3 select-none group ${className}`}>
      <div
        style={{ width: size, height: size }}
        className={`relative shrink-0 rounded-full overflow-hidden bg-white flex items-center justify-center transition-transform duration-300 group-hover:scale-105 ${
          noShadow
            ? ''
            : lightMode
            ? 'ring-2 ring-emerald-400/75 shadow-lg shadow-slate-950/40'
            : 'ring-2 ring-[#004B87]/30 dark:ring-emerald-400/60 shadow-md'
        }`}
        role="img"
        aria-label={displayTitle}
      >
        {!imgError ? (
          <img
            src={ETA_OFFICIAL_LOGO_SRC}
            alt={displayTitle}
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center scale-[1.02] select-none"
          />
        ) : (
          <FallbackEtaCrest size={size} />
        )}
      </div>

      {showText && (
        <div className="flex flex-col text-start min-w-0">
          <div
            className={`font-black text-xs sm:text-base lg:text-lg tracking-tight leading-tight whitespace-nowrap ${
              lightMode ? 'text-white' : 'text-[#004B87] dark:text-sky-200'
            }`}
          >
            {displayTitle}
          </div>
          <div
            className={`text-[9px] sm:text-[11px] font-bold tracking-normal sm:tracking-wide whitespace-nowrap flex items-center gap-1.5 ${
              lightMode ? 'text-[#00E676]' : 'text-[#00A651] dark:text-[#16b962]'
            }`}
          >
            <span>{displaySubtitle}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Backwards compatibility alias
export const EtaLogo = CrmLogo;

interface EtaOfficialSealProps {
  className?: string;
  size?: number;
}

/**
 * Official Egyptian Tax Authority (مصلحة الضرائب المصرية) Circular Watermark Emblem
 * Used behind headers ("برنامج إدارة خدمة العملاء CRM") and as a watermark asset.
 */
export const EtaOfficialSeal: React.FC<EtaOfficialSealProps> = ({
  className = '',
  size = 420,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={className.includes('w-') ? undefined : { width: size, height: size }}
      className={`rounded-full overflow-hidden select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {!imgError ? (
        <img
          src={ETA_OFFICIAL_LOGO_SRC}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center scale-[1.02] brightness-110 contrast-110 [mask-image:radial-gradient(circle,black_62%,rgba(0,0,0,0.75)_86%,transparent_100%)]"
        />
      ) : (
        <FallbackEtaCrest size={size} />
      )}
    </div>
  );
};

const FallbackEtaCrest: React.FC<{ size?: number }> = ({ size = 48 }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      <circle cx="100" cy="100" r="94" fill="#FFFFFF" stroke="#004B87" strokeWidth="4" />
      <circle cx="100" cy="100" r="64" fill="#004B87" />
      <path d="M100 55 L66 128 L100 108 Z" fill="#00A651" />
      <path d="M100 84 L74 132 L126 105 Z" fill="#00C853" />
      <path d="M100 112 L84 134 L132 126 Z" fill="#00E676" />
      <text
        x="100"
        y="26"
        textAnchor="middle"
        fill="#004B87"
        fontFamily="Cairo, sans-serif"
        fontWeight="900"
        fontSize="16"
        id={`fallback-${uid}`}
      >
        مصلحة الضرائب المصرية
      </text>
    </svg>
  );
};
