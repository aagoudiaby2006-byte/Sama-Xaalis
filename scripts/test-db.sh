#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local PostgreSQL database and runs supabase/tests/rls_test.sql.
# Requires a local PostgreSQL (psql as the `postgres` superuser). Usage: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
DB="sx_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q)
if [ "$(id -u)" = "0" ]; then RUN=(su postgres -c); else RUN=(bash -c); fi

"${RUN[@]}" "createdb $DB"
trap '"${RUN[@]}" "dropdb --if-exists $DB"' EXIT

cat supabase/tests/supabase_stubs.sql supabase/migrations/*.sql supabase/tests/rls_test.sql > "/tmp/$DB.sql"
chmod 644 "/tmp/$DB.sql"
"${RUN[@]}" "${PSQL[*]} -d $DB -f /tmp/$DB.sql"
rm -f "/tmp/$DB.sql"
