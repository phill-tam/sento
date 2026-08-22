"""Covers the counter mechanism, including the race it exists to close.

The atomicity test is the one that matters. Every other case here would
pass just as happily against a read-compare-write implementation, which
is precisely the implementation ADR 022 rejects — so asserting the SQL
by inspection would prove nothing. It runs real concurrent sessions on
their own connections instead.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from uuid import uuid4

from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session, sessionmaker

from app.config.settings import settings
from app.models.usage_counter import UsageCounter
from app.services.usage_counter import check_and_increment, refund

WINDOW = date(2026, 8, 22)


def counter_for(db: Session, key: str) -> int:
    row = db.get(UsageCounter, (key, WINDOW))
    return 0 if row is None else row.count


class TestCheckAndIncrement:
    def test_first_call_of_a_window_is_allowed_and_counted(self, db_session: Session) -> None:
        assert check_and_increment(db_session, key="k", limit=3, window_start=WINDOW) is True
        assert counter_for(db_session, "k") == 1

    def test_allows_exactly_the_limit_then_refuses(self, db_session: Session) -> None:
        allowed = [
            check_and_increment(db_session, key="k", limit=3, window_start=WINDOW)
            for _ in range(4)
        ]

        assert allowed == [True, True, True, False]
        assert counter_for(db_session, "k") == 3

    def test_a_refused_call_does_not_increment(self, db_session: Session) -> None:
        """The count stops at the limit rather than climbing while calls
        are refused. A counter that kept rising would make a refund
        meaningless — it would give back an occurrence that was never
        served."""
        for _ in range(5):
            check_and_increment(db_session, key="k", limit=2, window_start=WINDOW)

        assert counter_for(db_session, "k") == 2

    def test_a_zero_limit_refuses_the_very_first_call(self, db_session: Session) -> None:
        """The conflict branch's WHERE only runs on collision, so without
        the explicit guard the first call of a window would insert count=1
        and be allowed however small the limit."""
        assert check_and_increment(db_session, key="k", limit=0, window_start=WINDOW) is False
        assert counter_for(db_session, "k") == 0

    def test_keys_are_counted_independently(self, db_session: Session) -> None:
        check_and_increment(db_session, key="a", limit=1, window_start=WINDOW)

        assert check_and_increment(db_session, key="b", limit=1, window_start=WINDOW) is True

    def test_windows_are_counted_independently(self, db_session: Session) -> None:
        """What makes a daily budget reset at all — the same key in a new
        window is a different row, not a value to clear."""
        next_day = date(2026, 8, 23)
        check_and_increment(db_session, key="k", limit=1, window_start=WINDOW)

        assert check_and_increment(db_session, key="k", limit=1, window_start=next_day) is True


class TestRefund:
    def test_gives_one_back(self, db_session: Session) -> None:
        check_and_increment(db_session, key="k", limit=2, window_start=WINDOW)
        check_and_increment(db_session, key="k", limit=2, window_start=WINDOW)

        refund(db_session, key="k", window_start=WINDOW)

        assert counter_for(db_session, "k") == 1

    def test_a_refund_frees_a_call_that_was_being_refused(self, db_session: Session) -> None:
        """The property the provider-429 path depends on: a refunded
        charge really does return the learner's budget, not just a
        number on a row."""
        check_and_increment(db_session, key="k", limit=1, window_start=WINDOW)
        assert check_and_increment(db_session, key="k", limit=1, window_start=WINDOW) is False

        refund(db_session, key="k", window_start=WINDOW)

        assert check_and_increment(db_session, key="k", limit=1, window_start=WINDOW) is True

    def test_never_goes_below_zero(self, db_session: Session) -> None:
        check_and_increment(db_session, key="k", limit=2, window_start=WINDOW)

        refund(db_session, key="k", window_start=WINDOW)
        refund(db_session, key="k", window_start=WINDOW)

        assert counter_for(db_session, "k") == 0

    def test_an_unknown_row_is_a_no_op(self, db_session: Session) -> None:
        """Safe to call from an except branch that may run before the
        charge did."""
        refund(db_session, key="never-charged", window_start=WINDOW)

        assert counter_for(db_session, "never-charged") == 0


class TestAtomicity:
    """Runs outside the db_session fixture on purpose.

    That fixture keeps everything inside one uncommitted transaction on
    one connection, which is the opposite of what this needs: real
    concurrency means separate connections committing for real. The key
    is unique per run and deleted afterwards, so nothing leaks into the
    other tests.
    """

    def test_concurrent_increments_do_not_lose_updates(self) -> None:
        engine = create_engine(settings.resolved_test_url(), pool_pre_ping=True)
        make_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        key = f"atomicity-probe-{uuid4()}"
        workers, per_worker = 8, 25

        def hammer() -> None:
            with make_session() as session:
                for _ in range(per_worker):
                    check_and_increment(session, key=key, limit=10_000, window_start=WINDOW)

        try:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                for future in [pool.submit(hammer) for _ in range(workers)]:
                    future.result()

            with make_session() as session:
                row = session.get(UsageCounter, (key, WINDOW))
                # A read-compare-write implementation loses updates here:
                # two sessions read the same count and both write it back
                # incremented once. The single-statement version cannot,
                # because the read and the write are the same statement.
                assert row is not None
                assert row.count == workers * per_worker
        finally:
            with make_session() as session:
                session.execute(delete(UsageCounter).where(UsageCounter.key == key))
                session.commit()
            engine.dispose()

    def test_concurrent_calls_never_exceed_the_limit(self) -> None:
        """The property a budget actually promises. Losing an update
        undercounts; the failure that matters to a bill is the opposite —
        more calls served than the limit allowed."""
        engine = create_engine(settings.resolved_test_url(), pool_pre_ping=True)
        make_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        key = f"limit-probe-{uuid4()}"
        limit, attempts_each, workers = 10, 20, 8

        def hammer() -> int:
            granted = 0
            with make_session() as session:
                for _ in range(attempts_each):
                    if check_and_increment(session, key=key, limit=limit, window_start=WINDOW):
                        granted += 1
            return granted

        try:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                results = [f.result() for f in [pool.submit(hammer) for _ in range(workers)]]

            assert sum(results) == limit
        finally:
            with make_session() as session:
                session.execute(delete(UsageCounter).where(UsageCounter.key == key))
                session.commit()
            engine.dispose()
