"""Static dashboard generation from aggregate-only usage rows."""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import shutil
from dataclasses import asdict
from importlib import resources
from pathlib import Path
from typing import Any

from codex_usage_tracker.allowance import (
    annotate_rows_with_allowance,
    load_allowance_config,
    summarize_allowance_usage,
)
from codex_usage_tracker.dynamic_allowance import (
    DynamicAllowanceSnapshot,
    load_dynamic_claude_limit_snapshot,
    load_dynamic_codex_allowance_snapshot,
)
from codex_usage_tracker.limit_history import load_limit_history, record_limit_history
from codex_usage_tracker.paths import (
    DEFAULT_ALLOWANCE_PATH,
    DEFAULT_CLAUDE_LIMITS_PATH,
    DEFAULT_DASHBOARD_PATH,
    DEFAULT_LIMIT_HISTORY_PATH,
    DEFAULT_PRICING_PATH,
    DEFAULT_PROJECTS_PATH,
    DEFAULT_RATE_CARD_PATH,
    DEFAULT_THRESHOLDS_PATH,
)
from codex_usage_tracker.pricing import annotate_rows_with_efficiency, load_pricing_config
from codex_usage_tracker.projects import (
    annotate_rows_with_project_identity,
    apply_project_privacy_to_rows,
    load_project_config,
    project_privacy_metadata,
    validate_privacy_mode,
)
from codex_usage_tracker.recommendations import (
    annotate_rows_with_recommendations,
    load_threshold_config,
)
from codex_usage_tracker.store import (
    query_dashboard_event_count,
    query_dashboard_events,
    query_source_summaries,
    query_usage_record,
    refresh_metadata,
)
from codex_usage_tracker.threads import annotate_thread_attachments

_PAYLOAD_LIMIT_HISTORY_MAX = 500

_COMPACT_DASHBOARD_ROW_FIELDS = (
    "record_id",
    "session_id",
    "turn_id",
    "event_timestamp",
    "cwd",
    "model",
    "effort",
    "thread_source",
    "subagent_type",
    "agent_role",
    "agent_nickname",
    "parent_session_id",
    "parent_thread_name",
    "resolved_parent_thread_name",
    "source_provider",
    "source_app",
    "source_format",
    "total_tokens",
    "input_tokens",
    "cached_input_tokens",
    "cache_creation_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "cumulative_total_tokens",
    "uncached_input_tokens",
    "cache_ratio",
    "context_window_percent",
    "pricing_model",
    "pricing_estimated",
    "estimated_cost_usd",
    "estimated_cache_savings_usd",
    "efficiency_flags",
    "usage_credits",
    "usage_credit_confidence",
    "project_name",
    "project_key",
    "project_relative_cwd",
    "project_tags",
    "git_branch",
    "git_remote_label",
    "thread_attachment_key",
    "thread_attachment_label",
    "thread_attachment_relation",
    "thread_attachment_parent_session_id",
)


