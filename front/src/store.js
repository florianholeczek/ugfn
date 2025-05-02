import { writable } from 'svelte/store';

export const flow_velocity = writable(0.5);
export const flow_n_particles = writable(1000);
export const flow_vectorfield = writable(false);
export const flow_vectors = writable([]);
export const flow_changed = writable(true);
