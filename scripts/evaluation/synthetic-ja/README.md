# Synthetic Japanese comparison fixtures

Generated 2026-10-16 with pyopenjtalk-plus 0.4.1.post9 and its bundled default HTS voice. Texts are original test scripts. WAV: mono 16-bit PCM, 16 kHz; generated 48 kHz audio is downsampled by averaging three adjacent samples. No external AI API or personal audio is used.

These are synthetic speech fixtures, **not recordings of human speech**, an iPad microphone test, or a general accuracy benchmark. The colloquial script tests wording, not natural spontaneous prosody. This small set must not justify broad accuracy or safety claims.

Reproduction: install `pyopenjtalk-plus==0.4.1.post9` and numpy, then run `python3 scripts/generate-synthetic-ja.py` from the repository root. The optional local synthesis dependency is not an app dependency.

The synthesizer uses the default Open JTalk HTS voice distributed with pyopenjtalk-plus. See upstream package voice/license notices: https://github.com/tsukumijima/pyopenjtalk-plus . The generated audio fixtures contain only the original texts in cases.json.

Voice attribution: HTS Voice “Mei”, released by the MMDAgent Project Team, Copyright (c) 2009–2013 Nagoya Institute of Technology, Department of Computer Science. Licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); upstream notice is retained in `VOICE-LICENSE.txt`. These fixtures synthesize the original test scripts and resample the result; no endorsement is implied.
