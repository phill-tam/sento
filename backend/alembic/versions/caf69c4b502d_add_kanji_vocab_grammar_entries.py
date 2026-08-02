"""add kanji vocab grammar entries

Revision ID: caf69c4b502d
Revises: 
Create Date: 2026-08-02 15:24:57.349417

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'caf69c4b502d'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Created once, explicitly, and referenced with create_type=False below —
    # autogenerate emits sa.Enum(..., name='content_status') fresh in each of
    # the three create_table calls, which would issue CREATE TYPE three times
    # and fail on the second table with "type already exists".
    content_status = postgresql.ENUM(
        'DRAFT', 'SUGGESTED', 'APPROVED', name='content_status'
    )
    content_source = postgresql.ENUM(
        'MANUAL', 'LLM_SUGGESTED', name='content_source'
    )
    content_status.create(op.get_bind())
    content_source.create(op.get_bind())

    op.create_table('grammar_entries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('pattern', sa.String(), nullable=False),
    sa.Column('meaning_en', sa.String(), nullable=False),
    sa.Column('example_jp', sa.Text(), nullable=True),
    sa.Column('example_reading', sa.Text(), nullable=True),
    sa.Column('example_en', sa.Text(), nullable=True),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('jlpt_level', sa.String(), server_default='N5', nullable=False),
    sa.Column('status', postgresql.ENUM('DRAFT', 'SUGGESTED', 'APPROVED', name='content_status', create_type=False), nullable=False),
    sa.Column('source', postgresql.ENUM('MANUAL', 'LLM_SUGGESTED', name='content_source', create_type=False), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_grammar_entries_category'), 'grammar_entries', ['category'], unique=False)
    op.create_table('kanji_entries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('character', sa.String(), nullable=False),
    sa.Column('meaning_en', sa.String(), nullable=False),
    sa.Column('onyomi', sa.String(), nullable=True),
    sa.Column('kunyomi', sa.String(), nullable=True),
    sa.Column('compound_word', sa.String(), nullable=True),
    sa.Column('compound_reading', sa.String(), nullable=True),
    sa.Column('compound_meaning_en', sa.String(), nullable=True),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('jlpt_level', sa.String(), server_default='N5', nullable=False),
    sa.Column('status', postgresql.ENUM('DRAFT', 'SUGGESTED', 'APPROVED', name='content_status', create_type=False), nullable=False),
    sa.Column('source', postgresql.ENUM('MANUAL', 'LLM_SUGGESTED', name='content_source', create_type=False), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_kanji_entries_category'), 'kanji_entries', ['category'], unique=False)
    op.create_table('vocab_entries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('word', sa.String(), nullable=False),
    sa.Column('reading', sa.String(), nullable=True),
    sa.Column('meaning_en', sa.String(), nullable=False),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('jlpt_level', sa.String(), server_default='N5', nullable=False),
    sa.Column('status', postgresql.ENUM('DRAFT', 'SUGGESTED', 'APPROVED', name='content_status', create_type=False), nullable=False),
    sa.Column('source', postgresql.ENUM('MANUAL', 'LLM_SUGGESTED', name='content_source', create_type=False), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vocab_entries_category'), 'vocab_entries', ['category'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_vocab_entries_category'), table_name='vocab_entries')
    op.drop_table('vocab_entries')
    op.drop_index(op.f('ix_kanji_entries_category'), table_name='kanji_entries')
    op.drop_table('kanji_entries')
    op.drop_index(op.f('ix_grammar_entries_category'), table_name='grammar_entries')
    op.drop_table('grammar_entries')

    # Types must drop last — tables reference them, so dropping types first
    # would fail with a dependency error.
    postgresql.ENUM(name='content_status').drop(op.get_bind())
    postgresql.ENUM(name='content_source').drop(op.get_bind())
    # ### end Alembic commands ###