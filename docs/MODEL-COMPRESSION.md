# Model compression

All six generators use `exportGLB` in `scripts/model-geometry.ts`. The exporter
encodes buffer views with required `EXT_meshopt_compression`. Float attributes
are kept at their original precision: there is no quantization, simplification,
mesh merging, or material deduplication. Mesh/node names and material
`extras.role` remain available to the runtime's material assignment.

The current viewer loads compressed assets from `/models/meshopt/`. The original
six uncompressed files under `/models/` serve tabs opened before the decoder
shipped. The generators write only to `public/models/meshopt/` so those tabs
can keep switching models.

To regenerate the compressed files, run the procedural generators.

```sh
bun install --frozen-lockfile
for model in gbc gbasp ds dsi 3ds psp; do
  bun "scripts/generate-$model.ts"
done
bun test
```

The encoder and glTF extension library are development dependencies only.
`main.ts` registers Three.js's bundled `MeshoptDecoder` with `GLTFLoader`;
no separate decoder download or CDN is needed. The tests that parse models
register the same decoder. `model-compression.test.ts` checks the compression
requirement, named meshes, material roles, and the missing-decoder error.

Compression does not reduce the models' decoded geometry or rendering cost.
It reduces transferred bytes even when the asset server does not apply HTTP
compression to `model/gltf-binary` responses.
