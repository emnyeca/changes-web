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


def varuint(value):
    data = bytearray()
    while value >= 128:
        data.append(128 | (value & 127))
        value >>= 7
    data.append(value)
    return data


def encode_song(song, source_id):
    """One continuous FM-1 chart, independent of Digitone patterns and tracks."""
    meters = {(m.meter_numerator, m.meter_denominator) for m in song.measures}
    if len(meters) != 1:
        raise ValueError("FM-1: mixed meters / 拍子が変わる曲は転送できません")
    beats, denominator = meters.pop()
    if denominator != 4 or not 1 <= beats <= 12:
        raise ValueError("FM-1: unsupported meter / 未対応の拍子です")
    bpm = song.performance_tempo
    if not 30 <= bpm <= 300 or bpm.denominator != 1:
        raise ValueError("FM-1: set a whole-number tempo from 30 to 300 / テンポは整数30〜300で指定してください")
    events = [(m.absolute_start_quarters + e.offset_quarters, e.symbol)
              for m in song.measures for e in m.harmony]
    if not events or events[0][0] != 0 or len(events) > 1024:
        raise ValueError("FM-1: expected 1–1024 chord events starting on beat one / 曲頭から最大1024コードに対応します")
    symbols = [symbol for _, symbol in events]
    dictionary = {}
    sequence = bytearray()
    previous = 0
    for i, (at, symbol) in enumerate(events):
        onset = tick(at)
        if i and onset <= previous:
            raise ValueError("FM-1: chord times overlap / コードの開始時刻が重複しています")
        core = resolver_core_pitch_classes(symbol)
        lpc, _ = resolve_scale_collection_with_retry(symbols, i)
        masks = sum(1 << n for n in set(core)) | (sum(1 << n for n in set(lpc)) << 12)
        entry = masks.to_bytes(3, "little") + bytes(voicing(symbol, core)) + label(symbol)
        sequence += varuint(onset - previous) + varuint(dictionary.setdefault(entry, len(dictionary)))
        previous = onset
    title = song.title.encode("ascii", "replace")[:31] or b"Song"
    duration = tick(song.measures[-1].absolute_start_quarters + beats)
    key = pitch_class_to_semitone(song.working_key or "C")
    header = UUID(source_id).bytes + struct.pack("<BHBBBHB", 0, int(bpm), key, 0, beats, duration, 0)
    body = header + bytes(max(32, min(126, c)) for c in title) + b"\0"
    body += struct.pack("<HH", len(events), len(dictionary)) + b"".join(dictionary) + sequence
    if len(body) + 2 > 16384:
        raise ValueError("FM-1: song exceeds 16 KiB / 1曲の上限16 KiBを超えています")
    return base64.b64encode(struct.pack("<H", len(body) + 2) + body).decode()
