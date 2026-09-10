#pragma once

/**
 * Eigen usage policy (CLN-008).
 *
 * Eigen (MPL-2.0) is the preferred library for vectors, matrices, transforms,
 * and least-squares math in the native kernel.
 *
 * Include Eigen only in .cpp translation units or private headers under
 * kernel/src/. Do not re-export Eigen types through public ABI headers.
 *
 * This header documents the policy; it intentionally does not #include Eigen
 * until the kernel target is enabled by ADR.
 */

namespace cadstudio::geometry::eigen_policy {

inline constexpr const char* kLibrary = "Eigen";
inline constexpr const char* kLicense = "MPL-2.0";
inline constexpr const char* kMinVersion = "3.4";

}  // namespace cadstudio::geometry::eigen_policy
