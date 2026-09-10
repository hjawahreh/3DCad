# Arch Analysis

## Method

Quadratic least-squares fit in XY through identified present tooth centroids:

`y = a + b x + c x²`

**Version:** `arch` `1.0.0`  
**Deterministic** for identical inputs.

Stored metadata:

- coefficients
- fit RMSE
- source tooth instance ids
- arch width (outermost centroids)
- arch depth (anterior offset from chord)

## Explicit non-claims

A mathematical fit is not a clinically validated arch form.

## Incomplete data

Fewer than three identified present teeth → `INCOMPLETE`.
