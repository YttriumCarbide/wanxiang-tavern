"""Generate original layered game SFX, so the project needs no sampled asset licence.

Run with the modeling/audio venv:
  ..\\建模工具\\.venv\\Scripts\\python.exe tools\\audio\\build_sfx.py
"""

import json
import math
import wave
from pathlib import Path

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "audio" / "sfx"
RNG = np.random.default_rng(20261018)


def count(duration):
    return max(1, int(round(duration * SR)))


def times(duration):
    return np.arange(count(duration), dtype=np.float64) / SR


def pulse(duration, attack=0.004, tau=0.14):
    t = times(duration)
    return np.minimum(1, t / max(0.0001, attack)) * np.exp(-t / max(0.001, tau))


def hold_env(duration, attack=0.01, release=0.08):
    n = count(duration)
    t = np.arange(n, dtype=np.float64) / SR
    env = np.ones(n)
    a = min(n, count(attack))
    r = min(n, count(release))
    if a:
        env[:a] = np.linspace(0, 1, a)
    if r:
        env[-r:] *= np.linspace(1, 0, r)
    return env


def sweep(from_hz, to_hz, duration, curve=1.0):
    t = times(duration)
    x = np.linspace(0, 1, len(t)) ** curve
    frequency = from_hz + (to_hz - from_hz) * x
    return np.sin(2 * math.pi * np.cumsum(frequency) / SR)


def tone(freq, duration, kind="sine", detune=0.0):
    t = times(duration)
    f = np.atleast_1d(np.asarray(freq, dtype=np.float64))
    if len(f) == 1:
        f = np.full(len(t), f[0])
    phase = 2 * math.pi * np.cumsum(f) / SR
    if kind == "triangle":
        return 2 / math.pi * np.arcsin(np.sin(phase + detune))
    if kind == "saw":
        return 2 * ((phase / (2 * math.pi)) % 1) - 1
    if kind == "square":
        return np.sign(np.sin(phase + detune))
    return np.sin(phase + detune)


def noise(duration):
    return RNG.normal(0, 1, count(duration))


def spectral(x, low=None, high=None, resonance=2.0):
    spectrum = np.fft.rfft(x)
    frequencies = np.fft.rfftfreq(len(x), 1 / SR)
    response = np.ones_like(frequencies)
    if low:
        response *= 1 / (1 + (frequencies / low) ** (2 * resonance))
    if high:
        response *= 1 / (1 + (high / np.maximum(1, frequencies)) ** (2 * resonance))
    return np.fft.irfft(spectrum * response, len(x))


def whoosh(duration, low, high, attack=0.02, tau=0.18):
    breath = noise(duration) * pulse(duration, attack, tau)
    return spectral(breath, low, high, resonance=1.4)


def thump(from_hz, to_hz, duration, tau=0.09):
    return sweep(from_hz, to_hz, duration) * pulse(duration, 0.002, tau)


def pluck(frequency, duration, tau=0.1, harmonics=0.35):
    fundamental = tone(frequency, duration) * pulse(duration, 0.002, tau)
    second = tone(frequency * 2.01, duration) * pulse(duration, 0.002, tau * 0.55)
    third = tone(frequency * 3.02, duration) * pulse(duration, 0.001, tau * 0.35)
    return fundamental + second * harmonics + third * harmonics * 0.35


def bell(frequency, duration, tau=0.18, brightness=1.0):
    signal = np.zeros(count(duration))
    for ratio, level, scale in [
        (1.0, 0.8, 1.0),
        (2.01, 0.44, 0.7),
        (2.98, 0.25, 0.5),
        (4.18, 0.15 * brightness, 0.35),
    ]:
        signal += tone(frequency * ratio, duration) * pulse(duration, 0.002, tau * scale) * level
    return signal


def crackle(duration, density=28, low=700, high=6000):
    result = np.zeros(count(duration))
    for _ in range(density):
        at = RNG.uniform(0, duration * 0.82)
        length = RNG.uniform(0.008, 0.04)
        burst = noise(length) * pulse(length, 0.001, length * 0.35)
        burst = spectral(burst, low, high, 1.0)
        offset = min(len(result), int(at * SR))
        take = min(len(burst), len(result) - offset)
        if take > 0:
            result[offset : offset + take] += burst[:take] * RNG.uniform(0.1, 0.5)
    return result


