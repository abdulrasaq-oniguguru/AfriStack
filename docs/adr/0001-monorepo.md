# ADR 0001: TypeScript package monorepo

Status: accepted — 2026-10-04

Use pnpm workspaces with small packages around stable boundaries. This gives adapters independent dependencies and release histories while one strict TypeScript configuration and test runner enforce compatibility. Turborepo is deferred until task-graph caching is measurably useful.
