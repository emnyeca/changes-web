"""Encode the same planner segments on the FM-1's original quarter-note clock."""
import base64
import re
import struct
from uuid import UUID

from changes.emiuet_resolver_core import resolver_core_pitch_classes
from changes.harmonic_context import chord_tone_pitch_classes, resolve_scale_collection_with_retry
from changes.note import pitch_class_to_semitone


def tick(value):
    result = value * 24
    if int(result) != result or not 0 <= result <= 65535:
        raise ValueError("FM-1 position outside 24 PPQN / FM-1の拍位置の範囲外です")
    return int(result)


def label(text):
    if not re.fullmatch(r"[ -~]{1,31}", text):
        raise ValueError("FM-1 labels require 1–31 ASCII characters / FM-1の表記は半角31文字までです")
    return text.encode("ascii") + b"\0"


def voicing(symbol, core):
    # Keep the slash bass and a characteristic extension before filling the shell.
    tones = chord_tone_pitch_classes(symbol)
    bass = pitch_class_to_semitone(symbol.split("/")[-1]) if "/" in symbol else core[0]
    extra = sorted(set(tones) - set(core), key=lambda pc: (pc-core[0]) % 12)
    pcs = list(dict.fromkeys([bass, *extra[:1], *core[1:2], *core[-1:], *core, *extra]))[:4]
    notes = [48 + pcs[0]]
    for pc in (pcs * 4)[1:4]:
        notes.append(notes[-1]+1+(pc-notes[-1]-1)%12)
    return notes


def encode_parts(song, plan, source_id):
    events = [(m, e) for m in song.measures for e in m.harmony]
    symbols = [e.symbol for _, e in events]
    parts = []
    for index, part in enumerate(plan.patterns):
        start = (part.global_step_start-1)*plan.timing.q_step
        end = part.global_step_end*plan.timing.q_step
        entries = []
        meters = set()
        for i,(m,e) in enumerate(events):
            at = m.absolute_start_quarters + e.offset_quarters
            if at >= end or at + e.duration_quarters <= start:
                continue
            meters.add((m.meter_numerator,m.meter_denominator))
            core = resolver_core_pitch_classes(e.symbol)
            lpc,_ = resolve_scale_collection_with_retry(symbols,i)
            entries.append(struct.pack("<HHH4BHH", tick(max(at,start)-start),
                sum(1<<n for n in set(core)),sum(1<<n for n in set(lpc)),
                *voicing(e.symbol,core), e.measure_number,tick(e.offset_quarters+max(0,start-at))) + label(e.symbol))
        if not entries or entries[0][:2]!=b"\0\0" or len(entries)>192 or len(meters)!=1:
            raise ValueError("Unsupported FM-1 part structure / FM-1で未対応のパート構成です")
        numerator,denominator=meters.pop()
        if denominator!=4 or not 1<=numerator<=12 or not 30<=song.performance_tempo<=300 or song.performance_tempo.denominator!=1:
            raise ValueError("Unsupported FM-1 meter or BPM / FM-1で未対応の拍子またはBPMです")
        key=pitch_class_to_semitone(song.working_key or "C")
        body=UUID(source_id).bytes+struct.pack("<BHBBBHB",index,int(song.performance_tempo),key,0,numerator,tick(end-start),len(entries))
        body+=label(part.pattern_name)+b"".join(entries)
        parts.append(base64.b64encode(struct.pack("<H",len(body)+2)+body).decode())
    return parts