def mix(duration, layers):
    result = np.zeros(count(duration))
    for signal, at, level in layers:
        offset = max(0, int(at * SR))
        take = min(len(signal), len(result) - offset)
        if take > 0:
            result[offset : offset + take] += signal[:take] * level
    return result


def reverb(signal, mix_amount=0.2, decay=0.25):
    tail = np.zeros(int(decay * SR))
    tail[:] = noise(len(tail) / SR)[: len(tail)] * np.exp(
        -np.arange(len(tail)) / (SR * decay * 0.38)
    )
    tail = spectral(tail, high=180, resonance=1.0)
    wet = np.convolve(signal, tail)[: len(signal)]
    peak = np.max(np.abs(wet)) or 1
    wet /= peak
    return signal * (1 - mix_amount) + wet * (max(np.max(np.abs(signal)), 0.02) * mix_amount)


def normalize(signal, peak=0.9):
    signal = np.asarray(signal, dtype=np.float64)
    signal = np.nan_to_num(signal)
    high = np.max(np.abs(signal))
    if high > 0:
        signal = signal / high * peak
    fade = min(count(0.004), len(signal))
    if fade:
        signal[:fade] *= np.linspace(0, 1, fade)
        signal[-fade:] *= np.linspace(1, 0, fade)
    return signal


def write(name, signal):
    signal = normalize(signal)
    data = np.int16(np.clip(signal, -1, 1) * 32767)
    path = OUT / f"{name}.wav"
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(data.tobytes())
    return len(data)


def weapon_sounds():
    sounds = {}
    bow = mix(
        0.62,
        [
            (thump(165, 58, 0.18, 0.065), 0, 0.55),
            (pluck(250, 0.34, 0.09, 0.8), 0.01, 0.22),
            (whoosh(0.4, 1600, 7200, 0.018, 0.15), 0.015, 0.34),
            (sweep(1050, 360, 0.14), 0.01, 0.07),
        ],
    )
    sounds["bow"] = reverb(bow, 0.18, 0.2)
    sounds["bow-hit"] = reverb(
        mix(
            0.34,
            [
                (thump(190, 62, 0.13, 0.045), 0, 0.7),
                (spectral(noise(0.09), high=900), 0.005, 0.2),
                (pluck(410, 0.12, 0.04, 1.2), 0.01, 0.16),
                (spectral(noise(0.05), low=1800, high=7000), 0.015, 0.18),
            ],
        ),
        0.12,
        0.15,
    )
    sword = mix(
        0.48,
        [
            (whoosh(0.3, 1200, 7600, 0.012, 0.12), 0, 0.38),
            (sweep(760, 170, 0.22, 1.5), 0.005, 0.13),
            (bell(2450, 0.2, 0.045, 1.4), 0.015, 0.11),
        ],
    )
    sounds["sword"] = reverb(sword, 0.16, 0.18)
    clash = np.zeros(count(0.52))
    for i, (frequency, level, tau) in enumerate(
        [(1720, 0.3, 0.16), (2460, 0.24, 0.12), (3380, 0.18, 0.09), (4720, 0.12, 0.06)]
    ):
        clash += bell(frequency, 0.52, tau, 1.4) * level
    sounds["sword-hit"] = reverb(
        mix(
            0.52,
            [
                (clash, 0, 0.62),
                (thump(135, 48, 0.2, 0.07), 0, 0.55),
                (spectral(noise(0.08), low=1400, high=9000), 0.002, 0.25),
            ],
        ),
        0.2,
        0.28,
    )
    staff = mix(
        0.74,
        [
            (whoosh(0.46, 420, 3600, 0.04, 0.24), 0, 0.3),
            (sweep(240, 690, 0.4, 0.8), 0.01, 0.2),
            (tone(554, 0.55) * pulse(0.55, 0.04, 0.2), 0.08, 0.09),
            (bell(880, 0.5, 0.22, 1.2), 0.17, 0.13),
            (thump(110, 80, 0.3, 0.14), 0, 0.12),
        ],
    )
    sounds["staff"] = reverb(staff, 0.26, 0.4)
    sounds["staff-hit"] = reverb(
        mix(
            0.58,
            [
                (bell(760, 0.55, 0.18, 1.1), 0, 0.32),
                (bell(1170, 0.45, 0.14, 1.3), 0.01, 0.2),
                (whoosh(0.32, 500, 4200, 0.008, 0.1), 0, 0.25),
                (thump(145, 52, 0.2, 0.075), 0, 0.38),
            ],
        ),
        0.22,
        0.3,
    )
    return sounds


