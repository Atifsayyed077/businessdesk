import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);

// Persist auth
pb.autoCancellation(false);

export function getPbUrl() {
  return PB_URL;
}

export function isPbConfigured(): boolean {
  return !!PB_URL;
}
