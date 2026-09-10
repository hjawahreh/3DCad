# Testing

Unit and architecture tests cover isolated renderer sessions, canvas hosting without GPU ownership, mock capability detection, factory registry wiring, render-graph validation and scheduling, GPU resource reference counting and budgets, material and shader registries, pass lifecycle and pipeline order, full-frame execution with conflict detection, screenshots, renderer services, and GPU task cancellation.

Performance tests assert sixty empty mock frames complete under one second and that the GPU task scheduler cancels work on demand and on dispose.

Tests use the mock backend; they do not require a physical GPU. Canvas attach uses plain size objects where a DOM canvas is unnecessary. Tests avoid wall-clock sleeps and ambient React globals.