def enemy_attack(style):
    if style == "slime-bounce":
        return reverb(
            mix(
                0.34,
                [
                    (sweep(190, 380, 0.2, 0.7), 0, 0.25),
                    (whoosh(0.28, 220, 1100, 0.01, 0.1), 0, 0.3),
                    (thump(110, 62, 0.22, 0.1), 0.05, 0.18),
                ],
            ),
            0.12,
        )
    if style == "mushroom-bonk":
        return mix(
            0.3,
            [
                (pluck(265, 0.16, 0.055, 1.4), 0, 0.36),
                (thump(180, 82, 0.16, 0.06), 0, 0.4),
                (spectral(noise(0.1), low=240, high=1400), 0, 0.2),
            ],
        )
    if style == "pebble-shards":
        return mix(
            0.4,
            [
                (spectral(noise(0.24), low=1500, high=9000), 0, 0.28),
                (crackle(0.3, 20, 1800, 9000), 0, 0.3),
                (thump(105, 55, 0.2, 0.08), 0.04, 0.22),
            ],
        )
    if style == "claw-pounce":
        return reverb(
            mix(
                0.42,
                [
                    (whoosh(0.3, 900, 7000, 0.012, 0.12), 0, 0.38),
                    (tone(105, 0.28, "saw") * pulse(0.28, 0.02, 0.1), 0, 0.09),
                    (crackle(0.22, 10, 1600, 6500), 0, 0.12),
                ],
            ),
            0.13,
        )
    if style == "stone-slam":
        return reverb(
            mix(
                0.52,
                [
                    (thump(106, 32, 0.4, 0.16), 0, 0.72),
                    (spectral(noise(0.35), low=45, high=1100), 0.01, 0.3),
                    (crackle(0.18, 8, 1200, 6500), 0, 0.08),
                ],
            ),
            0.16,
            0.32,
        )
    if style == "ember-bolt":
        return reverb(
            mix(
                0.42,
                [
                    (whoosh(0.32, 600, 4800, 0.008, 0.1), 0, 0.32),
                    (tone(220, 0.3) * pulse(0.3, 0.01, 0.09), 0, 0.16),
                    (crackle(0.3, 25, 1400, 9000), 0.03, 0.22),
                ],
            ),
            0.14,
        )
    if style == "gate-crush":
        return reverb(
            mix(
                0.72,
                [
                    (thump(72, 28, 0.5, 0.2), 0, 0.66),
                    (bell(370, 0.45, 0.2, 0.8), 0, 0.16),
                    (whoosh(0.26, 120, 1500, 0.005, 0.08), 0, 0.22),
                    (crackle(0.25, 12, 400, 5000), 0.02, 0.12),
                ],
            ),
            0.2,
            0.45,
        )
    if style == "spore-volley":
        return reverb(
            mix(
                0.4,
                [
                    (whoosh(0.32, 300, 2600, 0.06, 0.15), 0, 0.3),
                    (tone(480, 0.25) * pulse(0.25, 0.04, 0.15), 0, 0.08),
                    (crackle(0.24, 8, 500, 2500), 0, 0.08),
                ],
            ),
            0.12,
        )
    if style == "crystal-ram":
        return reverb(
            mix(
                0.48,
                [
                    (bell(650, 0.42, 0.2, 1.8), 0, 0.3),
                    (bell(1020, 0.34, 0.12, 1.6), 0.02, 0.17),
                    (whoosh(0.3, 1200, 7000, 0.005, 0.1), 0, 0.2),
                    (thump(125, 48, 0.18, 0.06), 0, 0.24),
                ],
            ),
            0.17,
            0.3,
        )
    if style == "cinder-spark":
        return mix(
            0.34,
            [
                (crackle(0.28, 32, 1200, 8000), 0, 0.4),
                (whoosh(0.18, 500, 4000, 0.005, 0.06), 0, 0.18),
                (thump(120, 55, 0.14, 0.05), 0.03, 0.2),
            ],
        )
    if style == "tide-ribbon":
        return reverb(
            mix(
                0.48,
                [
                    (whoosh(0.38, 200, 3000, 0.025, 0.16), 0, 0.34),
                    (bell(830, 0.4, 0.18, 1.1), 0.05, 0.16),
                    (tone(310, 0.35) * pulse(0.35, 0.04, 0.13), 0, 0.1),
                ],
            ),
            0.2,
        )
    if style == "astral-cascade":
        result = np.zeros(count(0.8))
        for index, frequency in enumerate([392, 523.25, 659.25, 783.99, 1046.5]):
            at = index * 0.07
            result = mix(
                0.8,
                [
                    (result, 0, 1),
                    (bell(frequency, 0.55, 0.2, 1.2), at, 0.12),
                ],
            )
        return reverb(
            mix(
                0.8,
                [
                    (result, 0, 1),
                    (thump(90, 55, 0.3, 0.12), 0, 0.18),
                ],
            ),
            0.2,
            0.35,
        )
    raise KeyError(style)


