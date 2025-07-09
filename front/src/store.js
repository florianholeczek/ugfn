import { writable } from 'svelte/store';

export const flow_velocity = writable(0.5);
export const flow_n_particles = writable(1000);
export const flow_vectorfield = writable(false);
export const flow_vectors = writable([]);
export const flow_changed = writable(true);
export const A_molecule_prop = writable({
  mw: 0.5,
  logP: 0.5,
  hbd: 0.5,
  hba: 0.5,
  tpsa: 0.5,
  rotb: 0.5
});