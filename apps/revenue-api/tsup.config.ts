import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  bundle: true,
  minify: false,
  splitting: false,
  treeshake: true,
})
