import { getParticleBudget, PARTICLE_BUDGET } from '../particleBudget';

describe('getParticleBudget', () => {
  it('exports default and reduced budgets', () => {
    expect(PARTICLE_BUDGET.full).toBe(4000);
    expect(PARTICLE_BUDGET.reduced).toBe(1500);
    expect(PARTICLE_BUDGET.minimal).toBe(500);
  });

  it('returns full budget for capable devices', () => {
    expect(getParticleBudget({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(PARTICLE_BUDGET.full);
  });

  it('returns reduced budget for mid-range devices', () => {
    expect(getParticleBudget({ hardwareConcurrency: 4, deviceMemory: 4 })).toBe(PARTICLE_BUDGET.reduced);
  });

  it('returns minimal budget for low-end devices', () => {
    expect(getParticleBudget({ hardwareConcurrency: 2, deviceMemory: 2 })).toBe(PARTICLE_BUDGET.minimal);
  });

  it('returns reduced budget when capabilities are unknown', () => {
    expect(getParticleBudget({})).toBe(PARTICLE_BUDGET.reduced);
  });

  it('uses hardwareConcurrency alone when deviceMemory is unavailable', () => {
    expect(getParticleBudget({ hardwareConcurrency: 8 })).toBe(PARTICLE_BUDGET.full);
    expect(getParticleBudget({ hardwareConcurrency: 2 })).toBe(PARTICLE_BUDGET.minimal);
  });

  it('downgrades to minimal if deviceMemory is very low regardless of cores', () => {
    expect(getParticleBudget({ hardwareConcurrency: 8, deviceMemory: 1 })).toBe(PARTICLE_BUDGET.minimal);
  });
});
