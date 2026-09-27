// A dependency-free entry point from any working directory.
await import("./tools/ice-lab/app/build.mjs");
process.env.ICE_ENTRY = "/game/";
await import("./tools/ice-lab/app/serve.mjs");