def dashboard_payload(
    db_path: Path,
    limit: int | None = 5000,
    offset: int = 0,
    pricing_path: Path = DEFAULT_PRICING_PATH,
    allowance_path: Path = DEFAULT_ALLOWANCE_PATH,
    rate_card_path: Path = DEFAULT_RATE_CARD_PATH,
    claude_limits_path: Path = DEFAULT_CLAUDE_LIMITS_PATH,
    codex_home: Path | None = None,
    since: str | None = None,
    until: str | None = None,
    api_token: str | None = None,
    context_api_enabled: bool = False,
    thresholds_path: Path = DEFAULT_THRESHOLDS_PATH,
    projects_path: Path = DEFAULT_PROJECTS_PATH,
    privacy_mode: str = "normal",
    include_archived: bool = True,
    compact_rows: bool = False,
    limit_history_path: Path = DEFAULT_LIMIT_HISTORY_PATH,
) -> dict[str, object]:
    """Return aggregate-only dashboard data without rendering HTML."""

    privacy_mode = validate_privacy_mode(privacy_mode)
    normalized_offset = _normalize_offset(offset)
    rows = annotate_thread_attachments(
        query_dashboard_events(
            db_path=db_path,
            limit=limit,
            offset=normalized_offset,
            since=since,
            until=until,
            include_archived=include_archived,
        )
    )
    pricing, allowance, claude_limits, thresholds, projects = _load_dashboard_support(
        pricing_path=pricing_path,
        allowance_path=allowance_path,
        rate_card_path=rate_card_path,
        claude_limits_path=claude_limits_path,
        codex_home=codex_home,
        thresholds_path=thresholds_path,
        projects_path=projects_path,
        include_archived=include_archived,
        limit_history_path=limit_history_path,
    )
    annotated_rows = _annotate_dashboard_rows(
        rows,
        pricing=pricing,
        allowance=allowance,
        thresholds=thresholds,
        projects=projects,
        privacy_mode=privacy_mode,
    )
    payload_rows = _compact_dashboard_rows(annotated_rows) if compact_rows else annotated_rows
    allowance_summary = summarize_allowance_usage(annotated_rows, allowance)
    normalized_limit = _normalize_limit(limit)
    total_available_rows = query_dashboard_event_count(
        db_path=db_path,
        since=since,
        until=until,
        include_archived=include_archived,
    )
    active_available_rows = query_dashboard_event_count(
        db_path=db_path,
        since=since,
        until=until,
        include_archived=False,
    )
    all_history_available_rows = query_dashboard_event_count(
        db_path=db_path,
        since=since,
        until=until,
        include_archived=True,
    )
    metadata = refresh_metadata(db_path)
    parser_diagnostics = {
        key.removeprefix("parser_"): _safe_int(value)
        for key, value in metadata.items()
        if key.startswith("parser_") and _safe_int(value)
    }
    return {
        "rows": payload_rows,
        "rows_compact": compact_rows,
        "pricing_configured": pricing.loaded and not pricing.error,
        "pricing_source": pricing.source,
        "pricing_snapshot": _pricing_snapshot(pricing.loaded, pricing.source, pricing.models),
        "allowance_configured": allowance.loaded and not allowance.error,
        "allowance_source": allowance_summary["source"],
        "allowance_window_source": allowance_summary["window_source"],
        "allowance_windows": allowance_summary["windows"],
        "allowance_error": allowance_summary["error"],
        "provider_limit_snapshots": _provider_limit_snapshots(
            allowance_summary,
            claude_limits,
        ),
        "provider_limit_history": load_limit_history(
            limit_history_path,
            max_entries=_PAYLOAD_LIMIT_HISTORY_MAX,
        ),
        "rate_card_configured": allowance_summary["rate_card_loaded"],
        "rate_card_error": allowance_summary["rate_card_error"],
        "loaded_row_count": len(rows),
        "total_available_rows": total_available_rows,
        "active_available_rows": active_available_rows,
        "all_history_available_rows": all_history_available_rows,
        "archived_available_rows": max(all_history_available_rows - active_available_rows, 0),
        "source_summaries": query_source_summaries(
            db_path=db_path,
            since=since,
            until=until,
            include_archived=include_archived,
        ),
        "include_archived": include_archived,
        "history_scope": "all-history" if include_archived else "active",
        "limit": normalized_limit,
        "offset": normalized_offset,
        "has_more": (
            normalized_limit is not None
            and normalized_offset + len(rows) < total_available_rows
        ),
        "next_offset": (
            normalized_offset + len(rows)
            if normalized_limit is not None
            and normalized_offset + len(rows) < total_available_rows
            else None
        ),
        "limit_label": "All" if normalized_limit is None else str(normalized_limit),
        "parser_diagnostics": parser_diagnostics,
        "parser_adapter": metadata.get("parser_adapter"),
        "api_token": api_token or "",
        "context_api_enabled": context_api_enabled,
        "action_thresholds": thresholds.thresholds,
        "thresholds_configured": thresholds.loaded and not thresholds.error,
        "thresholds_error": thresholds.error,
        "project_configured": projects.loaded and not projects.error,
        "project_config_error": projects.error,
        "privacy_mode": privacy_mode,
        "project_metadata_privacy": project_privacy_metadata(privacy_mode),
    }


