import type { QualityId } from './types';

export interface QualityProfile {
  id: QualityId;
  label: string;
  /** Hard cap on rendered people. */
  crowdMax: number;
  maxPixelRatio: number;
  bloom: boolean;
  bloomScale: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Real (shading-affecting) dynamic lights. */
  realLights: number;
  hazeParticles: number;
  maxBeams: number;
  maxLasers: number;
  reflections: boolean;
  reflectionScale: number;
  msaa: number;
  textureSize: number;
}

export const QUALITY: Record<QualityId, QualityProfile> = {
  LOW: { id: 'LOW', label: 'Low', crowdMax: 260, maxPixelRatio: 1, bloom: false, bloomScale: 0.5, shadows: false, shadowMapSize: 512, realLights: 3, hazeParticles: 36, maxBeams: 8, maxLasers: 3, reflections: false, reflectionScale: 0.25, msaa: 0, textureSize: 256 },
  MEDIUM: { id: 'MEDIUM', label: 'Medium', crowdMax: 480, maxPixelRatio: 1.25, bloom: true, bloomScale: 0.4, shadows: false, shadowMapSize: 1024, realLights: 4, hazeParticles: 90, maxBeams: 14, maxLasers: 5, reflections: false, reflectionScale: 0.3, msaa: 0, textureSize: 512 },
  HIGH: { id: 'HIGH', label: 'High', crowdMax: 760, maxPixelRatio: 1.5, bloom: true, bloomScale: 0.5, shadows: false, shadowMapSize: 1024, realLights: 5, hazeParticles: 160, maxBeams: 22, maxLasers: 7, reflections: true, reflectionScale: 0.35, msaa: 4, textureSize: 1024 },
  ULTRA: { id: 'ULTRA', label: 'Ultra', crowdMax: 1100, maxPixelRatio: 2, bloom: true, bloomScale: 0.6, shadows: true, shadowMapSize: 2048, realLights: 6, hazeParticles: 260, maxBeams: 32, maxLasers: 9, reflections: true, reflectionScale: 0.5, msaa: 4, textureSize: 1024 },
};

export const QUALITY_ORDER: QualityId[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
