#!/usr/bin/env bash
set -euo pipefail

echo "=== typecheck ==="
npm run typecheck

echo "=== unit tests ==="
npm run test

echo "=== build ==="
npm run build

echo "=== smoke-test passed ==="