def dashboard_record_payload(
    db_path: Path,
    record_id: str,
    pricing_path: Path = DEFAULT_PRICING_PATH,
    allowance_path: Path = DEFAULT_ALLOWANCE_PATH,
    rate_card_path: Path = DEFAULT_RATE_CARD_PATH,
    claude_limits_path: Path = DEFAULT_CLAUDE_LIMITS_PATH,
    codex_home: Path | None = None,
    thresholds_path: Path = DEFAULT_THRESHOLDS_PATH,
    projects_path: Path = DEFAULT_PROJECTS_PATH,
    privacy_mode: str = "normal",
    include_archived: bool = True,
    limit_history_path: Path = DEFAULT_LIMIT_HISTORY_PATH,
) -> dict[str, Any] | None:
    """Return one fully annotated aggregate usage row by record id."""

    privacy_mode = validate_privacy_mode(privacy_mode)
    row = query_usage_record(db_path=db_path, record_id=record_id)
    if row is None:
        return None
    pricing, allowance, _claude_limits, thresholds, projects = _load_dashboard_support(
        pricing_path=pricing_path,
        allowance_path=allowance_path,
        rate_card_path=rate_card_path,
        claude_limits_path=claude_limits_path,
        codex_home=codex_home,
        thresholds_path=thresholds_path,
        projects_path=projects_path,
        include_archived=include_archived,
        limit_history_path=limit_history_path,
    )
    annotated_rows = _annotate_dashboard_rows(
        [row],
        pricing=pricing,
        allowance=allowance,
        thresholds=thresholds,
        projects=projects,
        privacy_mode=privacy_mode,
    )
    return annotated_rows[0] if annotated_rows else None


def generate_dashboard(
    db_path: Path,
    output_path: Path = DEFAULT_DASHBOARD_PATH,
    limit: int | None = 5000,
    pricing_path: Path = DEFAULT_PRICING_PATH,
    allowance_path: Path = DEFAULT_ALLOWANCE_PATH,
    rate_card_path: Path = DEFAULT_RATE_CARD_PATH,
    claude_limits_path: Path = DEFAULT_CLAUDE_LIMITS_PATH,
    codex_home: Path | None = None,
    since: str | None = None,
    api_token: str | None = None,
    context_api_enabled: bool = False,
    thresholds_path: Path = DEFAULT_THRESHOLDS_PATH,
    projects_path: Path = DEFAULT_PROJECTS_PATH,
    privacy_mode: str = "normal",
    include_archived: bool = True,
    limit_history_path: Path = DEFAULT_LIMIT_HISTORY_PATH,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    guide_href = _dashboard_guide_href(output_path)
    asset_base = _dashboard_assets_href(output_path)
    stylesheet_href = _versioned_asset_href(output_path, asset_base, "dashboard.css")
    favicon_href = _versioned_asset_href(output_path, asset_base, "favicon.svg")
    format_script_src = _versioned_asset_href(output_path, asset_base, "dashboard_format.js")
    data_script_src = _versioned_asset_href(output_path, asset_base, "dashboard_data.js")
    state_script_src = _versioned_asset_href(output_path, asset_base, "dashboard_state.js")
    script_src = _versioned_asset_href(output_path, asset_base, "dashboard.js")
    previous_payload = _previous_dashboard_payload(output_path)
    payload_dict = dashboard_payload(
        db_path=db_path,
        limit=limit,
        pricing_path=pricing_path,
        allowance_path=allowance_path,
        rate_card_path=rate_card_path,
        claude_limits_path=claude_limits_path,
        codex_home=codex_home,
        since=since,
        api_token=api_token,
        context_api_enabled=context_api_enabled,
        thresholds_path=thresholds_path,
        projects_path=projects_path,
        privacy_mode=privacy_mode,
        include_archived=include_archived,
        limit_history_path=limit_history_path,
    )
    payload_dict["pricing_snapshot_warning"] = _pricing_snapshot_warning(
        previous_payload, payload_dict
    )
    payload = json.dumps(payload_dict, ensure_ascii=True).replace("</", "<\\/")
    output_path.write_text(
        _html(
            payload,
            guide_href=guide_href,
            stylesheet_href=stylesheet_href,
            favicon_href=favicon_href,
            format_script_src=format_script_src,
            data_script_src=data_script_src,
            state_script_src=state_script_src,
            script_src=script_src,
        ),
        encoding="utf-8",
    )
    return output_path


def _load_dashboard_support(
    pricing_path: Path,
    allowance_path: Path,
    rate_card_path: Path,
    claude_limits_path: Path,
    codex_home: Path | None,
    thresholds_path: Path,
    projects_path: Path,
    include_archived: bool,
    limit_history_path: Path = DEFAULT_LIMIT_HISTORY_PATH,
):
    pricing = load_pricing_config(pricing_path)
    dynamic_allowance = (
        load_dynamic_codex_allowance_snapshot(
            codex_home,
            include_archived=include_archived,
        )
        if codex_home is not None
        else None
    )
    if dynamic_allowance and dynamic_allowance.windows:
        record_limit_history(
            "openai",
            dynamic_allowance.windows,
            captured_at=dynamic_allowance.source.get("captured_at"),
            path=limit_history_path,
        )
    allowance = load_allowance_config(
        allowance_path,
        rate_card_path=rate_card_path,
        dynamic_windows=dynamic_allowance.windows if dynamic_allowance else None,
        dynamic_source=dynamic_allowance.source if dynamic_allowance else None,
    )
    claude_limits = load_dynamic_claude_limit_snapshot(claude_limits_path)
    thresholds = load_threshold_config(thresholds_path)
    projects = load_project_config(projects_path)
    return pricing, allowance, claude_limits, thresholds, projects


def _provider_limit_snapshots(
    allowance_summary: dict[str, Any],
    claude_limits: DynamicAllowanceSnapshot,
) -> dict[str, dict[str, Any]]:
    return {
        "openai": {
            "provider": "openai",
            "app": "codex",
            "label": "Codex Remaining",
            "configured": bool(allowance_summary["configured"] and not allowance_summary["error"]),
            "windows": allowance_summary["windows"],
            "source": allowance_summary["window_source"] or {},
            "error": allowance_summary["error"],
        },
        "anthropic": {
            "provider": "anthropic",
            "app": "claude-code",
            "label": "Claude Remaining",
            "configured": bool(claude_limits.windows and not claude_limits.error),
            "windows": [asdict(window) for window in claude_limits.windows],
            "source": claude_limits.source,
            "error": claude_limits.error,
        },
    }


def _annotate_dashboard_rows(
    rows: list[dict[str, Any]],
    pricing,
    allowance,
    thresholds,
    projects,
    privacy_mode: str,
) -> list[dict[str, Any]]:
    annotated_rows = annotate_rows_with_allowance(
        annotate_rows_with_efficiency(rows, pricing),
        allowance,
    )
    annotated_rows = annotate_rows_with_recommendations(annotated_rows, thresholds)
    annotated_rows = annotate_rows_with_project_identity(annotated_rows, projects)
    return apply_project_privacy_to_rows(annotated_rows, privacy_mode=privacy_mode)


def _compact_dashboard_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            key: row[key]
            for key in _COMPACT_DASHBOARD_ROW_FIELDS
            if key in row
        }
        for row in rows
    ]


