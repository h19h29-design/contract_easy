#!/usr/bin/env bash
# 실행 중인 터미널을 유지하면 이 Mac에서 NAS 업무공간을 사용할 수 있다.
set -euo pipefail
printf '접속 주소: http://127.0.0.1:3300 (종료: Ctrl+C)\n'
exec ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:3300:127.0.0.1:3300 \
  -L 127.0.0.1:8787:127.0.0.1:8787 ds925-home