def enemy_hit(style):
    if style == "slime-bounce":
        return mix(
            0.3,
            [
                (thump(210, 58, 0.2, 0.075), 0, 0.65),
                (whoosh(0.18, 220, 1000, 0.004, 0.06), 0, 0.3),
            ],
        )
    if style == "mushroom-bonk":
        return reverb(
            mix(
                0.3,
                [
                    (pluck(360, 0.12, 0.04, 1.5), 0, 0.4),
                    (thump(145, 65, 0.16, 0.07), 0, 0.38),
                    (spectral(noise(0.06), low=240, high=1200), 0, 0.16),
                ],
            ),
            0.12,
        )
    if style == "pebble-shards":
        return mix(
            0.36,
            [
                (spectral(noise(0.11), low=1300, high=8500), 0, 0.38),
                (crackle(0.22, 14, 1500, 8000), 0.02, 0.3),
                (thump(95, 45, 0.22, 0.07), 0, 0.3),
            ],
        )
    if style == "claw-pounce":
        return mix(
            0.3,
            [
                (spectral(noise(0.12), low=1500, high=8000), 0, 0.38),
                (crackle(0.18, 12, 900, 6000), 0, 0.24),
                (thump(150, 65, 0.16, 0.06), 0.015, 0.28),
            ],
        )
    if style == "stone-slam":
        return reverb(
            mix(
                0.48,
                [
                    (thump(88, 30, 0.36, 0.14), 0, 0.8),
                    (spectral(noise(0.2), low=50, high=900), 0.02, 0.3),
                ],
            ),
            0.18,
            0.28,
        )
    if style == "ember-bolt":
        return reverb(
            mix(
                0.34,
                [
                    (crackle(0.26, 24, 1500, 8500), 0, 0.4),
                    (thump(130, 52, 0.18, 0.07), 0, 0.4),
                    (whoosh(0.16, 600, 4000, 0.002, 0.05), 0, 0.24),
                ],
            ),
            0.15,
        )
    if style == "gate-crush":
        return reverb(
            mix(
                0.58,
                [
                    (thump(74, 28, 0.4, 0.16), 0, 0.76),
                    (bell(390, 0.3, 0.1, 1.0), 0, 0.18),
                    (spectral(noise(0.18), low=80, high=2200), 0, 0.27),
                ],
            ),
            0.18,
            0.36,
        )
    if style == "spore-volley":
        return reverb(
            mix(
                0.35,
                [
                    (whoosh(0.28, 280, 2400, 0.03, 0.1), 0, 0.35),
                    (crackle(0.18, 8, 500, 2600), 0, 0.12),
                    (thump(190, 90, 0.14, 0.06), 0, 0.18),
                ],
            ),
            0.12,
        )
    if style == "crystal-ram":
        return reverb(
            mix(
                0.4,
                [
                    (bell(920, 0.34, 0.1, 1.8), 0, 0.35),
                    (spectral(noise(0.12), low=1800, high=9500), 0, 0.25),
                    (thump(120, 48, 0.18, 0.06), 0, 0.26),
                ],
            ),
            0.16,
        )
    if style == "cinder-spark":
        return mix(
            0.3,
            [
                (crackle(0.24, 28, 1200, 8000), 0, 0.4),
                (thump(135, 48, 0.16, 0.06), 0, 0.3),
            ],
        )
    if style == "tide-ribbon":
        return reverb(
            mix(
                0.38,
                [
                    (whoosh(0.28, 220, 2600, 0.01, 0.08), 0, 0.34),
                    (bell(620, 0.3, 0.1, 1.0), 0, 0.2),
                    (thump(140, 65, 0.14, 0.05), 0, 0.2),
                ],
            ),
            0.18,
        )
    if style == "astral-cascade":
        return reverb(
            mix(
                0.55,
                [
                    (bell(784, 0.4, 0.14, 1.2), 0, 0.25),
                    (bell(523, 0.35, 0.12, 1.2), 0.03, 0.2),
                    (thump(85, 42, 0.28, 0.1), 0, 0.3),
                ],
            ),
            0.2,
        )
    raise KeyError(style)


