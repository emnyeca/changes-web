"""Web adapter to the pinned desktop rendering and pattern planners."""
import base64
import json
from dataclasses import replace
import re
from changes.song_filter import filter_song_by_sections, transpose_song_model_preserving_structure, extract_section_ids

from changes.app_settings import AppSettings
from changes.digitone.bundle_planner import compile_timeline_to_digitone_bundle_plan
from changes.digitone.linear_split_planner import compile_timeline_to_digitone_linear_split_plan
from changes.importers.import_bundle import import_musicxml_with_midi
from changes.models.digitone_bundle_plan import digitone_pattern_bundle_plan_to_dict
from changes.models.rendered_timeline import rendered_timeline_to_dict
from changes.models.song_model import song_model_to_dict
from changes.ui_pipeline import compile_song_for_ui, song_to_syx_bytes_bundle, song_to_syx_bytes_linear_split


def generate(request):
    if request.get("cells"):
        from changes.editor import EditorState, editor_to_song_model
        song = editor_to_song_model(EditorState(title=request["title"],cells=request["cells"],
            tempo=request.get("tempo",120),meter=request.get("meter","4/4"),working_key=request.get("key","C")))
        warnings = []
    else:
        candidate = import_musicxml_with_midi(request["title"],request["xml"].encode(),
            base64.b64decode(request["midi"]) if request.get("midi") else None)
        song = replace(candidate.song,title=request["title"])
        warnings = candidate.warnings
    if request.get("tempo"):
        from fractions import Fraction
        song = replace(song,performance_tempo=Fraction(request["tempo"]))
    edits = request.get("edits", {})
    song = replace(song, measures=tuple(replace(m, harmony=tuple(
        replace(e, symbol=edits.get(e.id, e.symbol)) for e in m.harmony
    )) for m in song.measures))
    original = song_model_to_dict(song)
    if request.get("action") == "inspect":
        return original
    selected = request.get("sections")
    if selected is not None:
        song = filter_song_by_sections(song, set(selected))
    if not song.measures:
        raise ValueError("Select a section / セクションを選んでください")
    shift = int(request.get("transpose", 0))
    if request.get("action") == "fm-song" and request.get("target_key") not in (None, ""):
        from changes.note import pitch_class_to_semitone
        if not song.working_key:
            raise ValueError("Chart key unknown: use Transpose (semitones) / 譜面の調が未指定です。半音単位の移調を使用してください")
        shift = (int(request["target_key"]) - pitch_class_to_semitone(song.working_key)) % 12
    if shift:
        names = "C Db D Eb E F Gb G Ab A Bb B".split()
        def transposed(symbol):
            def pitch(match):
                letter, accidental = match.groups()
                pc = dict(C=0,D=2,E=4,F=5,G=7,A=9,B=11)[letter]
                return names[(pc + (accidental=="#") - (accidental=="b") + shift) % 12]
            return re.sub(r"(?:(?<=/)|^)([A-G])([#b]?)", pitch, symbol)
        song = transpose_song_model_preserving_structure(song, transposed, transposed)
    if request.get("action") == "fm-song":
        from fm_parts import encode_song
        return encode_song(song, request["id"])
    settings = AppSettings(**request.get("settings", {}))
    compiled = compile_song_for_ui(song, settings)
    if request.get("mode", "linear") == "bundle":
        planner = compile_timeline_to_digitone_bundle_plan
        encode = song_to_syx_bytes_bundle
    else:
        planner = compile_timeline_to_digitone_linear_split_plan
        encode = song_to_syx_bytes_linear_split
    plan = planner(song, compiled.timeline, compiled.target_profile)
    graph = [[{"voice": n.lane_id, "note": n.note_midi} for n in occ.cloud.notes]
             if occ.cloud else [] for occ in compiled.arrangement.occurrences]
    fm_parts, fm_error = [], None
    if request.get("id"):
        from fm_parts import encode_parts
        try:
            fm_parts = encode_parts(song, plan, request["id"])
        except (ValueError, IndexError, OverflowError) as exc:
            fm_error = str(exc)
    return {
        "fm_parts": fm_parts, "fm_error": fm_error,
        "song": song_model_to_dict(song), "original": original,
        "timeline": rendered_timeline_to_dict(compiled.timeline),
        "plan": digitone_pattern_bundle_plan_to_dict(plan),
        "graph": graph,
        "warnings": warnings,
        "files": [{"name": name, "data": base64.b64encode(data).decode("ascii")}
                  for name, data in encode(song, settings)],
    }
