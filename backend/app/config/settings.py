from pydantic_settings import BaseSettings, SettingsConfigDict

# Fallbacks only — named so a reader isn't left decoding a bare string
# literal inside a Field default. The real override path is the env var
# (GEMINI_MODEL / ANTHROPIC_MODEL in .env), which pydantic-settings
# matches case-insensitively; changing which model runs is a one-line
# .env edit and should never need a code change or a redeploy. These
# constants exist for the case where .env sets nothing at all.
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5"

# Daily AI call budgets (epic 016, ADR 022). Named here for the same
# reason the model names above are: a budget should be a .env edit, never
# a code change, and a bare integer in a Field default tells a reader
# nothing about which of the four it is.
#
# Counted in calls rather than tokens — ADR 018 narrowed the provider
# protocol to prompt-in/text-out, so there is no usage metadata to meter.
# Per endpoint rather than one weighted budget, so heavy generator use
# cannot refuse a Word Pairs quiz for reasons a learner can't see. The
# asymmetry between them (a grading call costs roughly three times a
# generation) is priced into these numbers, not into a mechanism.
#
# Chosen so honest use never reaches them, not measured — there is no
# usage data yet. One grading call covers a whole run of up to six pairs,
# so ten of them is sixty written sentences in a day.
DEFAULT_GENERATE_DEVICE_DAILY_LIMIT = 20
DEFAULT_GRADE_DEVICE_DAILY_LIMIT = 10

# The global caps are what actually bound the bill; the per-device ones
# above exist so a single caller cannot consume these and deny everyone
# else (ADR 022). Roughly 25 and 20 devices respectively at full personal
# budget.
DEFAULT_GENERATE_GLOBAL_DAILY_LIMIT = 500
DEFAULT_GRADE_GLOBAL_DAILY_LIMIT = 200


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    migrations_database_url: str = ""

    # Tests connect here instead of database_url. The fixtures in
    # tests/conftest.py roll back every write, but rolling back writes
    # does not isolate *reads*: a query that aggregates over a whole
    # table — the leaderboard's SUM ... GROUP BY, epic 016's global quota
    # counter — still sees rows a developer committed by using the app.
    # That is why the leaderboard tests passed in CI, whose Postgres is
    # created empty for every run, and failed on any machine the app had
    # actually been used on.
    #
    # Falls back to database_url when unset, which is exactly what CI
    # relies on: it already points DATABASE_URL at a dedicated sento_ci
    # database, so nothing there needs to set this. Local development is
    # the case that does — see README/.env.example for the two commands.
    test_database_url: str = ""

    # Mounts the unauthenticated content-write endpoints (CSV upload,
    # status PATCH). Not a feature flag — those were removed with ADR
    # 012 — but access control standing in for the auth this project
    # does not have. Leave false anywhere reachable by anyone else.
    admin_writes_enabled: bool = False

    # Mounts the unauthenticated sentence/folder persistence endpoints
    # (save, list, relocate, delete, and all of /sentence-folders). Same
    # category as admin_writes_enabled — access control standing in for
    # the auth this project does not have (ADR 012), not an epic gate.
    #
    # Saved sentences live in the user's browser as of epic 013, so
    # nothing calls these; left mounted they are an unattributed shared
    # pile anyone can write into whatever database they point at, which
    # is the exact thing that epic exists to stop. The auth epic turns
    # this on again behind a user_id. POST /sentences/generate is NOT
    # gated by it — that endpoint has no persistence and the app needs it.
    sentence_persistence_enabled: bool = False

    # Sentence Generator (epic 5) — selects the AI provider at runtime.
    # "development" -> Gemini, "production" -> Claude. See
    # services/sentence_generation_service.py for the switch itself.
    environment: str = "development"
    # Uppercase, unlike every other field on this class. A deliberate
    # exception: these two hold secrets pulled straight from the
    # environment and nowhere else, so the field name mirrors the env
    # var it reads (GEMINI_API_KEY / ANTHROPIC_API_KEY) rather than
    # following the lowercase convention the rest of the class uses.
    # Functionally identical either way — pydantic-settings matches env
    # vars case-insensitively — this is naming only.
    GEMINI_API_KEY: str = ""
    gemini_model: str = DEFAULT_GEMINI_MODEL
    ANTHROPIC_API_KEY: str = ""
    anthropic_model: str = DEFAULT_ANTHROPIC_MODEL

    # AI quota (epic 016, ADR 022). Four independent dials rather than one
    # shared budget split by percentage: a per-device cap expressed as a
    # share of the global one means N devices at full budget exhaust
    # everything and the N+1th honest learner is refused. These are
    # tuning knobs, not gates like admin_writes_enabled — the feature is
    # unconditionally on, and setting one to 0 disables an endpoint
    # rather than configuring it.
    generate_device_daily_limit: int = DEFAULT_GENERATE_DEVICE_DAILY_LIMIT
    grade_device_daily_limit: int = DEFAULT_GRADE_DEVICE_DAILY_LIMIT
    generate_global_daily_limit: int = DEFAULT_GENERATE_GLOBAL_DAILY_LIMIT
    grade_global_daily_limit: int = DEFAULT_GRADE_GLOBAL_DAILY_LIMIT

    def resolved_migrations_url(self) -> str:
        """Falls back to database_url when no separate migrations URL is set —
        true for local Postgres, where there's no pooler distinction to make."""
        return self.migrations_database_url or self.database_url

    def resolved_test_url(self) -> str:
        """Falls back to database_url when no separate test URL is set — true
        in CI, which already runs against a throwaway database. Locally the
        fallback is the state that produced the isolation bug this exists to
        fix, so a developer should set TEST_DATABASE_URL."""
        return self.test_database_url or self.database_url


settings = Settings()