def _normalize_limit(limit: int | None) -> int | None:
    if limit is None or limit <= 0:
        return None
    return int(limit)


def _normalize_offset(offset: int | None) -> int:
    if offset is None or offset <= 0:
        return 0
    return int(offset)


def _pricing_snapshot(
    loaded: bool,
    source: dict[str, Any] | None,
    models: dict[str, dict[str, float]],
) -> dict[str, Any]:
    if not loaded:
        return {"configured": False, "fingerprint": None}
    public_source = {
        key: value
        for key, value in (source or {}).items()
        if key
        in {
            "name",
            "url",
            "tier",
            "fetched_at",
            "model_count",
            "official_model_count",
            "estimated_model_count",
            "pinned",
            "pinned_at",
        }
    }
    public_source.setdefault("model_count", len(models))
    rates_fingerprint = hashlib.sha256(
        json.dumps(models, sort_keys=True, ensure_ascii=True).encode("utf-8")
    ).hexdigest()[:12]
    fingerprint = hashlib.sha256(
        json.dumps(
            {**public_source, "rates_fingerprint": rates_fingerprint},
            sort_keys=True,
            ensure_ascii=True,
        ).encode("utf-8")
    ).hexdigest()[:12]
    return {
        "configured": True,
        "fingerprint": fingerprint,
        "rates_fingerprint": rates_fingerprint,
        **public_source,
    }


def _pricing_snapshot_warning(
    previous_payload: dict[str, Any] | None, current_payload: dict[str, object]
) -> str | None:
    if not previous_payload:
        return None
    previous = previous_payload.get("pricing_snapshot")
    current = current_payload.get("pricing_snapshot")
    if not isinstance(previous, dict) or not isinstance(current, dict):
        return None
    previous_fingerprint = previous.get("fingerprint")
    current_fingerprint = current.get("fingerprint")
    if not previous_fingerprint or not current_fingerprint:
        return None
    if previous_fingerprint == current_fingerprint:
        return None
    previous_label = previous.get("fetched_at") or previous.get("pinned_at") or previous_fingerprint
    current_label = current.get("fetched_at") or current.get("pinned_at") or current_fingerprint
    return f"Pricing snapshot changed since the previous dashboard render: {previous_label} -> {current_label}."


