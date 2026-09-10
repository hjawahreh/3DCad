#pragma once

/**
 * CAD Studio — native geometry backend ABI (CLN-008 scaffolding).
 *
 * Stable C++20 interface for future Open3D / Eigen / nanoflann adapters.
 * Product linking requires a versioned kernel-contract ADR.
 * Do not expose third-party types across this boundary.
 */

#include <cstdint>
#include <span>
#include <string_view>

namespace cadstudio::geometry {

enum class MeshRole : std::uint8_t {
  Source = 0,
  Working = 1,
  Preview = 2,
  Display = 3
};

enum class BackendId : std::uint8_t {
  Reference = 0,
  Open3D = 1,
  MeshOptimizerDisplay = 2
};

struct MeshView {
  std::span<const float> positions;  // xyz packed
  std::span<const std::uint32_t> indices;
  MeshRole role = MeshRole::Working;
  std::uint64_t revision = 0;
};

struct QualityReport {
  bool ok = false;
  std::uint32_t vertex_count = 0;
  std::uint32_t triangle_count = 0;
  std::uint32_t boundary_edges = 0;
  std::uint32_t components = 0;
  std::uint32_t degenerate_count = 0;
};

/**
 * Abstract backend — implementations live under kernel/src/adapters/.
 * Open3D / Eigen types must not appear in public headers.
 */
class GeometryBackend {
 public:
  virtual ~GeometryBackend() = default;
  virtual BackendId id() const noexcept = 0;
  virtual std::string_view name() const noexcept = 0;
  virtual QualityReport inspect(const MeshView& mesh) const = 0;
};

}  // namespace cadstudio::geometry