def ui_and_game_sounds():
    sounds = {}
    sounds["click"] = mix(
        0.09,
        [
            (pluck(840, 0.07, 0.018, 1.4), 0, 0.35),
            (spectral(noise(0.025), low=1800, high=7000), 0, 0.07),
        ],
    )
    sounds["select"] = reverb(
        mix(
            0.24,
            [
                (bell(659, 0.18, 0.08, 0.8), 0, 0.2),
                (bell(988, 0.2, 0.09, 0.7), 0.055, 0.14),
            ],
        ),
        0.14,
    )
    sounds["skill"] = reverb(
        mix(
            0.3,
            [
                (sweep(740, 1100, 0.18), 0, 0.16),
                (bell(1480, 0.2, 0.07, 1.2), 0.02, 0.1),
                (whoosh(0.14, 500, 4000, 0.004, 0.05), 0, 0.08),
            ],
        ),
        0.12,
    )
    sounds["drag"] = whoosh(0.16, 900, 4200, 0.006, 0.05) * 0.35
    sounds["queue"] = mix(
        0.18,
        [
            (pluck(440, 0.1, 0.03, 1.1), 0, 0.3),
            (pluck(660, 0.1, 0.035, 1.1), 0.055, 0.22),
        ],
    )
    sounds["cancel"] = (
        tone(660, 0.13) * pulse(0.13, 0.005, 0.06) * 0.22
        + tone(np.linspace(660, 330, count(0.13)), 0.13) * pulse(0.13, 0.005, 0.06) * 0.08
    )
    sounds["error"] = mix(
        0.28,
        [
            (thump(150, 118, 0.12, 0.045), 0, 0.42),
            (thump(142, 105, 0.12, 0.045), 0.1, 0.3),
        ],
    )
    sounds["gate"] = reverb(
        mix(
            0.9,
            [
                (whoosh(0.7, 70, 1300, 0.04, 0.38), 0, 0.32),
                (thump(90, 48, 0.45, 0.16), 0.06, 0.32),
                (bell(330, 0.55, 0.2, 0.8), 0.12, 0.1),
            ],
        ),
        0.24,
        0.5,
    )
    sounds["round"] = reverb(
        mix(
            0.38,
            [
                (bell(523, 0.28, 0.12, 0.9), 0, 0.2),
                (bell(659, 0.3, 0.14, 0.8), 0.07, 0.16),
            ],
        ),
        0.16,
    )
    sounds["exchange"] = mix(
        0.3,
        [
            (whoosh(0.22, 900, 5200, 0.008, 0.07), 0, 0.24),
            (pluck(540, 0.1, 0.03, 1.1), 0.06, 0.24),
        ],
    )
    sounds["cast"] = reverb(
        mix(
            0.55,
            [
                (sweep(320, 820, 0.38, 0.7), 0, 0.2),
                (bell(660, 0.4, 0.16, 1.0), 0.06, 0.14),
                (whoosh(0.3, 500, 3200, 0.02, 0.12), 0, 0.15),
            ],
        ),
        0.22,
    )
    sounds["combine"] = reverb(
        mix(
            1.08,
            [
                (sweep(180, 660, 0.76, 0.82), 0, 0.24),
                (bell(523.25, 0.96, 0.31, 1.2), 0.05, 0.17),
                (bell(783.99, 0.9, 0.27, 1.1), 0.16, 0.14),
                (bell(1046.5, 0.82, 0.22, 1.0), 0.28, 0.11),
                (whoosh(0.82, 320, 5400, 0.045, 0.3), 0, 0.2),
                (thump(95, 42, 0.52, 0.18), 0, 0.24),
            ],
        ),
        0.27,
        0.46,
    )
    sounds["heal"] = reverb(
        mix(
            0.62,
            [
                (bell(523.25, 0.55, 0.24, 0.8), 0, 0.14),
                (bell(659.25, 0.52, 0.22, 0.8), 0.06, 0.12),
                (bell(783.99, 0.58, 0.25, 0.8), 0.12, 0.1),
            ],
        ),
        0.24,
        0.35,
    )
    sounds["shield"] = reverb(
        mix(
            0.42,
            [
                (bell(330, 0.32, 0.12, 1.1), 0, 0.2),
                (bell(495, 0.3, 0.1, 1.1), 0.03, 0.12),
                (whoosh(0.2, 400, 2600, 0.01, 0.08), 0, 0.12),
            ],
        ),
        0.18,
    )
    victory = np.zeros(count(1.25))
    for index, frequency in enumerate([523.25, 659.25, 783.99, 1046.5]):
        victory = mix(
            1.25,
            [
                (victory, 0, 1),
                (bell(frequency, 0.8, 0.3, 0.9), index * 0.12, 0.14),
            ],
        )
    drum = thump(95, 55, 0.4, 0.16) * 0.2
    victory[: len(drum)] += drum
    sounds["victory"] = reverb(victory, 0.28, 0.45)
    defeat = mix(
        0.95,
        [
            (tone(np.linspace(294, 277, count(0.55)), 0.55) * pulse(0.55, 0.01, 0.3), 0, 0.24),
            (tone(np.linspace(247, 233, count(0.6)), 0.6) * pulse(0.6, 0.01, 0.34), 0.17, 0.22),
            (tone(np.linspace(196, 160, count(0.85)), 0.85) * pulse(0.85, 0.01, 0.45), 0.36, 0.2),
        ],
    )
    sounds["defeat"] = reverb(defeat, 0.24, 0.45)
    sounds["boss-death-charge"] = reverb(
        mix(
            0.85,
            [
                (sweep(70, 180, 0.7, 1.4), 0, 0.32),
                (whoosh(0.55, 120, 1800, 0.05, 0.3), 0, 0.2),
                (bell(260, 0.5, 0.18, 1.2), 0.18, 0.1),
            ],
        ),
        0.2,
        0.4,
    )
    sounds["boss-death-break"] = reverb(
        mix(
            1.1,
            [
                (thump(100, 28, 0.85, 0.28), 0, 0.7),
                (spectral(noise(0.45), low=50, high=2200), 0, 0.32),
                (bell(940, 0.55, 0.18, 1.5), 0.05, 0.12),
                (crackle(0.42, 22, 800, 7000), 0.08, 0.12),
            ],
        ),
        0.22,
        0.5,
    )
    sounds["boss-death-tail"] = reverb(
        mix(
            1.55,
            [
                (bell(1175, 1.3, 0.45, 0.8), 0, 0.18),
                (bell(1568, 1.1, 0.38, 0.8), 0.12, 0.12),
                (whoosh(0.9, 300, 3000, 0.04, 0.5), 0, 0.1),
            ],
        ),
        0.28,
        0.7,
    )
    return sounds


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    sounds = {}
    sounds.update(weapon_sounds())
    for style in [
        "slime-bounce",
        "mushroom-bonk",
        "pebble-shards",
        "claw-pounce",
        "stone-slam",
        "ember-bolt",
        "gate-crush",
        "spore-volley",
        "crystal-ram",
        "cinder-spark",
        "tide-ribbon",
        "astral-cascade",
    ]:
        sounds[style] = enemy_attack(style)
        sounds[style + "-hit"] = enemy_hit(style)
    sounds.update(ui_and_game_sounds())
    manifest = []
    for name, signal in sounds.items():
        frames = write(name, signal)
        manifest.append(
            {
                "name": name,
                "file": f"assets/audio/sfx/{name}.wav",
                "seconds": round(frames / SR, 3),
                "bytes": (OUT / f"{name}.wav").stat().st_size,
            }
        )
        print(f"{name:24} {frames / SR:5.2f}s {(OUT / (name + '.wav')).stat().st_size:7d} bytes")
    (OUT / "manifest.json").write_text(
        json.dumps({"format": "16-bit mono PCM", "sampleRate": SR, "sounds": manifest}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(sounds)} original SFX to {OUT}")


if __name__ == "__main__":
    build()