def _previous_dashboard_payload(output_path: Path) -> dict[str, Any] | None:
    if not output_path.exists():
        return None
    try:
        text = output_path.read_text(encoding="utf-8")
    except OSError:
        return None
    match = _USAGE_DATA_RE.search(text)
    if not match:
        return None
    try:
        raw = json.loads(match.group("payload"))
    except json.JSONDecodeError:
        return None
    return raw if isinstance(raw, dict) else None


def _dashboard_guide_href(output_path: Path) -> str | None:
    override = os.environ.get("CODEX_USAGE_TRACKER_DOCS_URL")
    if override:
        return override
    try:
        docs_source = resources.files("codex_usage_tracker.plugin_data").joinpath("docs")
        docs_target = output_path.parent / "codex-usage-tracker-guide"
        if docs_target.exists():
            shutil.rmtree(docs_target)
        _copy_resource_tree(docs_source, docs_target)
    except (FileNotFoundError, ModuleNotFoundError, OSError):
        return None
    return "codex-usage-tracker-guide/dashboard-guide.html"


def _dashboard_assets_href(output_path: Path) -> str:
    assets_source = resources.files("codex_usage_tracker.plugin_data").joinpath("dashboard")
    assets_target = output_path.parent / "codex-usage-tracker-assets"
    _copy_resource_tree(assets_source, assets_target)
    return "codex-usage-tracker-assets"


def _versioned_asset_href(output_path: Path, asset_base: str, filename: str) -> str:
    asset_path = output_path.parent / asset_base / filename
    try:
        digest = hashlib.sha256(asset_path.read_bytes()).hexdigest()[:12]
    except OSError:
        return f"{asset_base}/{filename}"
    return f"{asset_base}/{filename}?v={digest}"


def _copy_resource_tree(source: Any, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        destination = target / child.name
        if child.is_dir():
            _copy_resource_tree(child, destination)
        else:
            _copy_resource_file(child, destination)


def _copy_resource_file(source: Any, destination: Path) -> None:
    content = source.read_bytes()
    if destination.exists():
        try:
            if destination.read_bytes() == content:
                return
        except OSError:
            return
    try:
        destination.write_bytes(content)
    except OSError:
        if not destination.exists():
            raise


def _html(
    payload: str,
    guide_href: str | None = None,
    *,
    stylesheet_href: str = "codex-usage-tracker-assets/dashboard.css",
    favicon_href: str = "codex-usage-tracker-assets/favicon.svg",
    format_script_src: str = "codex-usage-tracker-assets/dashboard_format.js",
    data_script_src: str = "codex-usage-tracker-assets/dashboard_data.js",
    state_script_src: str = "codex-usage-tracker-assets/dashboard_state.js",
    script_src: str = "codex-usage-tracker-assets/dashboard.js",
) -> str:
    template = _read_dashboard_asset("dashboard_template.html")
    guide_link = (
        f'<a class="guide-link" href="{html.escape(guide_href, quote=True)}">Dashboard guide</a>'
        if guide_href
        else ""
    )
    return (
        template.replace("__TITLE__", html.escape("AI Usage Dashboard"))
        .replace("__STYLESHEET_HREF__", html.escape(stylesheet_href, quote=True))
        .replace("__FAVICON_HREF__", html.escape(favicon_href, quote=True))
        .replace("__GUIDE_LINK__", guide_link)
        .replace("__PAYLOAD__", payload)
        .replace("__FORMAT_SCRIPT_SRC__", html.escape(format_script_src, quote=True))
        .replace("__DATA_SCRIPT_SRC__", html.escape(data_script_src, quote=True))
        .replace("__STATE_SCRIPT_SRC__", html.escape(state_script_src, quote=True))
        .replace("__SCRIPT_SRC__", html.escape(script_src, quote=True))
    )


def _read_dashboard_asset(name: str) -> str:
    asset = resources.files("codex_usage_tracker.plugin_data").joinpath("dashboard", name)
    return asset.read_text(encoding="utf-8")


def _safe_int(value: object) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return 0


_USAGE_DATA_RE = re.compile(
    r'<script id="usage-data" type="application/json">(?P<payload>.*?)</script>',
    re.DOTALL,
)
