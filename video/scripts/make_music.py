"""Original soundtrack for the promo video, synthesized from scratch (no samples, no licensing).

Arc: suspense (A minor drone, heartbeat, ticking, riser) -> tension (accelerating pulse while the
pipeline runs) -> relief (C major resolves exactly when "Matched to a past fix" appears) -> warm,
confident groove under the feature shots -> a final resolve and fade on the outro.

Cue times below follow src/Root.jsx. If you change scene lengths there, update CUES and re-run:
    python scripts/make_music.py        (writes public/music.wav and public/music.m4a)
"""

import os
import wave

import numpy as np

SR = 44100
CUES = {
    "hook": 0.0,        # error types out
    "error_hit": 1.4,   # red flash
    "logs": 3.5,        # wall of logs
    "reveal": 8.0,      # logo
    "pipeline": 12.0,   # first stage lights up at +1.5 s, then one per second
    "relief": 19.5,     # "Matched to a past fix in 2.2 seconds."
    "features": 23.0,   # screen recordings
    "arch": 57.5,       # architecture
    "outro": 65.5,      # name + GitHub
    "end": 74.5,
}
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT

N = int(CUES["end"] * SR)
t_all = np.arange(N) / SR
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def hz(note):
    """'A3' -> frequency. Sharps only (C, C#, D … B)."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names.index(name) + 12 * (octave + 1) - 69) / 12)


def span(start, end):
    a, b = int(start * SR), min(N, int(end * SR))
    return a, b, np.arange(b - a) / SR


def add(start, sig, pan=0.0, gain=1.0):
    a = int(start * SR)
    b = min(N, a + len(sig))
    if b <= a:
        return
    sig = sig[: b - a] * gain
    L[a:b] += sig * np.sqrt(0.5 * (1 - pan))
    R[a:b] += sig * np.sqrt(0.5 * (1 + pan))


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a scalar or a per-sample array."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    alpha = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha[i] * (x[i] - acc)
        y[i] = acc
    return y


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    env = np.ones(n) * s
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    ai = min(ai, n)
    env[:ai] = np.linspace(0, 1, ai, endpoint=False)
    de = min(n, ai + di)
    env[ai:de] = np.linspace(1, s, de - ai, endpoint=False)
    if ri and n > ri:
        env[n - ri :] *= np.linspace(1, 0, ri)
    return env


def saw(freq, t, harmonics=12):
    return sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, harmonics + 1)) * (2 / np.pi)


def pad(notes, start, dur, gain=0.12, attack=0.8, release=1.2, bright=1400):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = adsr(n, a=attack, d=0.3, s=0.85, r=release)
    for k, note in enumerate(notes):
        f = hz(note)
        for detune, pan in ((-0.25, -0.5), (0.25, 0.5)):
            tone = lowpass(saw(f + detune, t, 8), bright)
            add(start, tone * env, pan=pan * (0.6 + 0.1 * k), gain=gain / len(notes))


def pluck(note, start, dur=0.35, gain=0.08, pan=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(note)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    add(start, tone * np.exp(-t * 9), pan=pan, gain=gain)


def bell(note, start, gain=0.07, pan=0.0):
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    f = hz(note)
    tone = np.sin(2 * np.pi * f * t + 1.4 * np.sin(2 * np.pi * f * 3.5 * t) * np.exp(-t * 3))
    add(start, tone * np.exp(-t * 1.6), pan=pan, gain=gain)


def kick(start, gain=0.5):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 90 * np.exp(-t * 35)
    add(start, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9), gain=gain)


def thump(start, gain=0.55):
    """Heartbeat: a low, soft lub."""
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 38 + 30 * np.exp(-t * 25)
    add(start, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14), gain=gain)


def hat(start, gain=0.03, pan=0.2, decay=60):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 6000)
    add(start, hp * np.exp(-t * decay), pan=pan, gain=gain)


def tick(start, gain=0.05):
    n = int(0.02 * SR)
    t = np.arange(n) / SR
    add(start, np.sin(2 * np.pi * 2900 * t) * np.exp(-t * 400), pan=0.3, gain=gain)


def noise_swell(start, end, gain=0.18, cut_from=300, cut_to=7000, rise=True):
    a, b, t = span(start, end)
    n = b - a
    x = rng.standard_normal(n)
    ramp = np.linspace(0, 1, n) ** 2 if rise else np.linspace(1, 0, n) ** 2
    cut = cut_from + (cut_to - cut_from) * ramp
    y = lowpass(x, cut) * ramp
    add(start, y, pan=-0.2, gain=gain)
    add(start, lowpass(rng.standard_normal(n), cut) * ramp, pan=0.2, gain=gain)


def impact(start, gain=0.6):
    kick(start, gain=gain)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    add(start, lowpass(rng.standard_normal(n), 900) * np.exp(-t * 3.5), gain=gain * 0.35)


# ---------------------------------------------------------------- suspense: 0 – 12 s
a, b, t = span(0, CUES["relief"] + 0.4)
drone_env = np.clip(t / 6, 0, 1) * 0.8 + 0.2
drone_env *= np.where(t > CUES["relief"] - 0.1, np.clip(1 - (t - (CUES["relief"] - 0.1)) / 0.5, 0, 1), 1)
drone = lowpass(saw(hz("A1"), t, 10) + saw(hz("A1") * 1.006, t, 10), 260 + 220 * np.clip(t / 19, 0, 1))
add(0, drone * drone_env, gain=0.17)
# a minor second above, barely there: unease
add(0, np.sin(2 * np.pi * hz("A#2") * t) * drone_env * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t)), pan=0.4, gain=0.035)
# high, nervous tremolo
add(CUES["logs"], (np.sin(2 * np.pi * hz("E6") * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * t)) * np.clip((t - 0) / 4, 0, 1))[: int((CUES["relief"] - CUES["logs"]) * SR)], pan=-0.4, gain=0.012)

# heartbeat speeds up: 60 -> 84 -> 110 bpm
for bpm, s0, s1 in ((60, 0.2, CUES["reveal"]), (84, CUES["reveal"], CUES["pipeline"]), (110, CUES["pipeline"], CUES["relief"] - 0.2)):
    tt = s0
    while tt < s1:
        thump(tt, 0.36)
        thump(tt + 0.22, 0.22)
        tt += 60 / bpm

impact(CUES["error_hit"], 0.5)                         # the red flash
for k in range(int((CUES["pipeline"] - CUES["logs"]) / 0.3)):  # clock ticking under the logs
    tick(CUES["logs"] + k * 0.3, 0.045 if k % 2 == 0 else 0.03)
noise_swell(CUES["logs"] + 0.5, CUES["reveal"], gain=0.09)    # riser into the logo
impact(CUES["reveal"], 0.55)
pad(["A2", "B3", "E4"], CUES["reveal"], CUES["pipeline"] - CUES["reveal"] + 0.6, gain=0.16, attack=0.4, bright=900)  # Asus2: unresolved

# ---------------------------------------------------------------- tension: pipeline 12 – 19.5 s
step = BEAT / 2
k = 0
tt = CUES["pipeline"]
arp = ["A3", "C4", "E4", "A4"]
while tt < CUES["relief"] - 0.05:
    prog = (tt - CUES["pipeline"]) / (CUES["relief"] - CUES["pipeline"])
    pluck(arp[k % 4], tt, gain=0.045 + 0.05 * prog, pan=-0.3 if k % 2 else 0.3)
    k += 1
    tt += step
for i, note in enumerate(["E5", "G5", "A5", "C6", "D6", "E6"]):   # one blip per stage lighting up
    pluck(note, CUES["pipeline"] + 1.5 + i * 1.0, dur=0.5, gain=0.07, pan=-0.5 + i * 0.2)
noise_swell(CUES["relief"] - 1.6, CUES["relief"], gain=0.11, cut_from=500, cut_to=9000)

# ---------------------------------------------------------------- relief: 19.5 s
impact(CUES["relief"], 0.45)
pad(["C3", "G3", "C4", "E4", "G4"], CUES["relief"], CUES["features"] - CUES["relief"] + 1.5, gain=0.5, attack=0.06, release=1.6, bright=2600)
for i, note in enumerate(["C6", "E6", "G6", "C7"]):
    bell(note, CUES["relief"] + i * 0.12, gain=0.1, pan=-0.3 + i * 0.2)

# ---------------------------------------------------------------- groove: features + architecture
PROG = [("C", ["C3", "G3", "E4"], ["C4", "E4", "G4", "E4"]),
        ("G", ["G2", "D3", "B3"], ["B3", "D4", "G4", "D4"]),
        ("Am", ["A2", "E3", "C4"], ["C4", "E4", "A4", "E4"]),
        ("F", ["F2", "C3", "A3"], ["A3", "C4", "F4", "C4"])]
bar_i = 0
tt = CUES["features"]
while tt < CUES["outro"] - 0.01:
    name, chord, arp = PROG[bar_i % 4]
    dur = min(BAR, CUES["outro"] - tt)
    pad(chord, tt, dur + 0.3, gain=0.3, attack=0.25, release=0.5, bright=2000)
    root = chord[0][:-1] + str(int(chord[0][-1]) - 1) if int(chord[0][-1]) > 1 else chord[0]
    for beat in range(4):
        bt = tt + beat * BEAT
        if bt >= CUES["outro"]:
            break
        if beat in (0, 2):
            kick(bt, 0.45)
        pluck(root, bt, dur=0.45, gain=0.16)                      # bass
        for half in (0, 0.5):
            hat(bt + half * BEAT, 0.022 if half else 0.03)
        if tt >= CUES["arch"]:                                     # architecture: busier hats
            hat(bt + 0.25 * BEAT, 0.015, pan=-0.3)
            hat(bt + 0.75 * BEAT, 0.015, pan=-0.3)
        for j in range(2):                                         # arpeggio 8ths
            pluck(arp[(beat * 2 + j) % 4], bt + j * BEAT / 2, dur=0.3, gain=0.06, pan=0.35 if j else -0.35)
    bar_i += 1
    tt += BAR
noise_swell(CUES["arch"] - 1.2, CUES["arch"], gain=0.06, cut_from=800, cut_to=8000)

# ---------------------------------------------------------------- outro: resolve and fade
o = CUES["outro"]
pad(["F2", "C3", "A3", "C4"], o, BAR, gain=0.3, attack=0.1, release=0.4)
pad(["G2", "D3", "B3", "D4"], o + BAR, BAR * 0.75, gain=0.3, attack=0.1, release=0.4)
final = o + BAR * 1.75
pad(["C2", "G2", "C3", "E3", "G3", "C4", "E4"], final, CUES["end"] - final, gain=0.45, attack=0.05, release=2.5, bright=2400)
impact(final, 0.35)
for i, note in enumerate(["G5", "C6", "E6", "G6"]):
    bell(note, final + 0.15 + i * 0.18, gain=0.05, pan=-0.3 + i * 0.2)
kick(o, 0.3)
kick(o + BAR, 0.3)

# ---------------------------------------------------------------- mix: small room reverb, fades, limit
def reverb(x, seconds=1.8, mix=0.22):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 3.2)
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x + mix * wet


L, R = reverb(L), reverb(R)
fade_in = np.clip(t_all / 0.15, 0, 1)
fade_out = np.clip((CUES["end"] - t_all) / 3.5, 0, 1)
L *= fade_in * fade_out
R *= fade_in * fade_out
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = np.tanh(L / peak * 1.1) * 0.89, np.tanh(R / peak * 1.1) * 0.89   # gentle soft-clip to about -1 dBFS

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "music.wav")
pcm = (np.stack([L, R], axis=1) * 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {os.path.normpath(out)} ({CUES['end']} s)")

# Compressed copy for the video (the WAV stays local; the .m4a is small enough to commit).
import shutil
import subprocess

ffmpeg = os.path.join(os.path.dirname(out), "..", "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
ffmpeg = ffmpeg if os.path.exists(ffmpeg) else shutil.which("ffmpeg")
if ffmpeg:
    m4a = out[:-4] + ".m4a"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", out, "-c:a", "aac", "-b:a", "192k", "-f", "mp4", m4a], check=True)
    print(f"wrote {os.path.normpath(m4a)}")
else:
    print("ffmpeg not found: run `npm install` in video/ to get Remotion's bundled ffmpeg, then re-run")
