export const PARTICLE_BUDGET = {
  full: 4000,
  reduced: 1500,
  minimal: 500,
} as const;

interface DeviceCapabilities {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export function getParticleBudget(caps: DeviceCapabilities): number {
  const cores = caps.hardwareConcurrency;
  const memory = caps.deviceMemory;

  // Very low memory is always minimal, regardless of cores
  if (memory != null && memory <= 2) return PARTICLE_BUDGET.minimal;

  // Low cores = minimal
  if (cores != null && cores <= 2) return PARTICLE_BUDGET.minimal;

  // High-end device
  if ((cores != null && cores >= 6) && (memory == null || memory >= 6)) {
    return PARTICLE_BUDGET.full;
  }
  if (cores != null && cores >= 6 && memory == null) {
    return PARTICLE_BUDGET.full;
  }

  // Everything else (mid-range or unknown)
  return PARTICLE_BUDGET.reduced;
}
