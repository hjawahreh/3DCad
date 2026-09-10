#pragma once

/**
 * Open3D adapter declaration (CLN-008).
 *
 * License: MIT (Open3D) — see docs/architecture/third-party-geometry.md
 * Status: scaffold only — not linked into production builds yet.
 *
 * When enabled via CADSTUDIO_ENABLE_OPEN3D, the implementation converts
 * MeshView ↔ Open3D geometry internally and never leaks Open3D types
 * across the GeometryBackend boundary.
 */

#include "GeometryBackend.hpp"

namespace cadstudio::geometry {

class Open3DAdapter final : public GeometryBackend {
 public:
  BackendId id() const noexcept override { return BackendId::Open3D; }
  std::string_view name() const noexcept override { return "open3d-adapter"; }
  QualityReport inspect(const MeshView& mesh) const override;
};

}  // namespace cadstudio::geometry
