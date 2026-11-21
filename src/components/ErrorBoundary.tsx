/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ غير متوقع أثناء عرض الواجهة.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetSessionAndReload = () => {
    try {
      localStorage.removeItem('eta_crm_active_session');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#001A35] text-white flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full bg-white text-slate-900 rounded-2xl shadow-2xl border-2 border-[#00A651] p-6 space-y-4 text-right">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-black text-base text-[#00264D]">
                  حدث خطأ مؤقت في عرض الشاشة
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  منظومة مركز الاتصال المتكامل 16395
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold break-words">
              {this.state.errorMessage}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleResetSessionAndReload}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>العودة لشاشة الدخول</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-[#00A651] hover:bg-[#008742] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إعادة تحميل المنظومة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
