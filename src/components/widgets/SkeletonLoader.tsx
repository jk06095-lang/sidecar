/**
 * SkeletonLoader — Pulse animation placeholder for loading states.
 * Matches the existing dark theme exactly (bg-slate-700/50).
 * 
 * Usage:
 *   <SkeletonLoader variant="chart" />
 *   <SkeletonLoader variant="kpi" />
 *   <SkeletonLoader variant="list" lines={5} />
 */

import React from 'react';
import { cn } from '../../lib/utils';

type SkeletonVariant = 'chart' | 'list' | 'kpi' | 'text' | 'news';

interface SkeletonLoaderProps {
    variant?: SkeletonVariant;
    lines?: number;
    className?: string;
}

const pulseClass = 'animate-pulse bg-slate-700/50 rounded-lg';

export default function SkeletonLoader({ variant = 'chart', lines = 4, className }: SkeletonLoaderProps) {
    switch (variant) {
        case 'kpi':
            return (
                <div className={cn('flex flex-col gap-2 p-4', className)}>
                    <div className={cn(pulseClass, 'h-3 w-20')} />
                    <div className={cn(pulseClass, 'h-8 w-32')} />
                    <div className={cn(pulseClass, 'h-2 w-16')} />
                </div>
            );

        case 'chart':
            return (
                <div className={cn('flex flex-col gap-2 p-4', className)}>
                    <div className="flex items-center gap-2">
                        <div className={cn(pulseClass, 'h-3 w-3 rounded-full')} />
                        <div className={cn(pulseClass, 'h-3 w-28')} />
                        <div className="ml-auto flex gap-1">
                            <div className={cn(pulseClass, 'h-5 w-14')} />
                            <div className={cn(pulseClass, 'h-5 w-10')} />
                        </div>
                    </div>
                    <div className={cn(pulseClass, 'flex-1 min-h-[140px]')} />
                    <div className="flex gap-4">
                        <div className={cn(pulseClass, 'h-2 w-12')} />
                        <div className={cn(pulseClass, 'h-2 w-12')} />
                        <div className={cn(pulseClass, 'h-2 w-20 ml-auto')} />
                    </div>
                </div>
            );

        case 'list':
            return (
                <div className={cn('flex flex-col gap-2 p-4', className)}>
                    {Array.from({ length: lines }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className={cn(pulseClass, 'h-3 w-3 rounded-full shrink-0')} />
                            <div className={cn(pulseClass, 'h-3 flex-1')} style={{ maxWidth: `${65 + Math.sin(i) * 20}%` }} />
                            <div className={cn(pulseClass, 'h-3 w-10 shrink-0')} />
                        </div>
                    ))}
                </div>
            );

        case 'news':
            return (
                <div className={cn('flex flex-col gap-3 p-4', className)}>
                    {Array.from({ length: lines }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-1.5 p-3 rounded-lg border border-slate-700/20 bg-slate-800/20">
                            <div className="flex items-center gap-2">
                                <div className={cn(pulseClass, 'h-4 w-4 rounded-full shrink-0')} />
                                <div className={cn(pulseClass, 'h-3 w-16')} />
                                <div className={cn(pulseClass, 'h-3 w-12 ml-auto')} />
                            </div>
                            <div className={cn(pulseClass, 'h-4')} style={{ width: `${75 + Math.sin(i * 2) * 15}%` }} />
                            <div className={cn(pulseClass, 'h-3')} style={{ width: `${50 + Math.cos(i) * 20}%` }} />
                        </div>
                    ))}
                </div>
            );

        case 'text':
        default:
            return (
                <div className={cn('flex flex-col gap-2 p-4', className)}>
                    {Array.from({ length: lines }).map((_, i) => (
                        <div key={i} className={cn(pulseClass, 'h-3')} style={{ width: `${60 + Math.sin(i * 1.5) * 25}%` }} />
                    ))}
                </div>
            );
    }
}
