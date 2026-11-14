// Set dressing per zone (cover, landmarks, decor). Uses the prop kit; every blocking prop registers an AABB.
import * as THREE from 'three';
import { DECAL } from './textures.js';

export function dressZones(K) {
  const { slab } = K;
  slab(-76, 76, 42, 56);
}
