cmake_minimum_required(VERSION 3.25)
project(CADStudioKernel LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# CLN-008: header/scaffold targets only. Full geometry product targets require ADR.
add_library(cadstudio_geometry_headers INTERFACE)
target_include_directories(cadstudio_geometry_headers INTERFACE
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

option(CADSTUDIO_ENABLE_OPEN3D "Link Open3D adapter (off by default)" OFF)
if(CADSTUDIO_ENABLE_OPEN3D)
  message(STATUS "Open3D adapter enablement requires approved dependency vendoring")
endif()

# Product targets are introduced only with an approved kernel contract ADR.
