#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMMAND="collector"
if [[ $# -gt 0 ]]; then
    case "$1" in
        api|collector|status)
            COMMAND="$1"
            shift
            ;;
        -*)
            ;;
        *)
            echo "사용법: ./trends_dev.sh [api|collector|status] [옵션]" >&2
            exit 2
            ;;
    esac
fi

case "$COMMAND" in
    api)
        exec npm run trends:api:development -- "$@"
        ;;
    collector)
        exec npm run trends:collector:development -- "$@"
        ;;
    status)
        exec npm run trends:env:status -- development
        ;;
esac
