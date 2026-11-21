/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, Type } from 'lucide-react';
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FontFamilyOption,
  FontSizeOption,
  useThemeLanguage,
} from '../context/ThemeLanguageContext';

export interface StyledTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  wrapperClassName?: string;
  showFontControls?: boolean;
}

const FONT_SIZE_CLASS_MAP: Record<FontSizeOption, string> = {
  xs: 'text-xs leading-relaxed',
  sm: 'text-sm leading-relaxed',
  md: 'text-base leading-relaxed',
  lg: 'text-lg leading-relaxed',
  xl: 'text-xl leading-relaxed',
};

const FONT_FAMILY_CLASS_MAP: Record<FontFamilyOption, string> = {
  cairo: "font-['Cairo',sans-serif]",
  tajawal: "font-['Tajawal',sans-serif]",
  ibm_plex: "font-['IBM_Plex_Sans_Arabic',sans-serif]",
  almarai: "font-['Almarai',sans-serif]",
  amiri: "font-['Amiri',serif]",
};

export const StyledTextarea = React.forwardRef<HTMLTextAreaElement, StyledTextareaProps>(
  (
    {
      className = '',
      wrapperClassName = '',
      showFontControls = true,
      disabled,
      readOnly,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) => {
    const {
      fontSize,
      fontFamily,
      setFontFamily,
      increaseFontSize,
      decreaseFontSize,
      resetTypography,
      language,
      isRtl,
    } = useThemeLanguage();

    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isEditable = Boolean(showFontControls && !disabled && !readOnly);
    const showToolbar = isEditable && isFocused;

    const currentSizeMeta =
      FONT_SIZE_OPTIONS.find((o) => o.id === fontSize) || FONT_SIZE_OPTIONS[2];
    const sizeIdx = FONT_SIZE_OPTIONS.findIndex((o) => o.id === fontSize);
    const canDecrease = sizeIdx > 0;
    const canIncrease = sizeIdx < FONT_SIZE_OPTIONS.length - 1;
    const isModified = fontSize !== 'md' || fontFamily !== 'cairo';

    const hasFlexOne = /\bflex-1\b/.test(className);
    const cleanedClassName = className
      .replace(/\btext-(?:xs|sm|base|lg|xl|2xl)\b/g, '')
      .replace(/\bfont-(?:sans|serif|mono)\b/g, '')
      .replace(/\bflex-1\b/g, '')
      .trim();

    const sizeClass = FONT_SIZE_CLASS_MAP[fontSize] || FONT_SIZE_CLASS_MAP.md;
    const familyClass = FONT_FAMILY_CLASS_MAP[fontFamily] || FONT_FAMILY_CLASS_MAP.cairo;

    const computedWrapperClass = [
      hasFlexOne ? 'flex-1 min-w-0' : 'w-full',
      wrapperClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const computedTextareaClass = [
      'w-full',
      cleanedClassName,
      sizeClass,
      familyClass,
    ]
      .filter(Boolean)
      .join(' ');

    const handleContainerFocus = () => {
      if (isEditable) {
        setIsFocused(true);
      }
    };

    const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setIsFocused(false);
      }
    };

    return (
      <div
        ref={containerRef}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
        className={computedWrapperClass}
      >
        {showToolbar && (
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-slate-100/95 dark:bg-[#071C36] border border-slate-300 dark:border-[#004B87] shadow-xs text-[11px]"
          >
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 font-bold text-[#004B87] dark:text-sky-200 px-1">
                <Type className="w-3.5 h-3.5 text-[#00A651]" />
                <span className="hidden sm:inline">
                  {language === 'ar' ? 'الخط:' : 'Font:'}
                </span>
              </span>

              {/* Font Family Selector */}
              <select
                aria-label={language === 'ar' ? 'نوع وشكل الخط' : 'Font Style'}
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as FontFamilyOption)}
                className="max-w-[145px] sm:max-w-[190px] truncate px-1.5 py-0.5 rounded-md bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#004B87] text-slate-800 dark:text-white font-bold text-[11px] focus:outline-none focus:ring-1 focus:ring-[#00A651] cursor-pointer"
              >
                {FONT_FAMILY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {language === 'ar' ? opt.arLabel : opt.enLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={decreaseFontSize}
                disabled={!canDecrease}
                title={language === 'ar' ? 'تصغير الخط' : 'Decrease Font Size'}
                aria-label={language === 'ar' ? 'تصغير الخط' : 'Decrease Font Size'}
                className="p-1 rounded-md bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#004B87] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#003366] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>

              <span className="min-w-[38px] text-center font-mono font-bold text-[11px] text-[#004B87] dark:text-[#00E676] tabular-nums">
                {currentSizeMeta.scaleLabel}
              </span>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={increaseFontSize}
                disabled={!canIncrease}
                title={language === 'ar' ? 'تكبير الخط' : 'Increase Font Size'}
                aria-label={language === 'ar' ? 'تكبير الخط' : 'Increase Font Size'}
                className="p-1 rounded-md bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#004B87] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#003366] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>

              {isModified && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={resetTypography}
                  title={language === 'ar' ? 'استعادة الخط الافتراضي' : 'Reset Default Font'}
                  aria-label={language === 'ar' ? 'استعادة الخط الافتراضي' : 'Reset Default Font'}
                  className="p-1 rounded-md bg-white dark:bg-[#0B1D35] border border-slate-300 dark:border-[#004B87] text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <textarea
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          onFocus={(e) => {
            if (isEditable) setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={onBlur}
          className={computedTextareaClass}
          {...rest}
        />
      </div>
    );
  }
);

StyledTextarea.displayName = 'StyledTextarea';
