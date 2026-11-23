#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ] && [ -z "${DB_URL:-}" ]; then
    case "$DATABASE_URL" in
        postgresql://*@*)
            DB_URL="jdbc:postgresql://${DATABASE_URL#*@}"
            export DB_URL
            ;;
        jdbc:postgresql://*)
            DB_URL="$DATABASE_URL"
            export DB_URL
            ;;
        *)
            printf '%s\n' 'DATABASE_URL must be a PostgreSQL URL.' >&2
            exit 64
            ;;
    esac
fi

exec java -jar /app/app.jar "$@"
