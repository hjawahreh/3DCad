#include "cadstudio/geometry/Open3DAdapter.hpp"

namespace cadstudio::geometry {

QualityReport Open3DAdapter::inspect(const MeshView& mesh) const {
  // Scaffold: real Open3D inspection is gated behind CADSTUDIO_ENABLE_OPEN3D.
  // Without Open3D, return counts derived from the opaque MeshView only.
  QualityReport report;
  report.vertex_count = static_cast<std::uint32_t>(mesh.positions.size() / 3);
  report.triangle_count = static_cast<std::uint32_t>(mesh.indices.size() / 3);
  report.ok = report.vertex_count > 0 && report.triangle_count > 0;
  return report;
}

}  // namespace cadstudio::geometry
