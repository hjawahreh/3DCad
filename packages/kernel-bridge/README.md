# Kernel Bridge (Kernel Integration Layer)

## Purpose

`@cad-studio/kernel-bridge` is COD-006: the Kernel Integration Layer. It owns ABI contracts, session management, capability negotiation, family ports, and mock adapters. It contains **no production geometry algorithms**.

## Owner

CAD Studio Platform / Geometry.

## Public API

Only `src/index.ts`: `KernelBridge`, `MockKernelBridge`, `KernelSessionManager`, `CapabilityNegotiator`, family ports, `KernelOperationResult`, reserved `GeometryTransactionReserve`.

## Allowed dependencies

`@cad-studio/platform-runtime` only.

## Prohibited dependencies

React, Three.js, Domain, Operation Runtime, Geometry Services (callers depend downward), Tauri UI.

## Commands

`pnpm --filter @cad-studio/kernel-bridge typecheck`  
`pnpm --filter @cad-studio/kernel-bridge test`
